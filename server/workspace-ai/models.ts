import { applyThinkingLevel } from '../../src/lib/kainbu/models.js';
import type { AiModelConfig, AiWorkspaceModelsResponse } from './types.js';
import {
	assertThinkingLevelAllowed,
	getEnabledModelConfigs,
	getVisionFallbackConfig,
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

export const getWorkspaceAiModelsResponse = (): AiWorkspaceModelsResponse => ({
	models: getWorkspaceAiModels(),
	visionFallback: getVisionFallbackConfig()
});

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
	if (candidate.projectId.length > 128)
		throw new WorkspaceAiRequestError(400, 'projectId is too long.');

	if (typeof candidate.sessionId !== 'string' || !candidate.sessionId.trim()) {
		throw new WorkspaceAiRequestError(400, 'sessionId is required.');
	}
	if (candidate.sessionId.length > 128)
		throw new WorkspaceAiRequestError(400, 'sessionId is too long.');

	if (!Array.isArray(candidate.history)) {
		throw new WorkspaceAiRequestError(400, 'history must be an array.');
	}
	if (candidate.history.length > 100) {
		throw new WorkspaceAiRequestError(413, 'history may contain at most 100 messages.');
	}
	for (const [index, message] of candidate.history.entries()) {
		if (!message || typeof message !== 'object' || Array.isArray(message)) {
			throw new WorkspaceAiRequestError(400, `history[${index}] must be an object.`);
		}
		const item = message as Record<string, unknown>;
		if (item.role !== 'user' && item.role !== 'assistant') {
			throw new WorkspaceAiRequestError(400, `history[${index}].role is invalid.`);
		}
		if (
			typeof item.id !== 'string' ||
			item.id.length === 0 ||
			item.id.length > 128 ||
			typeof item.text !== 'string'
		) {
			throw new WorkspaceAiRequestError(400, `history[${index}] has invalid id or text.`);
		}
		if (item.text.length > 100_000) {
			throw new WorkspaceAiRequestError(413, `history[${index}].text is too large.`);
		}
		if (item.attachments !== undefined) {
			if (!Array.isArray(item.attachments) || item.attachments.length > 4) {
				throw new WorkspaceAiRequestError(400, `history[${index}].attachments is invalid.`);
			}
			for (const [attachmentIndex, attachment] of item.attachments.entries()) {
				if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
					throw new WorkspaceAiRequestError(
						400,
						`history[${index}].attachments[${attachmentIndex}] is invalid.`
					);
				}
				const file = attachment as Record<string, unknown>;
				if (
					(file.kind !== 'image' && file.kind !== 'text') ||
					typeof file.name !== 'string' ||
					typeof file.mimeType !== 'string' ||
					typeof file.content !== 'string'
				) {
					throw new WorkspaceAiRequestError(
						400,
						`history[${index}].attachments[${attachmentIndex}] has invalid fields.`
					);
				}
				if (
					file.name.length > 256 ||
					file.mimeType.length > 128 ||
					file.content.length > 5_000_000 ||
					!file.name.trim() ||
					!file.mimeType.trim()
				) {
					throw new WorkspaceAiRequestError(
						413,
						`history[${index}].attachments[${attachmentIndex}] is too large.`
					);
				}
			}
		}
	}

	const scope = candidate.scope;
	if (scope !== undefined) {
		if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
			throw new WorkspaceAiRequestError(400, 'scope must be an object.');
		}
		const scopeRecord = scope as Record<string, unknown>;
		for (const field of ['selectedTaskIds', 'selectedColumnIds'] as const) {
			if (
				scopeRecord[field] !== undefined &&
				(!Array.isArray(scopeRecord[field]) ||
					scopeRecord[field].length > 100 ||
					scopeRecord[field].some(
						(id) => typeof id !== 'string' || id.length === 0 || id.length > 128
					))
			) {
				throw new WorkspaceAiRequestError(400, `scope.${field} is invalid.`);
			}
		}
		if (scopeRecord.queuedTaskCards !== undefined) {
			const cards = scopeRecord.queuedTaskCards;
			if (!Array.isArray(cards) || cards.length > 100)
				throw new WorkspaceAiRequestError(400, 'scope.queuedTaskCards is invalid.');
			for (const [index, card] of cards.entries()) {
				if (!card || typeof card !== 'object' || Array.isArray(card))
					throw new WorkspaceAiRequestError(400, `scope.queuedTaskCards[${index}] is invalid.`);
				const item = card as Record<string, unknown>;
				if (
					typeof item.id !== 'string' ||
					item.id.length === 0 ||
					item.id.length > 128 ||
					typeof item.taskId !== 'string' ||
					item.taskId.length === 0 ||
					item.taskId.length > 128 ||
					typeof item.columnId !== 'string' ||
					item.columnId.length === 0 ||
					item.columnId.length > 128 ||
					typeof item.columnTitle !== 'string' ||
					item.columnTitle.length > 500 ||
					typeof item.title !== 'string' ||
					item.title.length > 1000 ||
					(item.description !== undefined &&
						(typeof item.description !== 'string' || item.description.length > 100_000)) ||
					!Array.isArray(item.tags) ||
					item.tags.length > 50
				) {
					throw new WorkspaceAiRequestError(400, `scope.queuedTaskCards[${index}] is malformed.`);
				}
			}
		}
	}
	if (candidate.continuation !== undefined) {
		const continuation = candidate.continuation;
		if (!continuation || typeof continuation !== 'object' || Array.isArray(continuation))
			throw new WorkspaceAiRequestError(400, 'continuation is invalid.');
		const item = continuation as Record<string, unknown>;
		if (
			typeof item.questionId !== 'string' ||
			item.questionId.length === 0 ||
			item.questionId.length > 128 ||
			(item.optionId !== undefined &&
				(typeof item.optionId !== 'string' || item.optionId.length > 128)) ||
			(item.text !== undefined && (typeof item.text !== 'string' || item.text.length > 10_000))
		)
			throw new WorkspaceAiRequestError(400, 'continuation is invalid.');
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
