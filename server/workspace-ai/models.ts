import { DEFAULT_AI_MODEL_CONFIGS } from '../../src/lib/kainbu/models.js';
import type { AiModelConfig } from './types.js';

export class WorkspaceAiRequestError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const cloneModelConfig = (config: AiModelConfig): AiModelConfig => ({
	...config,
	thinking: config.thinking ? structuredClone(config.thinking) : null
});

export const getWorkspaceAiModels = () => DEFAULT_AI_MODEL_CONFIGS.map(cloneModelConfig);

export const getDefaultWorkspaceAiModel = () => cloneModelConfig(DEFAULT_AI_MODEL_CONFIGS[0]);

export const resolveWorkspaceAiModel = (modelId: unknown) => {
	if (typeof modelId !== 'string' || !modelId.trim()) {
		throw new WorkspaceAiRequestError(400, 'modelId is required.');
	}

	const normalizedModelId = modelId.trim();
	const config = DEFAULT_AI_MODEL_CONFIGS.find((entry) => entry.id === normalizedModelId);
	if (!config) {
		throw new WorkspaceAiRequestError(400, `Unknown modelId "${normalizedModelId}".`);
	}

	return cloneModelConfig(config);
};

const THINKING_BUDGET: Record<string, number> = {
	low: 2048,
	medium: 4096,
	high: 8192
};

export const applyThinkingLevel = (
	modelConfig: AiModelConfig,
	thinkingLevel: unknown
): AiModelConfig => {
	if (typeof thinkingLevel !== 'string') return modelConfig;
	if (thinkingLevel === 'none') {
		return { ...modelConfig, thinking: null };
	}
	const budget = THINKING_BUDGET[thinkingLevel];
	if (!budget) return modelConfig;
	return {
		...modelConfig,
		thinking: { type: 'enabled', budget_tokens: budget }
	};
};

export const validateWorkspaceAiRequest = (request: unknown) => {
	if (!request || typeof request !== 'object') {
		throw new WorkspaceAiRequestError(400, 'Request body must be an object.');
	}

	const candidate = request as Record<string, unknown>;
	if (typeof candidate.projectId !== 'string' || !candidate.projectId.trim()) {
		throw new WorkspaceAiRequestError(400, 'projectId is required.');
	}

	if (typeof candidate.sessionId !== 'string' || !candidate.sessionId.trim()) {
		throw new WorkspaceAiRequestError(400, 'sessionId is required.');
	}

	if (!Array.isArray(candidate.history)) {
		throw new WorkspaceAiRequestError(400, 'history must be an array.');
	}

	resolveWorkspaceAiModel(candidate.modelId);
};
