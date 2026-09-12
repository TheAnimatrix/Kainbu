import type PocketBase from 'pocketbase';
import { DEFAULT_COLUMN_WIDTH } from './constants.js';
import { normalizeDueTimestamp } from './timing.js';
import { isPocketBaseRecordId } from './recordIds.js';
import type { Project, Tag, Task } from './types.js';

/**
 * Board (kanban) write logic shared by the web app and the server API.
 *
 * The web app drives this with the browser PocketBase client (a real user
 * session); the Hono API drives the same code with the admin client on behalf
 * of an API-key request. Keeping a single implementation means the CLI's
 * API-only writes and the web app's direct writes can never drift.
 *
 * Everything here takes an explicit `pb` client — nothing reaches for a global
 * `getPb()` — so it is safe to import from the server (no `$lib` runtime).
 */

type KanbanData = Project['kanbanData'];
type KanbanColumn = KanbanData[number];

/** Keep deletion state locally so undo and retries carry an explicit previous value. */
export const retainDeletedTasks = (
	previous: KanbanData,
	next: KanbanData,
	now = Date.now()
): KanbanData => {
	const nextIds = new Set(next.flatMap((column) => column.tasks.map((task) => task.id)));
	return next.map((column) => ({
		...column,
		tasks: [
			...column.tasks,
			...(previous.find((old) => old.id === column.id)?.tasks || [])
				.filter((task) => !nextIds.has(task.id))
				.map((task) => ({ ...task, deletedAt: task.deletedAt || now }))
		]
	}));
};

const normalizeLinkedTaskIds = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
		)
	];
};

const tagSignature = (tag: Tag) => `${tag.id}|${tag.label}|${tag.color}`;
const linkSignature = (ids: string[] | undefined) => [...new Set(ids || [])].sort().join('|');

const areTasksEqual = (left: Task, right: Task) => {
	if (left.title !== right.title) return false;
	if ((left.deletedAt || 0) !== (right.deletedAt || 0)) return false;
	if ((left.description || '') !== (right.description || '')) return false;
	if ((left.color || '') !== (right.color || '')) return false;
	if ((left.hasCheckbox || false) !== (right.hasCheckbox || false)) return false;
	if ((left.checked || false) !== (right.checked || false)) return false;
	if (left.completedAt !== right.completedAt) return false;
	if (left.countdownAt !== right.countdownAt) return false;
	if (left.alarmAt !== right.alarmAt) return false;
	if ((left.assignedTo || '') !== (right.assignedTo || '')) return false;
	if (linkSignature(left.linkedTaskIds) !== linkSignature(right.linkedTaskIds)) return false;

	const leftTags = (left.tags || []).map(tagSignature).sort();
	const rightTags = (right.tags || []).map(tagSignature).sort();
	if (leftTags.length !== rightTags.length) return false;
	return leftTags.every((entry, index) => entry === rightTags[index]);
};

const mapColumnUpsertRow = (
	projectId: string,
	boardId: string,
	column: KanbanColumn,
	position: number
) => ({
	project_id: projectId,
	board_id: boardId,
	id: column.id,
	title: column.title,
	color: column.color || null,
	width: column.width ?? DEFAULT_COLUMN_WIDTH,
	position
});

const mapTaskUpsertRow = (
	projectId: string,
	boardId: string,
	columnId: string,
	task: Task,
	position: number
) => ({
	project_id: projectId,
	board_id: boardId,
	id: task.id,
	column_id: columnId,
	title: task.title,
	description: task.description || '',
	color: task.color || null,
	tags: task.tags || [],
	has_checkbox: Boolean(task.hasCheckbox),
	checked: Boolean(task.checked),
	completed_at: task.completedAt ?? null,
	countdown_at: normalizeDueTimestamp(task.countdownAt) ?? null,
	alarm_at: normalizeDueTimestamp(task.alarmAt) ?? null,
	assigned_to: isPocketBaseRecordId(task.assignedTo) ? task.assignedTo.trim() : null,
	linked_task_ids: normalizeLinkedTaskIds(task.linkedTaskIds),
	position,
	deleted_at: task.deletedAt ?? null
});

