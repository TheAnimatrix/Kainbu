import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAT_HISTORY } from '$lib/kainbu/constants';
import {
	mergeProjectBoardsByUpdatedAt,
	mergeProjectPagesByUpdatedAt,
	resolveProjectBoardId,
	updateProjectBoardPreferences
} from '$lib/kainbu/projectStructure';
import type { ProjectBoard, ProjectPage } from '$lib/kainbu/types';

const board = (
	id: string,
	updatedAt: number,
	overrides: Partial<ProjectBoard> = {}
): ProjectBoard => ({
	id,
	projectId: 'project-1',
	name: id,
	position: 0,
	kanbanData: [],
	preferences: {
		defaultShowCheckbox: true,
		moveCheckedTasks: true,
		checkedTaskTargetColumnId: ''
	},
	sharePublic: false,
	createdAt: 0,
	updatedAt,
	...overrides
});

const page = (id: string, updatedAt: number, overrides: Partial<ProjectPage> = {}): ProjectPage => ({
	id,
	projectId: 'project-1',
	name: id,
	content: '',
	position: 0,
	createdAt: 0,
	updatedAt,
	...overrides
});

describe('mergeProjectBoardsByUpdatedAt', () => {
	it('keeps the newer board copy for each id', () => {
		const localBoards = [
			board('board-a', 200, {
				preferences: {
					defaultShowCheckbox: true,
					moveCheckedTasks: false,
					checkedTaskTargetColumnId: ''
				}
			})
		];
		const remoteBoards = [
			board('board-a', 100, {
				preferences: {
					defaultShowCheckbox: true,
					moveCheckedTasks: true,
					checkedTaskTargetColumnId: ''
				}
			})
		];

		expect(mergeProjectBoardsByUpdatedAt(localBoards, remoteBoards)).toEqual(localBoards);
	});

	it('includes remote-only boards and drops stale local-only boards by default', () => {
		const localBoards = [board('local-only', 50)];
		const remoteBoards = [board('remote-only', 50)];

		expect(mergeProjectBoardsByUpdatedAt(localBoards, remoteBoards).map((entry) => entry.id)).toEqual([
			'remote-only'
		]);
	});

	it('keeps local-only boards while their create/sync is pending', () => {
		const localBoards = [board('local-only', 50)];
		const remoteBoards = [board('remote-only', 50)];

		expect(
			mergeProjectBoardsByUpdatedAt(localBoards, remoteBoards, new Set(['local-only'])).map(
				(entry) => entry.id
			)
		).toEqual(['local-only', 'remote-only']);
	});

	it('includes remote boards missing from a stale local snapshot', () => {
		const localBoards = [board('default-board', 500)];
		const remoteBoards = [
			board('default-board', 100),
			board('team-board', 200),
			board('planning-board', 300)
		];

		expect(mergeProjectBoardsByUpdatedAt(localBoards, remoteBoards).map((entry) => entry.id)).toEqual([
			'default-board',
			'team-board',
			'planning-board'
		]);
	});

	it('keeps local boards while preference sync is pending', () => {
		const localBoards = [
			board('board-a', 100, {
				preferences: {
					defaultShowCheckbox: true,
					moveCheckedTasks: false,
					checkedTaskTargetColumnId: ''
				}
			})
		];
		const remoteBoards = [
			board('board-a', 200, {
				preferences: {
					defaultShowCheckbox: true,
					moveCheckedTasks: true,
					checkedTaskTargetColumnId: ''
				}
			})
		];

		expect(
			mergeProjectBoardsByUpdatedAt(localBoards, remoteBoards, new Set(['board-a']))[0]
				.preferences.moveCheckedTasks
		).toBe(false);
	});

	it('updates preferences on the resolved board when activeBoardId is stale', () => {
		const actualBoard = board('board-a', 100);
		const project = {
			id: 'project-1',
			ownerUserId: 'user-1',
			accessRole: 'owner' as const,
			name: 'Project',
			backgroundTheme: null,
			boards: [actualBoard],
			pages: [],
			activeBoardId: 'missing-board-id',
			activePageId: '',
			kanbanData: actualBoard.kanbanData,
			scratchpadData: { activePadId: 'pad', pads: [{ id: 'pad', name: 'Notes', content: '' }] },
			scratchpadRev: 0,
			aiSessions: [],
			activeAiSessionId: '',
			chatHistory: structuredClone(DEFAULT_CHAT_HISTORY),
			members: [],
			invites: [],
			createdAt: 0,
			updatedAt: 0,
			viewerLastOpenedAt: 0
		};

		expect(resolveProjectBoardId(project, 'missing-board-id')).toBe('board-a');

		const nextProject = updateProjectBoardPreferences(project, 'missing-board-id', {
			defaultShowCheckbox: true,
			moveCheckedTasks: false,
			checkedTaskTargetColumnId: ''
		});

		expect(nextProject.boards[0]?.preferences.moveCheckedTasks).toBe(false);
		expect(nextProject.activeBoardId).toBe('board-a');
	});
});

describe('mergeProjectPagesByUpdatedAt', () => {
	it('includes remote pages missing from a stale local snapshot', () => {
		const localPages = [page('notes', 500)];
		const remotePages = [page('notes', 100), page('spec', 200), page('retro', 300)];

		expect(mergeProjectPagesByUpdatedAt(localPages, remotePages).map((entry) => entry.id)).toEqual([
			'notes',
			'spec',
			'retro'
		]);
	});

	it('keeps local page content while scratchpad sync is pending', () => {
		const localPages = [page('notes', 100, { content: 'local draft' })];
		const remotePages = [page('notes', 200, { content: 'remote copy' })];

		expect(
			mergeProjectPagesByUpdatedAt(localPages, remotePages, new Set(['notes']))[0]?.content
		).toBe('local draft');
	});
});
