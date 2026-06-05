import type { AiContextSummary, ChatMessage } from './types.js';
import {
	WORKSPACE_AI_COMPACT_MODEL,
	WORKSPACE_AI_CONTEXT_BUDGET_TOKENS,
	WORKSPACE_AI_CONTEXT_COMPACT_RATIO,
	WORKSPACE_AI_CONTEXT_MIN_COMPACTABLE_TURNS,
	WORKSPACE_AI_CONTEXT_RECENT_TURNS
} from './constants.js';
import { fetchCompletionJson, type OpenRouterMessage } from './openrouter-stream.js';

export interface CompactChatContextInput {
	/** Full conversation history (client-held, sent every turn), oldest first. */
	history: ChatMessage[];
	/** Durable summary carried over from the prior turn, if any. */
	priorSummary: unknown;
	/** Id of the last message already folded into priorSummary. */
	summarizedUpToMessageId: string | null;
	/** Approx tokens for the static system prompt + per-turn session context. */
	estimatedStaticTokens?: number;
	budgetTokens?: number;
	compactAtRatio?: number;
	recentTurnCount?: number;
	minimumCompactableTurns?: number;
	log?: (message: string, data?: unknown) => void;
}

export interface CompactChatContextResult {
	/** History window to send verbatim to the model (oldest first). */
	history: ChatMessage[];
	summary: unknown;
	summarizedUpToMessageId: string | null;
	compactedCount: number;
	contextTokens: number;
	compacted: boolean;
}

export const estimateTokens = (value: unknown): number => {
	if (value === null || value === undefined) return 0;
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return Math.ceil(text.length / 4);
};

const messagesAfterWatermark = (
	history: ChatMessage[],
	summarizedUpToMessageId: string | null
): ChatMessage[] => {
	if (!summarizedUpToMessageId) return history;
	const idx = history.findIndex((m) => m.id === summarizedUpToMessageId);
	if (idx < 0) return history;
	return history.slice(idx + 1);
};

const countUserTurns = (messages: ChatMessage[]): number =>
	messages.filter((m) => m.role === 'user').length;

/** Split so the most recent `recentTurnCount` user turns (and everything after) stay verbatim. */
const splitRecentTurns = (
	messages: ChatMessage[],
	recentTurnCount: number
): { compactable: ChatMessage[]; recent: ChatMessage[] } => {
	let userTurns = 0;
	let splitIdx = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') userTurns++;
		if (userTurns >= recentTurnCount) {
			splitIdx = i;
			break;
		}
	}
	if (userTurns < recentTurnCount) return { compactable: [], recent: messages };
	return { compactable: messages.slice(0, splitIdx), recent: messages.slice(splitIdx) };
};

const formatTranscript = (messages: ChatMessage[]): string =>
	messages
		.map((m) => `${m.role.toUpperCase()} (${new Date(m.timestamp).toISOString()}):\n${m.text || '(empty)'}`)
		.join('\n\n');

const parseSummary = (raw: string): AiContextSummary | string => {
	const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
	try {
		return JSON.parse(cleaned) as AiContextSummary;
	} catch {
		return cleaned;
	}
};

const extractAssistantText = (response: unknown): string => {
	if (!response || typeof response !== 'object') return '';
	const choices = (response as Record<string, unknown>).choices;
	if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return '';
	const message = (choices[0] as Record<string, unknown>).message;
	if (!message || typeof message !== 'object') return '';
	const content = (message as Record<string, unknown>).content;
	return typeof content === 'string' ? content : '';
};

