import {
	buildBoardRefIndex,
	resolveColumnRef,
	resolveTaskRef,
	type BoardRefMap
} from '@kainbu/core';
import type { KanbanData } from '../../../../src/lib/kainbu/types.js';

import { resolveByIdOrName, type MatchMode } from './shared.js';
export { buildBoardRefIndex, resolveColumnRef, resolveTaskRef };
export const findColumnByRefOrTitle = (
	kanban: KanbanData,
	refs: BoardRefMap,
	target: string,
	mode: MatchMode = {}
) => {
	const byId = kanban.find((column) => column.id === target.trim());
	if (byId) return byId;
	const ref = resolveColumnRef(refs, target);
	if (ref) return kanban.find((column) => column.id === ref)!;
	const selected = resolveByIdOrName(
		kanban.map((column) => ({ ...column, name: column.title })),
		target,
		'column',
		mode
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
