/**
 * Vercel AI SDK wrapper for OpenRouter and Vercel Gateway API calls.
 *
 * Replaces hand-rolled SSE parsing with the AI SDK's `streamText`/`generateText`,
 * giving us proper cost tracking, normalized usage, and less brittle code.
 *
 * Usage (via openrouter-stream.ts fallback):
 *   import { fetchCompletionJson, fetchCompletionStream } from './openrouter-stream.js';
 *   // same API as before — tries AI SDK first, falls back to manual SSE parsing
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { OpenAIProvider } from '@ai-sdk/openai';
import { generateText, streamText, jsonSchema, tool } from 'ai';
import type {
	ModelMessage,
	ToolSet,
	TextStreamPart,
	ToolCallPart,
	ToolResultPart,
} from 'ai';
import { getProviderApiKey } from '../openrouter-key.js';
import type { AiModelProvider } from '../../src/lib/kainbu/types.js';
import {
	WORKSPACE_AI_MAX_TOKENS,
	WORKSPACE_AI_STREAM_DELTA_THROTTLE_MS,
} from './constants.js';
import { OpenRouterTools } from './tools.js';

// ---------------------------------------------------------------------------
// Re-exported types that match the existing openrouter-stream.ts contracts
// ---------------------------------------------------------------------------

export type AiSdkUsage = {
	promptTokens: number | undefined;
	completionTokens: number | undefined;
	cachedTokens: number | undefined;
	costUsd: number | undefined;
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

export type StreamDeltaHandlers = {
	onContentDelta?: (text: string, accumulated: string) => void;
	onReasoningDelta?: (text: string, accumulated: string) => void;
};

/** Legacy message shape (OpenAI-API-compatible, loosely typed). */
export type LegacyMessage = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

const CLIENT_CACHE = new Map<string, OpenAIProvider>();

const getClient = (provider: AiModelProvider, apiKey: string): OpenAIProvider => {
	const cacheKey = `${provider}:${apiKey.slice(0, 8)}`;
	const cached = CLIENT_CACHE.get(cacheKey);
	if (cached) return cached;

	const baseURL =
		provider === 'vercel'
			? 'https://ai-gateway.vercel.sh/v1'
			: 'https://openrouter.ai/api/v1';

	const headers: Record<string, string> = {};
	if (provider === 'openrouter') {
		headers['HTTP-Referer'] = 'https://kainbu.test';
		headers['X-Title'] = 'Kainbu';
	}

	const client = createOpenAI({ baseURL, apiKey, headers, name: provider });
	CLIENT_CACHE.set(cacheKey, client);
	return client;
};

// ---------------------------------------------------------------------------
// Message format conversion (OpenAI-API → AI SDK ModelMessage)
// ---------------------------------------------------------------------------

/**
 * Convert a batch of legacy OpenAI-format messages to AI SDK ModelMessage[].
 * Builds a tool-name lookup from preceding assistant messages so tool
 * result messages (which only carry tool_call_id) get the correct toolName.
 */
const toCoreMessages = (messages: LegacyMessage[]): ModelMessage[] => {
	// First pass: index toolCallId → toolName from assistant messages
	const toolNameIndex = new Map<string, string>();
	for (const msg of messages) {
		if (msg.role === 'assistant') {
			const toolCalls = msg.tool_calls as
				| Array<Record<string, unknown>>
				| undefined;
			if (Array.isArray(toolCalls)) {
				for (const tc of toolCalls) {
					const fn = tc.function as
						| Record<string, unknown>
						| undefined;
					if (tc.id && fn?.name) {
						toolNameIndex.set(
							tc.id as string,
							fn.name as string,
						);
					}
				}
			}
		}
	}

	return messages.map((msg) => _toCoreMessage(msg, toolNameIndex));
};

