import {
    WORKSPACE_AI_MAX_TOKENS,
    WORKSPACE_AI_PROMPT_CACHE_ENABLED,
    WORKSPACE_AI_STREAM_DELTA_THROTTLE_MS,
} from "./constants.js";
import { getEnv } from "../env.js";
import { OpenRouterTools } from "./tools.js";

export type OpenRouterMessage = Record<string, unknown>;

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
    };
};

/** Apply cache_control to the first system message only (stable prefix). */
export const prepareMessagesForOpenRouter = (
    messages: OpenRouterMessage[],
    options: { promptCache?: boolean } = {}
): OpenRouterMessage[] => {
    if (!options.promptCache || !WORKSPACE_AI_PROMPT_CACHE_ENABLED) {
        return messages;
    }

    let cachedStatic = false;
    return messages.map((message) => {
        if (cachedStatic || message.role !== "system") return message;
        if (typeof message.content !== "string") return message;

        cachedStatic = true;
        return {
            role: "system",
            content: [
                {
                    type: "text",
                    text: message.content,
                    cache_control: { type: "ephemeral" },
                },
            ],
        };
    });
};

const buildRequestBody = (
    messages: OpenRouterMessage[],
    modelConfig: { model: string; thinking: unknown },
    options: { stream: boolean; useTools: boolean; promptCache?: boolean }
) => {
    const body: Record<string, unknown> = {
        model: modelConfig.model,
        max_tokens: WORKSPACE_AI_MAX_TOKENS,
        messages: prepareMessagesForOpenRouter(messages, { promptCache: options.promptCache }),
        stream: options.stream,
    };
    if (modelConfig.thinking) {
        body.reasoning = modelConfig.thinking;
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
    modelConfig: { model: string; thinking: unknown },
    options: { promptCache?: boolean } = {}
): Promise<{ response: unknown; usage: OpenRouterUsage }> => {
    const apiKey = getEnv("OPENROUTER_API_KEY", "");
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    const body = buildRequestBody(messages, modelConfig, {
        stream: false,
        useTools,
        promptCache: options.promptCache,
    });

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://kainbu.test",
            "X-Title": "Kainbu",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("OpenRouter error: " + (await res.text()));
    const response = await res.json();
    return { response, usage: extractUsageFromResponse(response) };
};

export const fetchCompletionStream = async (
    messages: OpenRouterMessage[],
    modelConfig: { model: string; thinking: unknown },
    handlers: StreamDeltaHandlers = {},
    options: { promptCache?: boolean } = {}
): Promise<StreamedCompletion> => {
    const apiKey = getEnv("OPENROUTER_API_KEY", "");
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    const body = buildRequestBody(messages, modelConfig, {
        stream: true,
        useTools: false,
        promptCache: options.promptCache,
    });

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://kainbu.test",
            "X-Title": "Kainbu",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("OpenRouter error: " + (await res.text()));
    if (!res.body) throw new Error("OpenRouter returned an empty stream.");

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
