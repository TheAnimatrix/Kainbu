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

export type BoardTaskSortField = 'created' | 'modified' | 'title';

export const listBoardTasksPaginated = (
	kanban: KanbanData,
	boardName: string,
	options: {
		/** Legacy single-column include (ref/id/title). Folds into includeColumns. */
		columnRef?: string;
		/** Show only these columns (ref/id/title). */
		includeColumns?: string[];
		/** Hide these columns (ref/id/title). */
		excludeColumns?: string[];
		/** Keep only tasks with a non-empty markdown description. */
		hasContent?: boolean;
		/** Sort within each column. Default order is the board's task order. */
		sort?: { field: BoardTaskSortField; dir: 'asc' | 'desc' };
		offset?: number;
		limit?: number;
		/**
		 * Return every task from the offset onward, ignoring the default page
		 * size and the max-limit cap. Used by the CLI, which lists against an
		 * already-fetched in-memory snapshot and is expected to show all tasks.
		 */
		unbounded?: boolean;
		refs?: BoardRefMap;
	} = {}
): PaginatedBoardTasks & { error?: string } => {
	const refs = options.refs || buildBoardRefIndex(kanban, boardName, 10_000);
	const safeOffset = Math.max(0, Math.floor(options.offset ?? 0));
	const safeLimit = options.unbounded
		? Number.POSITIVE_INFINITY
		: Math.max(
				1,
				Math.min(BOARD_LIST_MAX, Math.floor(options.limit ?? BOARD_LIST_TASKS_DEFAULT_LIMIT))
			);

	// Resolve a column token (ref like "C2", record id, or title) to a column id.
	const resolveColumnToken = (token: string): string | null => {
		const trimmed = token.trim();
		if (!trimmed) return null;
		const byRef = resolveColumnRef(refs, trimmed);
		if (byRef) return byRef;
		if (kanban.some((column) => column.id === trimmed)) return trimmed;
		const exact = kanban.filter((column) => column.title.toLowerCase() === trimmed.toLowerCase());
		if (exact.length === 1) return exact[0].id;
		const partial = kanban.filter((column) =>
			column.title.toLowerCase().includes(trimmed.toLowerCase())
		);
		if (partial.length === 1) return partial[0].id;
		return null;
	};

	const resolveTokens = (tokens: string[]) => {
		const ids = new Set<string>();
		const unknown: string[] = [];
		for (const token of tokens) {
			if (!token.trim()) continue;
			const id = resolveColumnToken(token);
			if (id) ids.add(id);
			else unknown.push(token.trim());
		}
		return { ids, unknown };
	};

	const include = resolveTokens([
		...(options.columnRef ? [options.columnRef] : []),
		...(options.includeColumns ?? [])
	]);
	const exclude = resolveTokens(options.excludeColumns ?? []);
	const unknown = [...include.unknown, ...exclude.unknown];
	if (unknown.length) {
		return {
			tasks: [],
			hasMore: false,
			total: 0,
			error: `Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`
		};
	}

	const sortTasks = (tasks: Task[]): Task[] => {
		if (!options.sort) return tasks;
		const { field, dir } = options.sort;
		const factor = dir === 'desc' ? -1 : 1;
		return [...tasks].sort((left, right) => {
			const cmp =
				field === 'title'
					? left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
					: field === 'created'
						? (left.createdAt ?? 0) - (right.createdAt ?? 0)
						: (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
			// Stable tiebreak so equal keys keep a deterministic order.
			return cmp * factor || left.id.localeCompare(right.id);
		});
	};

	// Flatten in board/column order so the result stays grouped by column;
	// filtering and sorting apply within each column.
	const entries: Array<{ task: Task; columnRef: string; columnTitle: string }> = [];
	for (const column of kanban) {
		if (include.ids.size && !include.ids.has(column.id)) continue;
		if (exclude.ids.has(column.id)) continue;
		const columnRef = refs.columnIdToRef.get(column.id) || column.id;
		let tasks = column.tasks;
		if (options.hasContent) tasks = tasks.filter((task) => Boolean(task.description?.trim()));
		for (const task of sortTasks(tasks)) {
			entries.push({ task, columnRef, columnTitle: column.title });
		}
	}

	const slice = entries.slice(safeOffset, safeOffset + safeLimit);
	const hasMore = safeOffset + slice.length < entries.length;

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
		total: entries.length
	};
};