const summarizeTail = async (
	tail: ChatMessage[],
	priorSummary: unknown
): Promise<AiContextSummary | string> => {
	const prompt = `Compact this Kainbu workspace AI chat history into a durable structured summary.

Prior summary:
${priorSummary ? JSON.stringify(priorSummary, null, 2) : '(none)'}

New transcript to fold in:
${formatTranscript(tail)}

Return ONLY JSON with this shape:
{
  "userGoal": "...",
  "boardContext": "...",
  "decisions": ["..."],
  "pendingProposals": ["..."],
  "appliedChanges": ["..."],
  "rejectedOrUndone": ["..."],
  "mustRemember": ["..."],
  "notes": ["..."]
}

Preserve task and column titles the user cares about, the status of any staged proposals, user
preferences, unresolved asks, and the rule that staged changes are NOT applied until the user
accepts them in the UI.`;

	const messages: OpenRouterMessage[] = [
		{
			role: 'system',
			content: 'You compact chat context for a production kanban workspace assistant. Output valid JSON only.'
		},
		{ role: 'user', content: prompt }
	];

	const { response } = await fetchCompletionJson(messages, false, {
		model: WORKSPACE_AI_COMPACT_MODEL,
		thinking: undefined
	});
	const text = extractAssistantText(response);
	if (!text.trim()) throw new Error('Compaction summarizer returned empty content.');
	return parseSummary(text);
};

/**
 * Decide whether the live context exceeds budget; if so, fold the older tail into a durable
 * summary and keep only the recent turns verbatim. Returns the window + summary to send, plus
 * the new watermark to persist. On summarizer failure it does NOT silently swallow — it logs and
 * returns the recent window uncompacted so the turn still proceeds.
 */
export const compactChatContextIfNeeded = async (
	input: CompactChatContextInput
): Promise<CompactChatContextResult> => {
	const budgetTokens = input.budgetTokens ?? WORKSPACE_AI_CONTEXT_BUDGET_TOKENS;
	const compactAtRatio = input.compactAtRatio ?? WORKSPACE_AI_CONTEXT_COMPACT_RATIO;
	const recentTurnCount = input.recentTurnCount ?? WORKSPACE_AI_CONTEXT_RECENT_TURNS;
	const minimumCompactableTurns =
		input.minimumCompactableTurns ?? WORKSPACE_AI_CONTEXT_MIN_COMPACTABLE_TURNS;
	const baseTokens = input.estimatedStaticTokens ?? 0;

	const afterWatermark = messagesAfterWatermark(input.history, input.summarizedUpToMessageId);
	const currentTokens =
		baseTokens + estimateTokens(input.priorSummary) + estimateTokens(afterWatermark);

	// Under threshold: keep the post-watermark window and the prior summary untouched.
	if (currentTokens < Math.floor(budgetTokens * compactAtRatio)) {
		return {
			history: afterWatermark,
			summary: input.priorSummary,
			summarizedUpToMessageId: input.summarizedUpToMessageId,
			compactedCount: 0,
			contextTokens: currentTokens,
			compacted: false
		};
	}

	const { compactable, recent } = splitRecentTurns(afterWatermark, recentTurnCount);
	if (compactable.length === 0 || countUserTurns(compactable) < minimumCompactableTurns) {
		const window = recent.length ? recent : afterWatermark.slice(-Math.max(2, recentTurnCount * 2));
		return {
			history: window,
			summary: input.priorSummary,
			summarizedUpToMessageId: input.summarizedUpToMessageId,
			compactedCount: 0,
			contextTokens: baseTokens + estimateTokens(input.priorSummary) + estimateTokens(window),
			compacted: false
		};
	}

	try {
		const summary = await summarizeTail(compactable, input.priorSummary);
		const watermark = compactable[compactable.length - 1]?.id ?? input.summarizedUpToMessageId;
		return {
			history: recent,
			summary,
			summarizedUpToMessageId: watermark,
			compactedCount: compactable.length,
			contextTokens: baseTokens + estimateTokens(summary) + estimateTokens(recent),
			compacted: true
		};
	} catch (error) {
		// No silent fallback: surface the failure, keep the recent window, proceed uncompacted.
		input.log?.('Context compaction failed; proceeding without compaction.', {
			error: error instanceof Error ? error.message : String(error)
		});
		const window = recent.length ? recent : afterWatermark.slice(-Math.max(2, recentTurnCount * 2));
		return {
			history: window,
			summary: input.priorSummary,
			summarizedUpToMessageId: input.summarizedUpToMessageId,
			compactedCount: 0,
			contextTokens: baseTokens + estimateTokens(input.priorSummary) + estimateTokens(window),
			compacted: false
		};
	}
};
