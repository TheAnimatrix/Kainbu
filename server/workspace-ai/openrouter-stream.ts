import {
    WORKSPACE_AI_CACHE_BREAKPOINT_KEY,
    WORKSPACE_AI_MAX_TOKENS,
    WORKSPACE_AI_PROMPT_CACHE_ENABLED,
    WORKSPACE_AI_STREAM_DELTA_THROTTLE_MS,
} from "./constants.js";
import { getProviderApiKey } from "../openrouter-key.js";
import { OpenRouterTools } from "./tools.js";
import type { AiModelProvider } from "../../src/lib/kainbu/types.js";

export type OpenRouterMessage = Record<string, unknown>;

type ProviderModelConfig = { model: string; thinking: unknown; provider?: AiModelProvider };

type ProviderRequestTarget = {
    endpoint: string;
    headers: Record<string, string>;
};

const PROVIDER_ENDPOINTS: Record<AiModelProvider, string> = {
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    vercel: "https://ai-gateway.vercel.sh/v1/chat/completions",
};

const resolveProvider = (modelConfig: ProviderModelConfig): AiModelProvider =>
    modelConfig.provider === "vercel" ? "vercel" : "openrouter";

/** Resolve the chat-completions endpoint, key, and headers for a model's provider. */
const resolveProviderTarget = async (
    provider: AiModelProvider
): Promise<ProviderRequestTarget> => {
    const apiKey = await getProviderApiKey(provider);
    if (!apiKey) {
        throw new Error(
            provider === "vercel"
                ? "Missing AI_GATEWAY_API_KEY"
                : "Missing OPENROUTER_API_KEY"
        );
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
    };
    // OpenRouter attributes traffic via these headers; the Vercel Gateway ignores them.
    if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://kainbu.test";
        headers["X-Title"] = "Kainbu";
    }

    return { endpoint: PROVIDER_ENDPOINTS[provider], headers };
};

/**
 * Both OpenRouter and the Vercel AI Gateway accept a `reasoning` object on the
 * OpenAI-compatible endpoint, but the Gateway expects `{ enabled, max_tokens }`
 * rather than OpenRouter's `{ type, budget_tokens, level }` shape.
 */
const buildReasoningBody = (thinking: unknown, provider: AiModelProvider) => {
    if (!thinking || typeof thinking !== "object") return undefined;
    if (provider !== "vercel") return thinking;

    const config = thinking as Record<string, unknown>;
    const budget =
        typeof config.budget_tokens === "number" ? config.budget_tokens : undefined;
    return budget ? { enabled: true, max_tokens: budget } : { enabled: true };
};

export type StreamDeltaHandlers = {
    onContentDelta?: (text: string, accumulated: string) => void;
    onReasoningDelta?: (text: string, accumulated: string) => void;
};

export type StreamedCompletion = {
    content: string;
    reasoning: string;
    toolCalls: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
    }>;
};

export type OpenRouterUsage = {
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
    costUsd?: number;
};

const extractDeltaText = (delta: Record<string, unknown>) => {
    if (typeof delta.content === "string") return delta.content;
    if (Array.isArray(delta.content)) {
        return delta.content
            .map((part) => {
                if (!part || typeof part !== "object") return "";
                const entry = part as Record<string, unknown>;
                return typeof entry.text === "string" ? entry.text : "";
            })
            .join("");
    }
    return "";
};

const extractReasoningText = (delta: Record<string, unknown>) => {
    if (typeof delta.reasoning === "string") return delta.reasoning;
    if (typeof delta.reasoning_content === "string") return delta.reasoning_content;
    return "";
};

export const extractUsageFromResponse = (response: unknown): OpenRouterUsage => {
    if (!response || typeof response !== "object") return {};
    const usage = (response as Record<string, unknown>).usage;
    if (!usage || typeof usage !== "object") return {};

    const record = usage as Record<string, unknown>;
    const details =
        record.prompt_tokens_details && typeof record.prompt_tokens_details === "object"
            ? (record.prompt_tokens_details as Record<string, unknown>)
            : {};

    const costRaw =
        record.cost ??
        record.total_cost ??
        (record.cost_details && typeof record.cost_details === "object"
            ? (record.cost_details as Record<string, unknown>).total
            : undefined);

    return {
        promptTokens: typeof record.prompt_tokens === "number" ? record.prompt_tokens : undefined,
        completionTokens:
            typeof record.completion_tokens === "number" ? record.completion_tokens : undefined,
        cachedTokens:
            typeof details.cached_tokens === "number"
                ? details.cached_tokens
                : typeof record.cache_read_input_tokens === "number"
                  ? record.cache_read_input_tokens
                  : undefined,
        costUsd: typeof costRaw === "number" ? costRaw : undefined,
    };
};

