import { describe, expect, it } from 'vitest';
import { mergeProjectBoardsByUpdatedAt } from '$lib/kainbu/projectStructure';
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
});
