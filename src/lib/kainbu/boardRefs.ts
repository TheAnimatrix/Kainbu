import type { KanbanData } from '$lib/kainbu/types';

export type BoardRefMap = {
	boardName: string;
	indexText: string;
	columnRefToId: Map<string, string>;
	taskRefToId: Map<string, string>;
	columnIdToRef: Map<string, string>;
	taskIdToRef: Map<string, string>;
};

export const buildBoardRefIndex = (
	kanban: KanbanData,
	boardName: string,
	maxLines = 120
): BoardRefMap => {
	const columnRefToId = new Map<string, string>();
	const taskRefToId = new Map<string, string>();
	const columnIdToRef = new Map<string, string>();
	const taskIdToRef = new Map<string, string>();

	let columnCounter = 0;
	let taskCounter = 0;
	const lines: string[] = [`Board: ${boardName}`, 'Internal refs (tools only — never show to user):'];

	for (const column of kanban) {
		if (lines.length >= maxLines) {
			lines.push('…(index truncated — use column list / task list)');
			break;
		}
		columnCounter += 1;
		const columnRef = `C${columnCounter}`;
		columnRefToId.set(columnRef, column.id);
		columnIdToRef.set(column.id, columnRef);
		lines.push(`${column.title} [${columnRef}]`);

		for (const task of column.tasks) {
			if (lines.length >= maxLines) {
				lines.push('…(index truncated — use column list / task list)');
				return {
					boardName,
					indexText: lines.join('\n'),
					columnRefToId,
					taskRefToId,
					columnIdToRef,
					taskIdToRef
				};
			}
			taskCounter += 1;
			const taskRef = `T${taskCounter}`;
			taskRefToId.set(taskRef, task.id);
			taskIdToRef.set(task.id, taskRef);
			lines.push(`  ${taskRef}  ${task.title}`);
		}
	}

	return {
		boardName,
		indexText: lines.join('\n'),
		columnRefToId,
		taskRefToId,
		columnIdToRef,
		taskIdToRef
	};
};

const trimString = (value: unknown) =>
	typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

export const resolveColumnRef = (refs: BoardRefMap, ref: string): string | null => {
	const trimmed = trimString(ref);
	if (!trimmed) return null;
	if (refs.columnRefToId.has(trimmed)) return refs.columnRefToId.get(trimmed)!;
	if (refs.columnIdToRef.has(trimmed)) return trimmed;
	const normalized = trimmed.toUpperCase();
	if (refs.columnRefToId.has(normalized)) return refs.columnRefToId.get(normalized)!;
	return null;
};

export const resolveTaskRef = (refs: BoardRefMap, ref: string): string | null => {
	const trimmed = trimString(ref);
	if (!trimmed) return null;
	if (refs.taskRefToId.has(trimmed)) return refs.taskRefToId.get(trimmed)!;
	if (refs.taskIdToRef.has(trimmed)) return trimmed;
	const normalized = trimmed.toUpperCase();
	if (refs.taskRefToId.has(normalized)) return refs.taskRefToId.get(normalized)!;
	return null;
};

export const findColumnByRefOrTitle = (
	kanban: KanbanData,
	refs: BoardRefMap,
	refOrTitle: string
) => {
	const columnId = resolveColumnRef(refs, refOrTitle);
	if (columnId) {
		return kanban.find((column) => column.id === columnId) || null;
	}

	const normalized = refOrTitle.trim().toLowerCase();
	return kanban.find((column) => column.title.toLowerCase() === normalized) || null;
};
