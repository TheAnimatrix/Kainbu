import { describe, expect, it } from 'vitest';
import {
	findDefaultDoneColumnId,
	getCheckedMoveTargetLabel,
	mergeBoardPreferences,
	normalizeBoardPreferences,
	resolveCheckedMoveTargetColumnId
} from '$lib/kainbu/boardPreferences';
import type { KanbanData } from '$lib/kainbu/types';

const sampleBoard: KanbanData = [
	{ id: 'todo', title: 'To Do', tasks: [] },
	{ id: 'done', title: 'Done', tasks: [] }
];

describe('boardPreferences', () => {
	it('normalizes missing values with defaults', () => {
		expect(normalizeBoardPreferences(undefined)).toEqual({
			defaultShowCheckbox: true,
			moveCheckedTasks: true,
			checkedTaskTargetColumnId: ''
		});
	});

	it('resolves the Done column by title when no explicit target is set', () => {
		expect(findDefaultDoneColumnId(sampleBoard)).toBe('done');
		expect(
			resolveCheckedMoveTargetColumnId(sampleBoard, normalizeBoardPreferences({ moveCheckedTasks: true }))
		).toBe('done');
	});

	it('uses an explicit target column when configured', () => {
		const preferences = normalizeBoardPreferences({
			moveCheckedTasks: true,
			checkedTaskTargetColumnId: 'todo'
		});

		expect(resolveCheckedMoveTargetColumnId(sampleBoard, preferences)).toBe('todo');
		expect(getCheckedMoveTargetLabel(sampleBoard, preferences)).toBe('To Do');
	});

	it('returns null when move is disabled or the target column is missing', () => {
		expect(
			resolveCheckedMoveTargetColumnId(
				sampleBoard,
				normalizeBoardPreferences({ moveCheckedTasks: false })
			)
		).toBeNull();

		expect(
			resolveCheckedMoveTargetColumnId(
				[{ id: 'todo', title: 'To Do', tasks: [] }],
				normalizeBoardPreferences({ moveCheckedTasks: true })
			)
		).toBeNull();
	});

	it('keeps customized local preferences when remote only has defaults', () => {
		const local = normalizeBoardPreferences({ moveCheckedTasks: false });
		const remote = normalizeBoardPreferences(undefined);

		expect(mergeBoardPreferences(local, remote, false)).toEqual(local);
	});
});