const _toCoreMessage = (
	msg: LegacyMessage,
	toolNameIndex: Map<string, string>,
): ModelMessage => {
	const role = msg.role as string;
	const content = msg.content;

	if (role === 'system') {
		return {
			role: 'system',
			content: content as string,
		} satisfies ModelMessage;
	}

	if (role === 'tool') {
		// Tool messages: { role: 'tool', tool_call_id, content: string }
		// → AI SDK: { role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName, output }] }
		const toolCallId = msg.tool_call_id as string;
		const toolName =
			toolNameIndex.get(toolCallId) ?? 'unknown_tool';
		const output: ToolResultPart['output'] = {
			type: 'text',
			value:
				typeof content === 'string'
					? content
					: JSON.stringify(content),
		};
		return {
			role: 'tool',
			content: [{ type: 'tool-result', toolCallId, toolName, output }],
		} satisfies ModelMessage;
	}

	if (role === 'assistant') {
		const toolCalls = msg.tool_calls as
			| Array<Record<string, unknown>>
			| undefined;
		if (Array.isArray(toolCalls) && toolCalls.length > 0) {
			const parts: Array<
				{ type: 'text'; text: string } | ToolCallPart
			> = [];
			if (typeof content === 'string' && content) {
				parts.push({ type: 'text', text: content });
			}
			for (const tc of toolCalls) {
				const fn = tc.function as
					| Record<string, unknown>
					| undefined;
				let input: unknown = {};
				if (typeof fn?.arguments === 'string') {
					try {
						input = JSON.parse(fn.arguments);
					} catch {
						input = {};
					}
				} else if (fn?.arguments) {
					input = fn.arguments;
				}
				parts.push({
					type: 'tool-call',
					toolCallId: tc.id as string,
					toolName: (fn?.name as string) ?? '',
					input,
				});
			}
			return { role: 'assistant', content: parts } satisfies ModelMessage;
		}
		return {
			role: 'assistant',
			content: (content as string) ?? '',
		} satisfies ModelMessage;
	}

	// User messages
	if (role === 'user') {
		if (typeof content === 'string') {
			return { role: 'user', content } satisfies ModelMessage;
		}
		if (Array.isArray(content)) {
			const parts = content.map(
				(part: Record<string, unknown>) => {
					if (part.type === 'image_url') {
						return {
							type: 'image' as const,
							image: (
								part.image_url as Record<string, string>
							)?.url as string,
						} as const;
					}
					return {
						type: 'text' as const,
						text: String(part.text ?? ''),
					} as const;
				},
			);
			return { role: 'user', content: parts } satisfies ModelMessage;
		}
	}

	// Fallback: treat unknown shapes as user text
	return {
		role: 'user',
		content: String(content ?? ''),
	} satisfies ModelMessage;
};

// ---------------------------------------------------------------------------
// Tool conversion (OpenRouter function-tools → AI SDK ToolSet)
// ---------------------------------------------------------------------------

let aiSdkToolSet: ToolSet | undefined;

/** Lazily convert the static OpenRouterTools into an AI SDK ToolSet. */
const getAiSdkTools = (): ToolSet => {
	if (aiSdkToolSet) return aiSdkToolSet;

	const tools: ToolSet = {};
	for (const def of OpenRouterTools) {
		const fn = def.function;
		if (!fn) continue;
		tools[fn.name] = tool({
			description: fn.description,
			inputSchema: jsonSchema(
				fn.parameters as Record<string, unknown>,
			),
		});
	}
	aiSdkToolSet = tools;
	return tools;
};

// ---------------------------------------------------------------------------
// Usage extraction
// ---------------------------------------------------------------------------

const EMPTY_USAGE: AiSdkUsage = {
	promptTokens: undefined,
	completionTokens: undefined,
	cachedTokens: undefined,
	costUsd: undefined,
};

const extractUsage = (
	usage:
		| {
				inputTokens?: number;
				outputTokens?: number;
				inputTokenDetails?: { cacheReadTokens?: number };
				raw?: Record<string, unknown>;
		  }
		| undefined,
	providerMetadata: Record<string, unknown> | undefined,
): AiSdkUsage => {
	if (!usage) return EMPTY_USAGE;

	const cacheRead = usage.inputTokenDetails?.cacheReadTokens;

	// Cost: try Vercel Gateway metadata first, then OpenRouter raw usage.
	const gatewayCost = (
		providerMetadata?.gateway as Record<string, unknown> | undefined
	)?.cost;
	const rawCost = usage.raw?.cost ?? usage.raw?.total_cost;
	const costRaw =
		typeof gatewayCost === 'number'
			? gatewayCost
			: typeof rawCost === 'number'
				? rawCost
				: undefined;

	return {
		promptTokens: usage.inputTokens,
		completionTokens: usage.outputTokens,
		cachedTokens:
			typeof cacheRead === 'number' ? cacheRead : undefined,
		costUsd: costRaw,
	};
};

const buildResponseFromResult = (
	text: string,
	toolCalls: Array<{
		toolCallId: string;
		toolName: string;
		input: unknown;
	}>,
	finishReason: string,
	usage: AiSdkUsage,
): { response: unknown; usage: AiSdkUsage } => {
	const toolCallsFormatted = toolCalls.map((tc) => ({
		id: tc.toolCallId,
		type: 'function',
		function: {
			name: tc.toolName,
			arguments: JSON.stringify(tc.input),
		},
	}));

	return {
		response: {
			choices: [
				{
					message: {
						role: 'assistant',
						content: text || null,
						...(toolCallsFormatted.length > 0
							? { tool_calls: toolCallsFormatted }
							: {}),
					},
					finish_reason: finishReason,
				},
			],
			usage: {
				prompt_tokens: usage.promptTokens ?? null,
				completion_tokens: usage.completionTokens ?? null,
				cost: usage.costUsd ?? null,
				...(usage.cachedTokens != null
					? {
							prompt_tokens_details: {
								cached_tokens: usage.cachedTokens,
							},
						}
					: {}),
			},
		},
		usage,
	};
};

