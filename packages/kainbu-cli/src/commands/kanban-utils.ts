import {
	buildBoardRefIndex,
	findColumnByRefOrTitle,
	resolveColumnRef,
	resolveTaskRef,
	type BoardRefMap
} from '@kainbu/core';
import type { KanbanData, Task } from '../../../../src/lib/kainbu/types.js';

export { buildBoardRefIndex, findColumnByRefOrTitle, resolveColumnRef, resolveTaskRef };
export type { BoardRefMap };

export const findTaskByRefOrId = (kanban: KanbanData, refs: BoardRefMap, target: string) => {
	const taskId = resolveTaskRef(refs, target) || target;
	for (const column of kanban) {
		const task = column.tasks.find((entry) => entry.id === taskId);
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
