import { DEFAULT_COLUMN_WIDTH } from '$lib/kainbu/constants';
import { normalizeDueTimestamp } from '$lib/kainbu/timing';
import type { Column, KanbanData, Tag, Task } from '$lib/kainbu/types';

export interface TextDiffPart {
	value: string;
	added?: boolean;
	removed?: boolean;
}

export const diffWords = (oldText: string, newText: string): TextDiffPart[] => {
	const previous = oldText || '';
	const next = newText || '';
	const oldWords = previous.split(/(\s+)/);
	const newWords = next.split(/(\s+)/);

	let start = 0;
	while (start < oldWords.length && start < newWords.length && oldWords[start] === newWords[start]) {
		start += 1;
	}

	let end = 0;
	while (
		end < oldWords.length - start &&
		end < newWords.length - start &&
		oldWords[oldWords.length - 1 - end] === newWords[newWords.length - 1 - end]
	) {
		end += 1;
	}

	const prefix = oldWords.slice(0, start).map((value) => ({ value }));
	const suffix = oldWords.slice(oldWords.length - end).map((value) => ({ value }));
	const oldMid = oldWords.slice(start, oldWords.length - end);
	const newMid = newWords.slice(start, newWords.length - end);

	if (!oldMid.length) {
		return [...prefix, ...newMid.map((value) => ({ value, added: true })), ...suffix];
	}

	if (!newMid.length) {
		return [...prefix, ...oldMid.map((value) => ({ value, removed: true })), ...suffix];
	}

	const dp = Array.from({ length: oldMid.length + 1 }, () => Array(newMid.length + 1).fill(0));

	for (let row = 1; row <= oldMid.length; row += 1) {
		for (let column = 1; column <= newMid.length; column += 1) {
			if (oldMid[row - 1] === newMid[column - 1]) {
				dp[row][column] = dp[row - 1][column - 1] + 1;
			} else {
				dp[row][column] = Math.max(dp[row - 1][column], dp[row][column - 1]);
			}
		}
	}

	const diff: TextDiffPart[] = [];
	let row = oldMid.length;
	let column = newMid.length;

	while (row > 0 || column > 0) {
		if (row > 0 && column > 0 && oldMid[row - 1] === newMid[column - 1]) {
			diff.unshift({ value: oldMid[row - 1] });
			row -= 1;
			column -= 1;
		} else if (column > 0 && (row === 0 || dp[row][column - 1] >= dp[row - 1][column])) {
			diff.unshift({ value: newMid[column - 1], added: true });
			column -= 1;
		} else {
			diff.unshift({ value: oldMid[row - 1], removed: true });
			row -= 1;
		}
	}

	return [...prefix, ...diff, ...suffix];
};

export interface DiffTask extends Task {
	_status?: 'added' | 'removed' | 'modified' | 'unchanged';
	_originalTask?: Task;
}

export interface DiffColumn extends Column {
	tasks: DiffTask[];
	_status?: 'added' | 'removed' | 'modified' | 'unchanged';
}

const tagDiffSignature = (tag: Tag) =>
	`${(tag.label || '').trim()}|${(tag.color || '').trim() || ''}`;

const areTagsEqual = (left: Tag[], right: Tag[]) => {
	const leftSet = new Set((left || []).map(tagDiffSignature));
	const rightSet = new Set((right || []).map(tagDiffSignature));

	if (leftSet.size !== rightSet.size) {
		return false;
	}

	for (const item of leftSet) {
		if (!rightSet.has(item)) {
			return false;
		}
	}

	return true;
};

/** Compare task fields that matter for AI proposal review (matches the diff snapshot). */
export const areKanbanTasksEqualForDiff = (left: Task, right: Task) => {
	if ((left.title || '').trim() !== (right.title || '').trim()) return false;
	if ((left.description || '').trim() !== (right.description || '').trim()) return false;
	if ((left.color || '').trim() !== (right.color || '').trim()) return false;
	if (Boolean(left.hasCheckbox) !== Boolean(right.hasCheckbox)) return false;
	if (Boolean(left.checked) !== Boolean(right.checked)) return false;
	if ((left.completedAt ?? null) !== (right.completedAt ?? null)) return false;
	if ((normalizeDueTimestamp(left.countdownAt) ?? null) !== (normalizeDueTimestamp(right.countdownAt) ?? null)) {
		return false;
	}
	if ((normalizeDueTimestamp(left.alarmAt) ?? null) !== (normalizeDueTimestamp(right.alarmAt) ?? null)) {
		return false;
	}
	if ((left.assignedTo || '').trim() !== (right.assignedTo || '').trim()) return false;

	return areTagsEqual(left.tags || [], right.tags || []);
};

const areColumnsEqual = (left: Column, right: Column) => {
	if (left.title.trim() !== right.title.trim()) return false;
	if ((left.color || '').trim() !== (right.color || '').trim()) return false;
	return (left.width ?? DEFAULT_COLUMN_WIDTH) === (right.width ?? DEFAULT_COLUMN_WIDTH);
};

export const computeKanbanDiff = (original: KanbanData, proposed: KanbanData): DiffColumn[] => {
	const mergedColumns: DiffColumn[] = [];
	const originalColumnMap = new Map(original.map((column) => [column.id, column]));
	const proposedColumnMap = new Map(proposed.map((column) => [column.id, column]));
	const originalTaskById = new Map<string, Task>();

	for (const column of original) {
		for (const task of column.tasks) {
			originalTaskById.set(task.id, task);
		}
	}

	for (const proposedColumn of proposed) {
		const originalColumn = originalColumnMap.get(proposedColumn.id);

		if (!originalColumn) {
			mergedColumns.push({
				...proposedColumn,
				tasks: proposedColumn.tasks.map((task) => ({ ...task, _status: 'added' })),
				_status: 'added'
			});
			continue;
		}

		const mergedTasks: DiffTask[] = [];
		const proposedTaskMap = new Map(proposedColumn.tasks.map((task) => [task.id, task]));

		for (const proposedTask of proposedColumn.tasks) {
			const originalTask = originalTaskById.get(proposedTask.id);

			if (!originalTask) {
				mergedTasks.push({ ...proposedTask, _status: 'added' });
				continue;
			}

			mergedTasks.push({
				...proposedTask,
				_status: areKanbanTasksEqualForDiff(originalTask, proposedTask) ? 'unchanged' : 'modified',
				_originalTask: originalTask
			});
		}

		for (const originalTask of originalColumn.tasks) {
			if (!proposedTaskMap.has(originalTask.id)) {
				mergedTasks.push({ ...originalTask, _status: 'removed', _originalTask: originalTask });
			}
		}

		mergedColumns.push({
			...proposedColumn,
			tasks: mergedTasks,
			_status: areColumnsEqual(originalColumn, proposedColumn) ? 'unchanged' : 'modified'
		});
	}

	for (const originalColumn of original) {
		if (!proposedColumnMap.has(originalColumn.id)) {
			mergedColumns.push({
				...originalColumn,
				tasks: originalColumn.tasks.map((task) => ({ ...task, _status: 'removed' })),
				_status: 'removed'
			});
		}
	}

	return mergedColumns;
};
