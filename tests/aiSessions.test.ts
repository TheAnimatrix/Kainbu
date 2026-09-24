import { describe, expect, it } from 'vitest';
import { updateProjectAiSessionById } from '../src/lib/kainbu/aiSessions';
import type { ChatMessage, Project, ProjectAiSession } from '../src/lib/kainbu/types';

const message = (id: string): ChatMessage => ({
	id,
	role: 'assistant',
	text: id,
	timestamp: 1
});

const session = (id: string, history: ChatMessage[]): ProjectAiSession => ({
	id,
	projectId: 'project-1',
	title: id,
	modelId: 'openai/gpt-5.2',
	history,
	createdAt: 1,
	updatedAt: 1,
	lastMessageAt: 1
});

describe('AI session targeting', () => {
	it('updates the originating session without replacing the currently active chat', () => {
		const first = session('session-1', [message('first')]);
		const second = session('session-2', [message('second')]);
		const project = {
			id: 'project-1',
			aiSessions: [first, second],
			activeAiSessionId: second.id,
			chatHistory: second.history
		} as Project;

		const updated = updateProjectAiSessionById(project, first.id, (current) => ({
			...current,
			history: [...current.history, message('response')]
		}));

		expect(updated.activeAiSessionId).toBe(second.id);
		expect(updated.chatHistory.map((entry) => entry.id)).toEqual(['second']);
		expect(
			updated.aiSessions.find((entry) => entry.id === first.id)?.history.map((entry) => entry.id)
		).toEqual(['first', 'response']);
	});
});
