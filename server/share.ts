import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';
import { normalizeBoardPreferences } from '../src/lib/kainbu/boardPreferences.js';
import { createShareSlug } from '../src/lib/kainbu/shareSlug.js';
import type {
	BackgroundTheme,
	BoardPreferences,
	KanbanData,
	ProjectColumnRow,
	ProjectTaskRow,
	Tag,
	Task
} from '../src/lib/kainbu/types.js';
import {
	getProjectPbId,
	getProjectRecord,
	pbEscapeFilter,
	projectClientFilter,
	projectRelationFilter,
	resolveProjectClientId
} from './pbWorkspace.js';
import { createAdminPb, getAuthenticatedUserId } from './pocketbase.js';

const DEFAULT_COLUMN_WIDTH = 268;
const DEFAULT_TAG_COLOR = '#94a3b8';

class ShareApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

type WorkspaceBoardShareRequest = {
	projectId: string;
	boardId: string;
	sharePublic?: boolean;
};

const requireString = (value: unknown, field: string) => {
	if (typeof value !== 'string' || !value.trim()) {
		throw new ShareApiError(400, `${field} is required.`);
	}
	return value.trim();
};

const relationId = (value: unknown) => {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && typeof (value as { id?: string }).id === 'string') {
		return (value as { id: string }).id;
	}
	return '';
};

const getOptionalUserId = async (authorization: string | undefined) => {
	if (!authorization?.startsWith('Bearer ')) return null;
	try {
		return await getAuthenticatedUserId(authorization);
	} catch {
		return null;
	}
};

const getMembership = async (admin: PocketBase, projectId: string, userId: string) => {
	const projectPbId = await getProjectPbId(admin, projectId);
	try {
		return await admin
			.collection('project_memberships')
			.getFirstListItem(
				`${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`
			);
	} catch {
		return null;
	}
};

const ensureOwnerProject = async (admin: PocketBase, projectId: string, userId: string) => {
	const project = await getProjectRecord(admin, projectId);
	if (relationId(project.owner) !== userId) {
		throw new ShareApiError(403, 'Only the project owner can perform this action.');
	}
	return project;
};