const CACHE_CONTROL = { type: "ephemeral" } as const;

/** Remove the transient cache-breakpoint marker so it never reaches the wire. */
const stripCacheMarker = (message: OpenRouterMessage): OpenRouterMessage => {
    if (!(WORKSPACE_AI_CACHE_BREAKPOINT_KEY in message)) return message;
    const rest = { ...message };
    delete rest[WORKSPACE_AI_CACHE_BREAKPOINT_KEY];
    return rest;
};

/** Attach a prompt-cache breakpoint to a message by moving cache_control into its content. */
const withCacheBreakpoint = (message: OpenRouterMessage): OpenRouterMessage => {
    const rest = { ...message };
    delete rest[WORKSPACE_AI_CACHE_BREAKPOINT_KEY];

    if (typeof rest.content === "string") {
        return {
            ...rest,
            content: [{ type: "text", text: rest.content, cache_control: CACHE_CONTROL }],
        };
    }

    if (Array.isArray(rest.content) && rest.content.length > 0) {
        const parts = rest.content.slice();
        const lastIndex = parts.length - 1;
        const lastPart = parts[lastIndex];
        if (lastPart && typeof lastPart === "object") {
            parts[lastIndex] = { ...(lastPart as Record<string, unknown>), cache_control: CACHE_CONTROL };
            return { ...rest, content: parts };
        }
    }

    // Cannot place a marker on this shape — return without one (marker already removed).
    return rest;
};

/**
 * Apply cache_control to the first system message (static prefix) and to any message tagged
 * with the transient breakpoint marker (end of the stable history prefix). The marker is always
 * stripped, even when caching is disabled, so it never leaks onto the wire.
 */
export const prepareMessagesForOpenRouter = (
    messages: OpenRouterMessage[],
    options: { promptCache?: boolean } = {}
): OpenRouterMessage[] => {
    const cacheEnabled = Boolean(options.promptCache) && WORKSPACE_AI_PROMPT_CACHE_ENABLED;

    if (!cacheEnabled) {
        return messages.map(stripCacheMarker);
    }

    let cachedStatic = false;
    return messages.map((message) => {
        if (message[WORKSPACE_AI_CACHE_BREAKPOINT_KEY]) {
            return withCacheBreakpoint(message);
        }
        if (!cachedStatic && message.role === "system" && typeof message.content === "string") {
            cachedStatic = true;
            return {
                role: "system",
                content: [{ type: "text", text: message.content, cache_control: CACHE_CONTROL }],
            };
        }
        return message;
    });
};

const buildRequestBody = (
    messages: OpenRouterMessage[],
    modelConfig: ProviderModelConfig,
    options: { stream: boolean; useTools: boolean; promptCache?: boolean }
) => {
    const provider = resolveProvider(modelConfig);
    const body: Record<string, unknown> = {
        model: modelConfig.model,
        max_tokens: WORKSPACE_AI_MAX_TOKENS,
        messages: prepareMessagesForOpenRouter(messages, { promptCache: options.promptCache }),
        stream: options.stream,
    };
    const reasoning = buildReasoningBody(modelConfig.thinking, provider);
    if (reasoning) {
        body.reasoning = reasoning;
    }
    if (options.useTools) {
        body.tools = OpenRouterTools;
        body.tool_choice = "auto";
    }
    return body;
};

export const fetchCompletionJson = async (
    messages: OpenRouterMessage[],
    useTools: boolean,
    modelConfig: ProviderModelConfig,
    options: { promptCache?: boolean } = {}
): Promise<{ response: unknown; usage: OpenRouterUsage }> => {
    const provider = resolveProvider(modelConfig);
    const target = await resolveProviderTarget(provider);

    const body = buildRequestBody(messages, modelConfig, {
        stream: false,
        useTools,
        promptCache: options.promptCache,
    });

    const res = await fetch(target.endpoint, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`AI provider error (${provider}): ` + (await res.text()));
    const response = await res.json();
    return { response, usage: extractUsageFromResponse(response) };
};

