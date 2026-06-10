import { hasLeadingCardCheckboxLine, stripLeadingCardCheckboxLine } from '$lib/kainbu/taskMarkdown';
import type { Task } from '$lib/kainbu/types';

export const normalizeBoardSearchQuery = (query: string) => query.trim().toLowerCase();

const normalizeSearchableText = (text: string) =>
	text.replace(/\s+/g, ' ').trim().toLowerCase();

const getTaskSearchableTitle = (task: Task) => {
	const raw =
		task.hasCheckbox && hasLeadingCardCheckboxLine(task.title || '')
			? stripLeadingCardCheckboxLine(task.title || '')
			: task.title || '';
	return normalizeSearchableText(raw);
};

const getTaskSearchableFields = (task: Task) => {
	const fields = [getTaskSearchableTitle(task)];

	if (task.description?.trim()) {
		fields.push(normalizeSearchableText(task.description));
	}

	for (const tag of task.tags ?? []) {
		if (tag.label?.trim()) {
			fields.push(normalizeSearchableText(tag.label));
		}
	}

	return fields;
};

export const taskMatchesBoardSearch = (task: Task, query: string) => {
	const normalized = normalizeBoardSearchQuery(query);
	if (!normalized) return true;
	return getTaskSearchableFields(task).some((field) => field.includes(normalized));
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
