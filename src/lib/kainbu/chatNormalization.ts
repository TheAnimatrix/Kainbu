import type { ChatMessage } from './types.js';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const pickString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const pickNumber = (value: unknown): number | undefined => {
	const num = toNumber(value);
	return num === null ? undefined : num;
};

const pickStringArray = (value: unknown): string[] | undefined =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: undefined;

/**
 * Server-side / shared normalizer for AI session chat history. The
 * full-fat normalizer in `persistence.ts` is tightly coupled to many
 * Svelte helpers; this one only validates the shape and preserves
 * whatever well-typed nested arrays/objects the row already had, so
 * the server snapshot can be consumed by the web app without losing
 * the live in-memory shape.
 */
export const normalizeChatHistory = (history: unknown): ChatMessage[] => {
	if (!Array.isArray(history)) return [];

	return history.flatMap((entry) => {
		if (!isObject(entry)) return [];

		const role = entry.role === 'assistant' || entry.role === 'model' ? 'assistant' : 'user';
		const text = typeof entry.text === 'string' ? entry.text : '';
		const id =
			typeof entry.id === 'string' && entry.id.trim().length > 0
				? entry.id
				: `msg-${Math.random().toString(36).slice(2, 10)}`;
		const timestamp = pickNumber(entry.timestamp) ?? Date.now();

		const message: ChatMessage = {
			id,
			role,
			text,
			timestamp
		};

		const toolActions = Array.isArray(entry.toolActions) ? entry.toolActions : undefined;
		if (toolActions) message.toolActions = toolActions as never;
		const stagedProposals = Array.isArray(entry.stagedProposals) ? entry.stagedProposals : undefined;
		if (stagedProposals) message.stagedProposals = stagedProposals as never;
		const progressEvents = Array.isArray(entry.progressEvents) ? entry.progressEvents : undefined;
		if (progressEvents) message.progressEvents = progressEvents as never;
		const taskCards = Array.isArray(entry.taskCards) ? entry.taskCards : undefined;
		if (taskCards) message.taskCards = taskCards as never;
		const annotations = Array.isArray(entry.annotations) ? entry.annotations : undefined;
		if (annotations) message.annotations = annotations as never;

		const stoppedReason = pickString(entry.stoppedReason);
		if (stoppedReason) message.stoppedReason = stoppedReason;

		if (isObject(entry.metadata)) message.metadata = entry.metadata as never;
		if (isObject(entry.question)) message.question = entry.question as never;
		if (isObject(entry.usage)) message.usage = entry.usage as never;

		return [message];
	});
};
