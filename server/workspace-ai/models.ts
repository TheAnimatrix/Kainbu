import { applyThinkingLevel } from '../../src/lib/kainbu/models.js';
import type { AiModelConfig } from './types.js';
import {
	assertThinkingLevelAllowed,
	getEnabledModelConfigs,
	loadAiModelCatalog,
	resolveModelConfigById
} from '../ai-models.js';

export { applyThinkingLevel };

export class WorkspaceAiRequestError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const cloneModelConfig = (config: AiModelConfig): AiModelConfig => ({
	...config,
	allowedThinkingLevels: [...config.allowedThinkingLevels],
	thinking: config.thinking ? structuredClone(config.thinking) : null
});

export const getWorkspaceAiModels = () => getEnabledModelConfigs().map(cloneModelConfig);

export const getDefaultWorkspaceAiModel = () => {
	const models = getWorkspaceAiModels();
	return models[0] ? cloneModelConfig(models[0]) : null;
};

export const resolveWorkspaceAiModel = (modelId: unknown) => {
	if (typeof modelId !== 'string' || !modelId.trim()) {
		throw new WorkspaceAiRequestError(400, 'modelId is required.');
	}

	const config = resolveModelConfigById(modelId.trim());
	if (!config) {
		throw new WorkspaceAiRequestError(400, `Unknown modelId "${modelId.trim()}".`);
	}

	return cloneModelConfig(config);
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

	const model = resolveWorkspaceAiModel(candidate.modelId);
	if (candidate.thinkingLevel !== undefined) {
		try {
			assertThinkingLevelAllowed(model, candidate.thinkingLevel);
		} catch (error) {
			throw new WorkspaceAiRequestError(
				400,
				error instanceof Error ? error.message : 'Invalid thinkingLevel.'
			);
		}
	}
};

export const ensureModelCatalogLoaded = () => loadAiModelCatalog();
