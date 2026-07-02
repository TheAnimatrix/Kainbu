import type PocketBase from 'pocketbase';
import { pbNoAutoCancel } from './pbRequest.js';
import { pbEscapeFilter, projectClientFilter, projectRelationFilter } from './pbRecords.js';
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
	upsertColumns: ReturnType<typeof mapColumnUpsertRow>[];
	upsertTasks: ReturnType<typeof mapTaskUpsertRow>[];
	deleteColumnIds: string[];
	deleteTaskIds: string[];
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
	const upsertColumns: ReturnType<typeof mapColumnUpsertRow>[] = [];
	const upsertTasks: ReturnType<typeof mapTaskUpsertRow>[] = [];
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
			upsertColumns.push(mapColumnUpsertRow(projectId, boardId, column, index));
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
				upsertTasks.push(mapTaskUpsertRow(projectId, boardId, column.id, task, taskIndex));
			}
		}
	}

	for (const column of previous) {
		if (!next.some((entry) => entry.id === column.id)) {
			deleteColumnIds.push(column.id);
		}
	}

	for (const [taskId, previousTask] of previousTasks.entries()) {
		if (!nextTaskIds.has(taskId) && !deleteColumnIds.includes(previousTask.columnId)) {
			upsertTasks.push(mapTaskUpsertRow(
				projectId, boardId, previousTask.columnId,
				{ ...previousTask.task, deletedAt: Date.now() },
				previousTask.position
			));
		}
	}

	return { upsertColumns, upsertTasks, deleteColumnIds, deleteTaskIds };
};

const getProjectPbId = async (pb: PocketBase, projectClientId: string) => {
	const record = await pb
		.collection('projects')
		.getFirstListItem(projectClientFilter(projectClientId));
	return String(record.id);
};

const getBoardPbId = async (pb: PocketBase, projectPbId: string, boardClientId: string) => {
	const record = await pb
		.collection('project_boards')
		.getFirstListItem(
			`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(boardClientId)}"`
		);
	return String(record.id);
};

const upsertProjectChild = async (
	pb: PocketBase,
	collection: string,
	projectPbId: string,
	clientId: string,
	body: Record<string, unknown>
) => {
	const filter = `${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(clientId)}"`;
	try {
		const existing = await pb.collection(collection).getFirstListItem(filter);
		await pb.collection(collection).update(existing.id, body);
	} catch {
		await pb.collection(collection).create({
			...body,
			project: projectPbId,
			client_id: clientId
		});
	}
};

const deleteByClientIds = async (
	pb: PocketBase,
	collection: string,
	projectPbId: string,
	clientIds: string[]
) => {
	if (!clientIds.length) return;
	const records = await pb.collection(collection).getFullList({
		filter: `${projectRelationFilter(projectPbId)} && (${clientIds
			.map((id) => `client_id = "${pbEscapeFilter(id)}"`)
			.join(' || ')})`,
		...pbNoAutoCancel
	});
	await Promise.all(records.map((record) => pb.collection(collection).delete(record.id)));
};

const upsertProjectTasks = async (
	pb: PocketBase,
	projectPbId: string,
	rows: ReturnType<typeof mapTaskUpsertRow>[],
	resolveBoardPbId: (boardClientId: string) => Promise<string>
) => {
	for (const row of rows) {
		const filter = `${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(row.id)}"`;
		const boardPbId = row.board_id ? await resolveBoardPbId(row.board_id) : '';
		const body = {
			board: boardPbId,
			column_id: row.column_id,
			title: row.title,
			description: row.description,
			color: row.color,
			tags: row.tags,
			has_checkbox: row.has_checkbox,
			checked: row.checked,
			completed_at: row.completed_at,
			countdown_at: row.countdown_at,
			alarm_at: row.alarm_at,
			assigned_to: row.assigned_to || '',
			linked_task_ids: row.linked_task_ids,
			position: row.position
		};
		if (row.deleted_at != null) {
			(body as Record<string, unknown>).deleted_at = row.deleted_at;
		}

		try {
			const existing = await pb.collection('project_tasks').getFirstListItem(filter);
			await pb.collection('project_tasks').update(existing.id, body);
		} catch {
			await pb.collection('project_tasks').create({
				...body,
				project: projectPbId,
				client_id: row.id
			});
		}
	}
};

const applyBoardMutations = async (
	pb: PocketBase,
	projectId: string,
	mutations: BoardMutations
) => {
	const projectPbId = await getProjectPbId(pb, projectId);
	const boardPbIdCache = new Map<string, string>();

	const resolveBoardPbId = async (boardClientId: string) => {
		if (!boardClientId) return '';
		const cached = boardPbIdCache.get(boardClientId);
		if (cached) return cached;
		const boardPbId = await getBoardPbId(pb, projectPbId, boardClientId);
		boardPbIdCache.set(boardClientId, boardPbId);
		return boardPbId;
	};

	for (const row of mutations.upsertColumns) {
		const boardPbId = row.board_id ? await resolveBoardPbId(row.board_id) : '';
		await upsertProjectChild(pb, 'project_columns', projectPbId, row.id, {
			board: boardPbId,
			title: row.title,
			color: row.color,
			width: row.width,
			position: row.position
		});
	}

	if (mutations.upsertTasks.length) {
		await upsertProjectTasks(pb, projectPbId, mutations.upsertTasks, resolveBoardPbId);

		// Bump board timestamps for any board that had soft-deleted tasks,
		// so the merge logic picks the local (more recent) state.
		const softDeletedBoardIds = new Set<string>();
		for (const row of mutations.upsertTasks) {
			if (row.deleted_at != null && row.board_id) {
				softDeletedBoardIds.add(row.board_id);
			}
		}
		for (const boardClientId of softDeletedBoardIds) {
			try {
				const boardPbId = await resolveBoardPbId(boardClientId);
				if (boardPbId) {
					await pb.collection('project_boards').update(boardPbId, {});
				}
			} catch {
				// Board may not exist yet — safe to skip
			}
		}
	}

	if (mutations.deleteColumnIds.length) {
		await deleteByClientIds(pb, 'project_columns', projectPbId, mutations.deleteColumnIds);
	}
};

/** Diff `previous` → `next` for one board and apply the result with `pb`. */
export const syncBoardWithPb = async (
	pb: PocketBase,
	projectId: string,
	boardId: string,
	previous: KanbanData,
	next: KanbanData
) => {
	await applyBoardMutations(pb, projectId, deriveBoardMutations(projectId, boardId, previous, next));
};