// ---------------------------------------------------------------------------
// Public API — generateText wrapper
// ---------------------------------------------------------------------------

/**
 * Non-streaming JSON completion (with or without tools).
 * Returns a legacy `{ response, usage }` shape matching the existing
 * `fetchCompletionJson` contract so call sites don't need to change.
 */
export const aiSdkGenerateText = async (
	messages: LegacyMessage[],
	modelConfig: {
		model: string;
		thinking?: unknown;
		provider?: AiModelProvider;
	},
	options: { useTools?: boolean; promptCache?: boolean } = {},
): Promise<{ response: unknown; usage: AiSdkUsage }> => {
	const provider: AiModelProvider =
		modelConfig.provider === 'vercel' ? 'vercel' : 'openrouter';
	const apiKey = await getProviderApiKey(provider);
	const client = getClient(provider, apiKey);
	const coreMessages = toCoreMessages(messages);

	const generateOptions: Parameters<typeof generateText>[0] = {
		model: client(modelConfig.model),
		messages: coreMessages,
		maxOutputTokens: WORKSPACE_AI_MAX_TOKENS,
	};

	if (options.useTools) {
		generateOptions.tools = getAiSdkTools();
		generateOptions.toolChoice = 'auto';
	}

	const result = await generateText(generateOptions);

	// Try to get cost from providerMetadata on each step
	let providerMeta: Record<string, unknown> | undefined;
	for (const step of result.steps) {
		const meta = step.providerMetadata as
			| Record<string, unknown>
			| undefined;
		if (meta?.gateway) {
			providerMeta = meta;
			break;
		}
	}
	if (!providerMeta) {
		providerMeta = result.providerMetadata as
			| Record<string, unknown>
			| undefined;
	}

	const usage = extractUsage(result.usage, providerMeta);

	return buildResponseFromResult(
		result.text,
		result.toolCalls.map((tc) => ({
			toolCallId: tc.toolCallId,
			toolName: tc.toolName,
			input: tc.input,
		})),
		result.finishReason,
		usage,
	);
};

// ---------------------------------------------------------------------------
// Public API — streamText wrapper
// ---------------------------------------------------------------------------

/**
 * Streaming completion (no tools — tools are handled in the JSON loop).
 * Calls `streamText` from the AI SDK and fires delta callbacks.
 * Returns a `StreamedCompletion` matching the existing
 * `fetchCompletionStream` contract.
 */
export const aiSdkStreamText = async (
	messages: LegacyMessage[],
	modelConfig: {
		model: string;
		thinking?: unknown;
		provider?: AiModelProvider;
	},
	handlers: StreamDeltaHandlers = {},
	_options: { promptCache?: boolean } = {},
): Promise<StreamedCompletion> => {
	const provider: AiModelProvider =
		modelConfig.provider === 'vercel' ? 'vercel' : 'openrouter';
	const apiKey = await getProviderApiKey(provider);
	const client = getClient(provider, apiKey);
	const coreMessages = toCoreMessages(messages);

	let content = '';
	let reasoning = '';
	let lastEmitAt = 0;

	const maybeEmit = (force: boolean) => {
		const now = Date.now();
		if (
			!force &&
			now - lastEmitAt < WORKSPACE_AI_STREAM_DELTA_THROTTLE_MS
		)
			return;
		lastEmitAt = now;
		handlers.onContentDelta?.(content.slice(-80), content);
		if (reasoning)
			handlers.onReasoningDelta?.(
				reasoning.slice(-80),
				reasoning,
			);
	};

	const result = streamText({
		model: client(modelConfig.model),
		messages: coreMessages,
		maxOutputTokens: WORKSPACE_AI_MAX_TOKENS,
		onChunk: ({ chunk }: { chunk: TextStreamPart<ToolSet> }) => {
			if (chunk.type === 'text-delta') {
				content += chunk.text;
				maybeEmit(false);
			}
			if (chunk.type === 'reasoning-delta') {
				reasoning += chunk.text;
				maybeEmit(false);
			}
		},
	});

	// Wait for the stream to finish
	const [finalText, finalReasoning] = await Promise.all([
		result.text,
		result.reasoningText,
	]);
	maybeEmit(true);

	return {
		content: finalText,
		reasoning: finalReasoning ?? '',
		toolCalls: [],
	};
};
