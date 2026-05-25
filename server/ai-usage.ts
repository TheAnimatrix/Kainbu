import { createAdminPb } from './pocketbase.js';
import { getProjectPbId } from './pbWorkspace.js';
import type { OpenRouterUsage } from './workspace-ai/openrouter-stream.js';

export type AiUsageSource = 'workspace-ai' | 'title-gen';

export type RecordAiUsageInput = {
	userId: string;
	projectClientId?: string;
	model?: string;
	requestId?: string;
	usage: OpenRouterUsage;
	source: AiUsageSource;
};

export const recordAiUsageEvent = async (input: RecordAiUsageInput): Promise<void> => {
	const { userId, projectClientId, model, requestId, usage, source } = input;
	if (!userId) return;

	try {
		const pb = await createAdminPb();
		let projectPbId: string | undefined;
		if (projectClientId) {
			try {
				projectPbId = await getProjectPbId(pb, projectClientId);
			} catch {
				projectPbId = undefined;
			}
		}

		await pb.collection('ai_usage_events').create({
			user: userId,
			...(projectPbId ? { project: projectPbId } : {}),
			model: model || '',
			request_id: requestId || '',
			prompt_tokens: usage.promptTokens ?? null,
			completion_tokens: usage.completionTokens ?? null,
			cached_tokens: usage.cachedTokens ?? null,
			cost_usd: usage.costUsd ?? null,
			source
		});
	} catch (error) {
		console.error('[AiUsage] Failed to record usage event', error);
	}
};