export const fetchCompletionStream = async (
    messages: OpenRouterMessage[],
    modelConfig: ProviderModelConfig,
    handlers: StreamDeltaHandlers = {},
    options: { promptCache?: boolean } = {}
): Promise<StreamedCompletion> => {
    const provider = resolveProvider(modelConfig);
    const target = await resolveProviderTarget(provider);

    const body = buildRequestBody(messages, modelConfig, {
        stream: true,
        useTools: false,
        promptCache: options.promptCache,
    });

    const res = await fetch(target.endpoint, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`AI provider error (${provider}): ` + (await res.text()));
    if (!res.body) throw new Error(`AI provider (${provider}) returned an empty stream.`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    const toolCallsByIndex = new Map<
        number,
        { id: string; type: string; function: { name: string; arguments: string } }
    >();
    let lastEmitAt = 0;

    const maybeEmit = (force: boolean) => {
        const now = Date.now();
        if (!force && now - lastEmitAt < WORKSPACE_AI_STREAM_DELTA_THROTTLE_MS) return;
        lastEmitAt = now;
        handlers.onContentDelta?.(content.slice(-80), content);
        if (reasoning) handlers.onReasoningDelta?.(reasoning.slice(-80), reasoning);
    };

    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let lineBreak = buffer.indexOf("\n");
        while (lineBreak !== -1) {
            const line = buffer.slice(0, lineBreak).trim();
            buffer = buffer.slice(lineBreak + 1);

            if (line.startsWith("data:")) {
                const data = line.slice(5).trim();
                if (data === "[DONE]") {
                    maybeEmit(true);
                    return {
                        content,
                        reasoning,
                        toolCalls: [...toolCallsByIndex.entries()]
                            .sort(([a], [b]) => a - b)
                            .map(([, call]) => call),
                    };
                }

                if (data) {
                    try {
                        const parsed = JSON.parse(data) as Record<string, unknown>;
                        const choices = parsed.choices;
                        if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
                            const choice = choices[0] as Record<string, unknown>;
                            const delta =
                                choice.delta && typeof choice.delta === "object"
                                    ? (choice.delta as Record<string, unknown>)
                                    : {};

                            const contentDelta = extractDeltaText(delta);
                            if (contentDelta) {
                                content += contentDelta;
                                maybeEmit(false);
                            }

                            const reasoningDelta = extractReasoningText(delta);
                            if (reasoningDelta) {
                                reasoning += reasoningDelta;
                                maybeEmit(false);
                            }

                            const toolCalls = delta.tool_calls;
                            if (Array.isArray(toolCalls)) {
                                for (const entry of toolCalls) {
                                    if (!entry || typeof entry !== "object") continue;
                                    const tc = entry as Record<string, unknown>;
                                    const index =
                                        typeof tc.index === "number" ? tc.index : toolCallsByIndex.size;
                                    const existing = toolCallsByIndex.get(index) || {
                                        id: typeof tc.id === "string" ? tc.id : "",
                                        type: "function",
                                        function: { name: "", arguments: "" },
                                    };
                                    if (typeof tc.id === "string") existing.id = tc.id;
                                    const fn =
                                        tc.function && typeof tc.function === "object"
                                            ? (tc.function as Record<string, unknown>)
                                            : null;
                                    if (fn) {
                                        if (typeof fn.name === "string") existing.function.name = fn.name;
                                        if (typeof fn.arguments === "string") {
                                            existing.function.arguments += fn.arguments;
                                        }
                                    }
                                    toolCallsByIndex.set(index, existing);
                                }
                            }
                        }
                    } catch {
                        // skip malformed chunks
                    }
                }
            }

            lineBreak = buffer.indexOf("\n");
        }

        if (done) break;
    }

    maybeEmit(true);
    return {
        content,
        reasoning,
        toolCalls: [...toolCallsByIndex.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, call]) => call),
    };
};
