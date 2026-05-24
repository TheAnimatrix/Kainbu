import { describe, expect, it } from 'vitest';
import {
	WorkspaceAiRequestError,
	applyThinkingLevel,
	getWorkspaceAiModels,
	resolveWorkspaceAiModel,
	validateWorkspaceAiRequest
} from '../server/workspace-ai/models';
import { DEFAULT_AI_MODEL_CONFIGS } from '../src/lib/kainbu/models';

describe('workspace AI model catalog', () => {
	it('returns the configured model list as clones', () => {
		const models = getWorkspaceAiModels();

		expect(models).toEqual(DEFAULT_AI_MODEL_CONFIGS);
		expect(models).not.toBe(DEFAULT_AI_MODEL_CONFIGS);

		models[0].id = 'mutated';
		expect(getWorkspaceAiModels()[0].id).toBe(DEFAULT_AI_MODEL_CONFIGS[0].id);
	});

	it('resolves a known model id', () => {
		expect(resolveWorkspaceAiModel(DEFAULT_AI_MODEL_CONFIGS[0].id)).toEqual(
			DEFAULT_AI_MODEL_CONFIGS[0]
		);
	});

	it('rejects unknown model ids', () => {
		expect(() => resolveWorkspaceAiModel('missing-model')).toThrowError(WorkspaceAiRequestError);
		expect(() => resolveWorkspaceAiModel('missing-model')).toThrowError(
			'Unknown modelId "missing-model".'
		);
	});
});

describe('workspace AI thinking config', () => {
	const grokModel = DEFAULT_AI_MODEL_CONFIGS.find((entry) => entry.id === 'grok 0.1 build');
	const geminiModel = DEFAULT_AI_MODEL_CONFIGS[0];

	it('preserves model-specific reasoning fields when applying a level', () => {
		expect(applyThinkingLevel(grokModel!, 'high')).toEqual({
			...grokModel,
			thinking: {
				type: 'enabled',
				budget_tokens: 8192,
				temperature: 0.7,
				level: 'high'
			}
		});
	});

	it('adds reasoning config for models without defaults', () => {
		expect(applyThinkingLevel(geminiModel, 'low')).toEqual({
			...geminiModel,
			thinking: {
				type: 'enabled',
				budget_tokens: 2048,
				level: 'low'
			}
		});
	});

	it('clears reasoning when thinking is disabled', () => {
		expect(applyThinkingLevel(grokModel!, 'none').thinking).toBeNull();
	});
});

describe('workspace AI request validation', () => {
	it('accepts a request with project, session, history, and model id', () => {
		expect(() =>
			validateWorkspaceAiRequest({
				projectId: 'project-1',
				sessionId: 'session-1',
				modelId: DEFAULT_AI_MODEL_CONFIGS[0].id,
				history: [],
				scope: {}
			})
		).not.toThrow();
	});

	it('requires a session id', () => {
		expect(() =>
			validateWorkspaceAiRequest({
				projectId: 'project-1',
				modelId: DEFAULT_AI_MODEL_CONFIGS[0].id,
				history: []
			})
		).toThrowError('sessionId is required.');
	});

	it('requires history to be an array', () => {
		expect(() =>
			validateWorkspaceAiRequest({
				projectId: 'project-1',
				sessionId: 'session-1',
				modelId: DEFAULT_AI_MODEL_CONFIGS[0].id,
				history: null
			})
		).toThrowError('history must be an array.');
	});
});