export type BoardMutations = {
	upsertColumns: Array<
		ReturnType<typeof mapColumnUpsertRow> & { previous?: ReturnType<typeof mapColumnUpsertRow> }
	>;
	upsertTasks: Array<
		ReturnType<typeof mapTaskUpsertRow> & { previous?: ReturnType<typeof mapTaskUpsertRow> }
	>;
	deleteColumns: ReturnType<typeof mapColumnUpsertRow>[];
	deleteTasks: ReturnType<typeof mapTaskUpsertRow>[];
};

/**
 * Pure diff between two board snapshots. Produces the minimal set of column /
 * task upserts and deletes needed to make `previous` look like `next`.
 */
export const deriveBoardMutations = (
	projectId: string,
	boardId: string,
	previous: KanbanData,
	next: KanbanData
): BoardMutations => {
	const upsertColumns: BoardMutations['upsertColumns'] = [];
	const upsertTasks: BoardMutations['upsertTasks'] = [];
	const deleteColumnIds: string[] = [];
	const deleteTaskIds: string[] = [];
	const previousColumns = new Map(previous.map((column, index) => [column.id, { column, index }]));
	const previousTasks = new Map(
		previous.flatMap((column) =>
			column.tasks.map(
				(task, index) =>
					[
						task.id,
						{
							task,
							columnId: column.id,
							position: index
						}
					] as const
			)
		)
	);
	const nextTaskIds = new Set<string>();

	for (const [index, column] of next.entries()) {
		const previousColumn = previousColumns.get(column.id);
		if (
			!previousColumn ||
			previousColumn.index !== index ||
			previousColumn.column.title !== column.title ||
			(previousColumn.column.color || '') !== (column.color || '') ||
			(previousColumn.column.width ?? DEFAULT_COLUMN_WIDTH) !==
				(column.width ?? DEFAULT_COLUMN_WIDTH)
		) {
			upsertColumns.push({
				...mapColumnUpsertRow(projectId, boardId, column, index),
				...(previousColumn
					? {
							previous: mapColumnUpsertRow(
								projectId,
								boardId,
								previousColumn.column,
								previousColumn.index
							)
						}
					: {})
			});
		}

		for (const [taskIndex, task] of column.tasks.entries()) {
			nextTaskIds.add(task.id);
			const previousTask = previousTasks.get(task.id);
			if (
				!previousTask ||
				previousTask.columnId !== column.id ||
				previousTask.position !== taskIndex ||
				!areTasksEqual(previousTask.task, task)
			) {
				upsertTasks.push({
					...mapTaskUpsertRow(projectId, boardId, column.id, task, taskIndex),
					...(previousTask
						? {
								previous: mapTaskUpsertRow(
									projectId,
									boardId,
									previousTask.columnId,
									previousTask.task,
									previousTask.position
								)
							}
						: {})
				});
			}
		}
	}

	for (const column of previous) {
		if (!next.some((entry) => entry.id === column.id)) {
			deleteColumnIds.push(column.id);
		}
	}

	for (const taskId of previousTasks.keys()) {
		if (!nextTaskIds.has(taskId)) {
			deleteTaskIds.push(taskId);
		}
	}

	return {
		upsertColumns,
		upsertTasks,
		deleteColumns: deleteColumnIds.map((id) => {
			const old = previousColumns.get(id)!;
			return mapColumnUpsertRow(projectId, boardId, old.column, old.index);
		}),
		deleteTasks: deleteTaskIds.map((id) => {
			const old = previousTasks.get(id)!;
			return mapTaskUpsertRow(projectId, boardId, old.columnId, old.task, old.position);
		})
	};
};

/** Apply field-level changes and conflict checks atomically inside PocketBase. */
export const syncBoardWithPb = async (
	pb: PocketBase,
	projectId: string,
	boardId: string,
	previous: KanbanData,
	next: KanbanData,
	userId?: string
) => {
	const mutations = deriveBoardMutations(projectId, boardId, previous, next);
	if (!Object.values(mutations).some((rows) => rows.length)) return;
	await pb.send('/api/kainbu/board-sync', {
		method: 'POST',
		body: { projectId, boardId, mutations, ...(userId ? { userId } : {}) },
		requestKey: null
	});
};
