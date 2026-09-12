import {
	buildBoardRefIndex,
	resolveColumnRef,
	resolveTaskRef,
	type BoardRefMap
} from '@kainbu/core';
import type { KanbanData, Task } from '../../../../src/lib/kainbu/types.js';

import { resolveByIdOrName } from './shared.js';
export { buildBoardRefIndex, resolveColumnRef, resolveTaskRef };
export const findColumnByRefOrTitle = (kanban: KanbanData, refs: BoardRefMap, target: string) => {
	const byId = kanban.find((column) => column.id === target.trim());
	if (byId) return byId;
	const ref = resolveColumnRef(refs, target);
	if (ref) return kanban.find((column) => column.id === ref)!;
	const selected = resolveByIdOrName(
		kanban.map((column) => ({ ...column, name: column.title })),
		target,
		'column'
	);
	return kanban.find((column) => column.id === selected.id)!;
};
export type { BoardRefMap };

export const findTaskByRefOrId = (kanban: KanbanData, refs: BoardRefMap, target: string) => {
	const taskId = kanban.some((column) => column.tasks.some((task) => task.id === target.trim()))
		? target.trim()
		: resolveTaskRef(refs, target) || target.trim();
	for (const column of kanban) {
		const task = column.tasks.find((entry) => entry.id === taskId && !entry.deletedAt);
		if (task) {
			return { column, task };
		}
	}
	return null;
};

export const moveTaskToColumn = (
	kanban: KanbanData,
	taskId: string,
	targetColumnId: string
): KanbanData => {
	let moving: Task | null = null;
	const stripped = kanban.map((column) => {
		const index = column.tasks.findIndex((task) => task.id === taskId);
		if (index === -1) return column;
		moving = column.tasks[index];
		return {
			...column,
			tasks: column.tasks.filter((task) => task.id !== taskId)
		};
	});

	if (!moving) {
		throw new Error('Task not found for move.');
	}

	return stripped.map((column) =>
		column.id === targetColumnId
			? {
					...column,
					tasks: [...column.tasks, moving as Task]
				}
			: column
	);
};
