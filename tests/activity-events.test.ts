import { describe, it, expect } from 'vitest';
import { buildWorkspaceActivitySummary, filterActivityEvents } from '../src/lib/kainbu/activity';
import type { BackgroundTheme, Project } from '../src/lib/kainbu/types';

const baseProject = (overrides: Partial<Project> = {}): Project => ({
	id: 'test-project',
	name: 'Test Project',
	ownerUserId: 'user1',
	accessRole: 'owner',
	backgroundTheme: null as BackgroundTheme | null,
	kanbanData: [],
	members: [],
	invites: [],
	boards: [],
	pages: [],
	activeBoardId: '',
	activePageId: '',
	scratchpadData: { activePadId: '', pads: [] },
	scratchpadRev: 0,
	aiSessions: [],
	activeAiSessionId: '',
	chatHistory: [],
	createdAt: Date.now() - 30 * 86400000,
	updatedAt: Date.now() - 3600000,
	viewerLastOpenedAt: Date.now() - 3600000,
	viewerPinnedAt: undefined,
	...overrides
});

describe('activity event projectId', () => {
	it('should have correct projectId for task events', () => {
		const now = Date.now();
		const projects: Project[] = [
			baseProject({
				id: 'project-alpha',
				name: 'Alpha',
				kanbanData: [
					{
						id: 'col-1',
						title: 'Backlog',
						tasks: [
							{
								id: 'task-1',
								title: 'Alpha task',
								tags: [],
								completedAt: now - 3600000,
								createdAt: now - 86400000
							}
						]
					}
				],
				updatedAt: now - 1800000
			}),
			baseProject({
				id: 'project-beta',
				name: 'Beta',
				kanbanData: [
					{
						id: 'col-2',
						title: 'To Do',
						tasks: [
							{
								id: 'task-2',
								title: 'Beta task',
								tags: [],
								completedAt: now - 1800000,
								createdAt: now - 86400000 * 2
							}
						]
					}
				],
				updatedAt: now - 3600000
			})
		];

		const summary = buildWorkspaceActivitySummary(projects, now);

		for (const event of summary.events) {
			const expectedName = event.projectId === 'project-alpha' ? 'Alpha' : 'Beta';
			expect(event.projectName).toBe(expectedName);
			expect(projects.some(p => p.id === event.projectId)).toBe(true);
		}

		// Check daily activity pills
		const daily = filterActivityEvents(
			summary.events.filter(e => now - e.timestamp <= 24 * 60 * 60 * 1000),
			{ limit: 6 }
		);

		for (const event of daily) {
			expect(projects.some(p => p.id === event.projectId)).toBe(true);
		}
	});
});
