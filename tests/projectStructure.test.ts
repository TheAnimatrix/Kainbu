import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAT_HISTORY } from '$lib/kainbu/constants';
import {
	mergeProjectBoardsByUpdatedAt,
	resolveProjectBoardId,
	updateProjectBoardPreferences
} from '$lib/kainbu/projectStructure';
import type { ProjectBoard } from '$lib/kainbu/types';

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

	it('includes boards that only exist on one side', () => {
		const localBoards = [board('local-only', 50)];
		const remoteBoards = [board('remote-only', 50)];

		expect(mergeProjectBoardsByUpdatedAt(localBoards, remoteBoards).map((entry) => entry.id)).toEqual([
			'local-only',
			'remote-only'
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
