import { hasLeadingCardCheckboxLine, stripLeadingCardCheckboxLine } from '$lib/kainbu/taskMarkdown';
import type { Task } from '$lib/kainbu/types';

export const normalizeBoardSearchQuery = (query: string) => query.trim().toLowerCase();

const getTaskSearchableTitle = (task: Task) => {
	const raw =
		task.hasCheckbox && hasLeadingCardCheckboxLine(task.title || '')
			? stripLeadingCardCheckboxLine(task.title || '')
			: task.title || '';
	return raw.replace(/\s+/g, ' ').trim().toLowerCase();
};

export const taskMatchesBoardSearch = (task: Task, query: string) => {
	const normalized = normalizeBoardSearchQuery(query);
	if (!normalized) return true;
	return getTaskSearchableTitle(task).includes(normalized);
};

export const filterColumnsForBoardSearch = <T extends { tasks: Task[] }>(
	columns: T[],
	query: string
): T[] => {
	const normalized = normalizeBoardSearchQuery(query);
	if (!normalized) return columns;

	return columns
		.map((column) => ({
			...column,
			tasks: column.tasks.filter((task) => taskMatchesBoardSearch(task, query))
		}))
		.filter((column) => column.tasks.length > 0);
};
