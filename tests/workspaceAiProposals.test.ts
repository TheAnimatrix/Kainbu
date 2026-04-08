import { describe, expect, it } from 'vitest';
import {
	deleteProjectAiSession,
	normalizeProjectAiState,
	syncProjectAiModelIds
} from '../src/lib/kainbu/aiSessions';
import { EMPTY_PROJECT } from '../src/lib/kainbu/constants';
import { DEFAULT_AI_MODEL_CONFIGS, DEFAULT_AI_MODEL_ID } from '../src/lib/kainbu/models';
import type { ChatMessage } from '../src/lib/kainbu/types';

const buildMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
	id: 'message-1',
	role: 'user',
	text: 'Outline the launch checklist.',
	timestamp: 1_710_000_000_000,
	...overrides
});

describe('project AI session normalization', () => {
	it('migrates legacy chat history into a default session', () => {
		const seedProject = EMPTY_PROJECT('user-1', 'Launch');
		const legacyHistory = [
			buildMessage(),
			buildMessage({
				id: 'message-2',
				role: 'assistant',
				text: 'Here is the checklist.',
				timestamp: 1_710_000_000_500
			})
		];

		const normalized = normalizeProjectAiState({
			id: 'project-1',
			chatHistory: legacyHistory,
			aiSessions: [],
			activeAiSessionId: ''
		});

		expect(normalized.aiSessions).toHaveLength(1);
		expect(normalized.aiSessions[0].projectId).toBe('project-1');
		expect(normalized.aiSessions[0].title).toBe('New chat');
		expect(normalized.aiSessions[0].modelId).toBe(DEFAULT_AI_MODEL_ID);
		expect(normalized.aiSessions[0].history).toEqual(legacyHistory);
		expect(normalized.activeAiSessionId).toBe(normalized.aiSessions[0].id);
		expect(normalized.chatHistory).toEqual(legacyHistory);

		expect(seedProject.aiSessions[0].modelId).toBe(DEFAULT_AI_MODEL_ID);
	});

	it('falls back to the first available model when a saved model id is missing', () => {
		const seedProject = EMPTY_PROJECT('user-1', 'Launch');
		const staleProject = {
			...seedProject,
			id: 'project-1',
			aiSessions: [
				{
					...seedProject.aiSessions[0],
					projectId: 'project-1',
					modelId: 'removed-model'
				}
			]
		};

		const normalized = syncProjectAiModelIds(
			staleProject,
			[DEFAULT_AI_MODEL_CONFIGS[1].id],
			DEFAULT_AI_MODEL_CONFIGS[1].id
		);

		expect(normalized.aiSessions[0].modelId).toBe(DEFAULT_AI_MODEL_CONFIGS[1].id);
		expect(normalized.chatHistory).toEqual(normalized.aiSessions[0].history);
	});

	it('creates a fresh replacement session when the last session is deleted', () => {
		const seedProject = EMPTY_PROJECT('user-1', 'Launch');
		const sessionId = seedProject.aiSessions[0].id;

		const nextProject = deleteProjectAiSession(
			{
				...seedProject,
				id: 'project-1',
				aiSessions: [
					{
						...seedProject.aiSessions[0],
						projectId: 'project-1'
					}
				]
			},
			sessionId,
			DEFAULT_AI_MODEL_CONFIGS[1].id
		);

		expect(nextProject.aiSessions).toHaveLength(1);
		expect(nextProject.aiSessions[0].id).not.toBe(sessionId);
		expect(nextProject.aiSessions[0].modelId).toBe(DEFAULT_AI_MODEL_CONFIGS[1].id);
		expect(nextProject.activeAiSessionId).toBe(nextProject.aiSessions[0].id);
		expect(nextProject.chatHistory).toEqual(nextProject.aiSessions[0].history);
	});
});
