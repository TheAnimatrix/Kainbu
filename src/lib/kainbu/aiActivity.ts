import type { AiProgressEvent } from '$lib/kainbu/types';

export type AiToolActivityState = 'running' | 'completed' | 'error' | 'unresolved';

export interface AiToolActivity {
	id: string;
	label: string;
	input?: string;
	result?: string;
	resultDetail?: string;
	state: AiToolActivityState;
}

const resultFailed = (event: AiProgressEvent) => {
	const detail = event.detail?.trim();
	if (!detail) return false;

	try {
		const parsed = JSON.parse(detail) as { ok?: unknown };
		return parsed.ok === false;
	} catch {
		// Long JSON results are truncated before reaching the client. The explicit
		// `ok: false` field remains authoritative even when the tail is missing.
		return /["']ok["']\s*:\s*false\b/i.test(detail);
	}
};

/**
 * Pair tool results with calls in event order. The workspace agent executes
 * calls serially, so each result closes the oldest call without a result.
 */
export const deriveToolActivities = (
	events: AiProgressEvent[],
	isLive: boolean
): AiToolActivity[] => {
	const tools: AiToolActivity[] = [];
	const pending: number[] = [];

	for (const event of events) {
		if (event.kind === 'tool_call') {
			tools.push({
				id: event.id,
				label: event.message,
				...(event.detail ? { input: event.detail } : {}),
				state: isLive ? 'running' : 'unresolved'
			});
			pending.push(tools.length - 1);
			continue;
		}

		if (event.kind !== 'tool_result') continue;
		const toolIndex = pending.shift();
		if (toolIndex === undefined) continue;

		tools[toolIndex] = {
			...tools[toolIndex],
			result: event.message,
			...(event.detail ? { resultDetail: event.detail } : {}),
			state: resultFailed(event) ? 'error' : 'completed'
		};
	}

	return tools;
};
