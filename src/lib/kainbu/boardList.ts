import {
	BOARD_LIST_TASKS_DEFAULT_LIMIT,
	BOARD_LIST_TASKS_MAX_LIMIT as BOARD_LIST_MAX
} from '$lib/kainbu/constants';
import {
	buildBoardRefIndex,
	resolveColumnRef,
	type BoardRefMap
} from '$lib/kainbu/boardRefs';
import type { KanbanData, Task } from '$lib/kainbu/types';

export type BoardColumnListItem = {
	ref: string;
	id: string;
	title: string;
	taskCount: number;
};

export type BoardTaskListItem = {
	ref: string;
	id: string;
	title: string;
	description?: string;
	columnRef: string;
	columnTitle: string;
};

export type PaginatedBoardTasks = {
	tasks: BoardTaskListItem[];
	hasMore: boolean;
	nextOffset?: number;
	total: number;
};

export const listBoardColumns = (kanban: KanbanData, boardName: string): BoardColumnListItem[] => {
	const refs = buildBoardRefIndex(kanban, boardName, 10_000);
	return kanban.map((column) => ({
		ref: refs.columnIdToRef.get(column.id) || column.id,
		id: column.id,
		title: column.title,
		taskCount: column.tasks.length
	}));
};

export const listBoardTasksPaginated = (
	kanban: KanbanData,
	boardName: string,
	options: {
		columnRef?: string;
		offset?: number;
		limit?: number;
		refs?: BoardRefMap;
	} = {}
): PaginatedBoardTasks & { error?: string } => {
	const refs = options.refs || buildBoardRefIndex(kanban, boardName, 10_000);
	const safeOffset = Math.max(0, Math.floor(options.offset ?? 0));
	const safeLimit = Math.max(
		1,
		Math.min(BOARD_LIST_MAX, Math.floor(options.limit ?? BOARD_LIST_TASKS_DEFAULT_LIMIT))
	);

	const flattenTasks = (): Array<{ task: Task; columnRef: string; columnTitle: string }> => {
		const entries: Array<{ task: Task; columnRef: string; columnTitle: string }> = [];
		for (const column of kanban) {
			const columnRef = refs.columnIdToRef.get(column.id) || column.id;
			for (const task of column.tasks) {
				entries.push({ task, columnRef, columnTitle: column.title });
			}
		}
		return entries;
	};

	if (options.columnRef) {
		const columnId = resolveColumnRef(refs, options.columnRef);
		if (!columnId) {
			return {
				tasks: [],
				hasMore: false,
				total: 0,
				error: `Unknown column ref "${options.columnRef}".`
			};
		}

		const column = kanban.find((entry) => entry.id === columnId);
		if (!column) {
			return {
				tasks: [],
				hasMore: false,
				total: 0,
				error: `Column not found for ref "${options.columnRef}".`
			};
		}

		const columnRef = refs.columnIdToRef.get(column.id) || column.id;
		const slice = column.tasks.slice(safeOffset, safeOffset + safeLimit);
		const hasMore = safeOffset + slice.length < column.tasks.length;

		return {
			tasks: slice.map((task) => ({
				ref: refs.taskIdToRef.get(task.id) || task.id,
				id: task.id,
				title: task.title,
				...(task.description ? { description: task.description } : {}),
				columnRef,
				columnTitle: column.title
			})),
			hasMore,
			...(hasMore ? { nextOffset: safeOffset + slice.length } : {}),
			total: column.tasks.length
		};
	}

	const all = flattenTasks();
	const slice = all.slice(safeOffset, safeOffset + safeLimit);
	const hasMore = safeOffset + slice.length < all.length;

	return {
		tasks: slice.map(({ task, columnRef, columnTitle }) => ({
			ref: refs.taskIdToRef.get(task.id) || task.id,
			id: task.id,
			title: task.title,
			...(task.description ? { description: task.description } : {}),
			columnRef,
			columnTitle
		})),
		hasMore,
		...(hasMore ? { nextOffset: safeOffset + slice.length } : {}),
		total: all.length
	};
};