const mapTaskRow = (row: ProjectTaskRow): Task => ({
	id: row.id,
	title: row.title,
	description: row.description,
	...(row.color ? { color: row.color } : {}),
	tags: Array.isArray(row.tags)
		? row.tags.flatMap((tag) =>
				tag && typeof tag === 'object' && typeof tag.id === 'string' && typeof tag.label === 'string'
					? [
							{
								id: tag.id,
								label: tag.label,
								color:
									typeof tag.color === 'string' && tag.color.trim() ? tag.color : DEFAULT_TAG_COLOR
							}
						]
					: []
			)
		: [],
	hasCheckbox: row.has_checkbox,
	checked: row.checked,
	...(row.completed_at != null ? { completedAt: row.completed_at } : {}),
	...(row.countdown_at != null ? { countdownAt: row.countdown_at } : {}),
	...(row.alarm_at != null ? { alarmAt: row.alarm_at } : {}),
	...(row.assigned_to ? { assignedTo: row.assigned_to } : {}),
	...(Array.isArray(row.linked_task_ids) && row.linked_task_ids.length
		? {
				linkedTaskIds: row.linked_task_ids.filter(
					(entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
				)
			}
		: {}),
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

const buildKanbanData = (columns: ProjectColumnRow[], tasks: ProjectTaskRow[]): KanbanData => {
	const tasksByColumn = new Map<string, Task[]>();

	for (const row of [...tasks].sort((left, right) => left.position - right.position)) {
		const current = tasksByColumn.get(row.column_id) || [];
		current.push(mapTaskRow(row));
		tasksByColumn.set(row.column_id, current);
	}

	return [...columns]
		.sort((left, right) => left.position - right.position)
		.map((row) => ({
			id: row.id,
			title: row.title,
			...(row.color ? { color: row.color } : {}),
			width: row.width || DEFAULT_COLUMN_WIDTH,
			tasks: tasksByColumn.get(row.id) || []
		}));
};

const buildBoardClientIdByPbId = (boardRecords: Array<Record<string, unknown>>) =>
	new Map(
		boardRecords.map((record) => [String(record.id), String(record.client_id || record.id)])
	);

const resolveBoardClientIdForRecord = (
	record: Record<string, unknown>,
	boardClientIdByPbId: Map<string, string>
) => {
	const boardPbId = relationId(record.board);
	if (!boardPbId) return null;
	return boardClientIdByPbId.get(boardPbId) || null;
};

const iso = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value : new Date().toISOString();

const mapPbColumn = (
	record: Record<string, unknown>,
	projectId: string,
	boardId: string | null
): ProjectColumnRow => ({
	project_id: projectId,
	board_id: boardId,
	id: String(record.client_id || record.id),
	title: String(record.title || ''),
	color: typeof record.color === 'string' ? record.color : null,
	width: typeof record.width === 'number' ? record.width : DEFAULT_COLUMN_WIDTH,
	position: typeof record.position === 'number' ? record.position : 0,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

const mapPbTask = (
	record: Record<string, unknown>,
	projectId: string,
	boardId: string | null
): ProjectTaskRow => ({
	project_id: projectId,
	board_id: boardId,
	id: String(record.client_id || record.id),
	column_id: String(record.column_id || ''),
	title: String(record.title || ''),
	description: String(record.description || ''),
	color: typeof record.color === 'string' ? record.color : null,
	tags: Array.isArray(record.tags) ? (record.tags as Tag[]) : [],
	has_checkbox: Boolean(record.has_checkbox),
	checked: Boolean(record.checked),
	completed_at: typeof record.completed_at === 'number' ? record.completed_at : null,
	countdown_at: typeof record.countdown_at === 'number' ? record.countdown_at : null,
	alarm_at: typeof record.alarm_at === 'number' ? record.alarm_at : null,
	assigned_to: record.assigned_to ? relationId(record.assigned_to) : null,
	linked_task_ids: Array.isArray(record.linked_task_ids)
		? (record.linked_task_ids as string[])
		: null,
	position: typeof record.position === 'number' ? record.position : 0,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

const buildWorkspaceRedirectUrl = (projectId: string, boardId: string) =>
	`/?project=${encodeURIComponent(projectId)}&view=kanban&board=${encodeURIComponent(boardId)}`;

const buildShareUrl = (slug: string, origin?: string) => {
	const base = (origin || '').replace(/\/$/, '');
	return base ? `${base}/b/${slug}` : `/b/${slug}`;
};

const allocateShareSlug = async (admin: PocketBase) => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const slug = createShareSlug();
		try {
			await admin.collection('project_boards').getFirstListItem(
				`share_slug = "${pbEscapeFilter(slug)}"`
			);
		} catch (error) {
			if (error instanceof ClientResponseError && error.status === 404) {
				return slug;
			}
			throw error;
		}
	}
	throw new ShareApiError(500, 'Unable to allocate a unique share slug.');
};

const getBoardByShareSlug = async (admin: PocketBase, slug: string) => {
	try {
		return await admin.collection('project_boards').getFirstListItem(
			`share_slug = "${pbEscapeFilter(slug)}"`
		);
	} catch (error) {
		if (error instanceof ClientResponseError && error.status === 404) {
			throw new ShareApiError(404, 'Shared board not found.');
		}
		throw error;
	}
};

const getBoardByClientId = async (admin: PocketBase, projectId: string, boardId: string) => {
	const projectPbId = await getProjectPbId(admin, projectId);
	try {
		return await admin.collection('project_boards').getFirstListItem(
			`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(boardId)}"`
		);
	} catch (error) {
		if (error instanceof ClientResponseError && error.status === 404) {
			throw new ShareApiError(404, 'Board not found.');
		}
		throw error;
	}
};

const loadBoardSnapshot = async (
	admin: PocketBase,
	projectId: string,
	boardClientId: string
) => {
	const projectPbId = await getProjectPbId(admin, projectId);
	const [projectRecord, boardRecords, columnRecords, taskRecords] = await Promise.all([
		getProjectRecord(admin, projectId),
		admin.collection('project_boards').getFullList({
			filter: projectRelationFilter(projectPbId),
			sort: 'position'
		}),
		admin.collection('project_columns').getFullList({
			filter: projectRelationFilter(projectPbId),
			sort: 'position'
		}),
		admin.collection('project_tasks').getFullList({
			filter: projectRelationFilter(projectPbId),
			sort: 'position'
		})
	]);

	const boardRecord = boardRecords.find(
		(record) => String(record.client_id || record.id) === boardClientId
	);
	if (!boardRecord) {
		throw new ShareApiError(404, 'Board not found.');
	}

	const boardClientIdByPbId = buildBoardClientIdByPbId(boardRecords);
	const columns = columnRecords.map((record) =>
		mapPbColumn(record, projectId, resolveBoardClientIdForRecord(record, boardClientIdByPbId))
	);
	const tasks = taskRecords.map((record) =>
		mapPbTask(record, projectId, resolveBoardClientIdForRecord(record, boardClientIdByPbId))
	);

	const boardPreferences = normalizeBoardPreferences(boardRecord.preferences);
	const kanbanData = buildKanbanData(
		columns.filter((column) => (column.board_id || boardClientId) === boardClientId),
		tasks.filter((task) => (task.board_id || boardClientId) === boardClientId)
	);

	return {
		projectName: String(projectRecord.name || ''),
		boardName: String(boardRecord.name || ''),
		backgroundTheme:
			projectRecord.background_theme && typeof projectRecord.background_theme === 'object'
				? (projectRecord.background_theme as BackgroundTheme)
				: null,
		boardPreferences,
		kanbanData
	};
};

export const toShareApiError = (error: unknown) => {
	if (error instanceof ShareApiError) {
		return { status: error.status, message: error.message };
	}
	if (error instanceof Error) {
		return {
			status: error.message === 'Unauthorized' ? 401 : 500,
			message: error.message
		};
	}
	return { status: 500, message: 'Unknown error' };
};

export const handleWorkspaceBoardShareRequest = async (
	body: WorkspaceBoardShareRequest,
	authorization: string | undefined,
	origin?: string
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const boardId = requireString(body.boardId, 'boardId');

	await ensureOwnerProject(admin, projectId, userId);
	const boardRecord = await getBoardByClientId(admin, projectId, boardId);

	let shareSlug =
		typeof boardRecord.share_slug === 'string' && boardRecord.share_slug.trim()
			? boardRecord.share_slug.trim()
			: '';
	if (!shareSlug) {
		shareSlug = await allocateShareSlug(admin);
	}

	const sharePublic =
		typeof body.sharePublic === 'boolean' ? body.sharePublic : boardRecord.share_public === true;

	const updated = await admin.collection('project_boards').update(boardRecord.id, {
		share_slug: shareSlug,
		share_public: sharePublic
	});

	const resolvedSlug = String(updated.share_slug || shareSlug);
	return {
		shareSlug: resolvedSlug,
		sharePublic: updated.share_public === true,
		shareUrl: buildShareUrl(resolvedSlug, origin)
	};
};

export const handlePublicBoardShareRequest = async (
	slug: string,
	authorization: string | undefined
) => {
	const normalizedSlug = slug.trim();
	if (!normalizedSlug) {
		throw new ShareApiError(400, 'Share slug is required.');
	}

	const admin = await createAdminPb();
	const boardRecord = await getBoardByShareSlug(admin, normalizedSlug);
	const projectPbId = relationId(boardRecord.project);
	const projectClientId = await resolveProjectClientId(admin, projectPbId);
	const boardClientId = String(boardRecord.client_id || boardRecord.id);
	const sharePublic = boardRecord.share_public === true;
	const userId = await getOptionalUserId(authorization);
	const membership = userId ? await getMembership(admin, projectClientId, userId) : null;
	const canEdit = Boolean(membership);
	const redirectTo = canEdit
		? buildWorkspaceRedirectUrl(projectClientId, boardClientId)
		: undefined;

	if (!sharePublic && !canEdit) {
		throw new ShareApiError(403, 'This board is private. Sign in if you have access.');
	}

	const snapshot = await loadBoardSnapshot(admin, projectClientId, boardClientId);

	return {
		sharePublic,
		canEdit,
		...(redirectTo ? { redirectTo } : {}),
		projectId: projectClientId,
		boardId: boardClientId,
		projectName: snapshot.projectName,
		boardName: snapshot.boardName,
		kanbanData: snapshot.kanbanData,
		boardPreferences: snapshot.boardPreferences,
		backgroundTheme: snapshot.backgroundTheme
	};
};
