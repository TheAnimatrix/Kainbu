import type PocketBase from 'pocketbase';
import { createAdminPb, resolveAuthenticatedUserId } from './pocketbase.js';
import { getProjectPbId, pbEscapeFilter, projectRelationFilter } from './pbWorkspace.js';
import {
	WorkspaceApiError,
	ensureMembership,
	findProjectChildByClientId,
	requireString
} from './workspace.js';
import { normalizeBoardPreferences } from '../src/lib/kainbu/boardPreferences.js';

// ---------------------------------------------------------------------------
// Task / page details (comments and attachments), board preferences and
// ordering. The web app reaches these collections through its PocketBase
// session; API-key callers such as the CLI have no session, so these handlers
// expose the same records after checking project membership.
// ---------------------------------------------------------------------------

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_COMMENT_LENGTH = 20_000;

type AssetTarget = 'task' | 'page';

const ASSET_COLLECTION: Record<AssetTarget, { collection: string; field: string }> = {
	task: { collection: 'project_task_assets', field: 'task_client_id' },
	page: { collection: 'page_assets', field: 'page_client_id' }
};

const requireTarget = (value: unknown): AssetTarget => {
	if (value === 'task' || value === 'page') return value;
	throw new WorkspaceApiError(400, 'target must be "task" or "page".');
};

const relationId = (value: unknown) => (typeof value === 'string' ? value : '');

const access = async (authorization: string | undefined, projectId: unknown) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const id = requireString(projectId, 'projectId');
	await ensureMembership(admin, id, userId);
	return { userId, admin, projectId: id, projectPbId: await getProjectPbId(admin, id) };
};

/** Comments and uploads must point at a live task or page of the same project. */
const requireLiveTarget = async (
	admin: PocketBase,
	projectPbId: string,
	target: AssetTarget,
	targetId: string
) => {
	const record = await findProjectChildByClientId(
		admin,
		target === 'task' ? 'project_tasks' : 'project_pages',
		projectPbId,
		targetId
	);
	if (!record || (target === 'task' && Number(record.deleted_at) > 0))
		throw new WorkspaceApiError(404, target === 'task' ? 'Task not found.' : 'Page not found.');
	return record;
};

const usernamesById = async (admin: PocketBase, userIds: string[]) => {
	const ids = [...new Set(userIds.filter(Boolean))];
	if (!ids.length) return new Map<string, string | null>();
	const users = await admin.collection('users').getFullList({
		filter: ids.map((id) => `id = "${pbEscapeFilter(id)}"`).join(' || '),
		fields: 'id,username'
	});
	return new Map(
		users.map((user) => [
			String(user.id),
			typeof user.username === 'string' && user.username.trim() ? user.username.trim() : null
		])
	);
};

const mapAsset = (
	record: Record<string, unknown>,
	target: AssetTarget,
	usernames: Map<string, string | null>
) => {
	const uploadedBy = relationId(record.uploaded_by);
	return {
		id: String(record.id),
		target,
		targetId: String(record[ASSET_COLLECTION[target].field] || ''),
		kind: record.kind === 'embed' ? 'embed' : 'attachment',
		name: String(record.name || ''),
		mimeType: String(record.mime_type || 'application/octet-stream'),
		sizeBytes: typeof record.size_bytes === 'number' ? record.size_bytes : 0,
		uploadedBy,
		uploadedByUsername: usernames.get(uploadedBy) ?? null,
		createdAt: Date.parse(String(record.created || '')) || 0
	};
};

const mapComment = (record: Record<string, unknown>, usernames: Map<string, string | null>) => {
	const author = relationId(record.author);
	return {
		id: String(record.id),
		taskId: String(record.task_client_id || ''),
		body: String(record.body || ''),
		authorUserId: author,
		authorUsername: usernames.get(author) ?? null,
		createdAt: Date.parse(String(record.created || '')) || 0,
		updatedAt: Date.parse(String(record.updated || record.created || '')) || 0
	};
};

export const handleTaskCommentListRequest = async (
	query: { projectId?: string; taskId?: string },
	authorization: string | undefined
) => {
	const { admin, projectPbId } = await access(authorization, query.projectId);
	const taskId = requireString(query.taskId, 'taskId');
	const records = await admin.collection('project_task_comments').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && task_client_id = "${pbEscapeFilter(taskId)}"`,
		sort: 'created'
	});
	const usernames = await usernamesById(
		admin,
		records.map((record) => relationId(record.author))
	);
	return { comments: records.map((record) => mapComment(record, usernames)) };
};

export const handleTaskCommentCreateRequest = async (
	body: { projectId?: string; taskId?: string; body?: string },
	authorization: string | undefined
) => {
	const { userId, admin, projectPbId } = await access(authorization, body.projectId);
	const taskId = requireString(body.taskId, 'taskId');
	const text = requireString(body.body, 'body');
	if (text.length > MAX_COMMENT_LENGTH)
		throw new WorkspaceApiError(413, `Comments are limited to ${MAX_COMMENT_LENGTH} characters.`);
	await requireLiveTarget(admin, projectPbId, 'task', taskId);
	const record = await admin.collection('project_task_comments').create({
		project: projectPbId,
		task_client_id: taskId,
		body: text,
		author: userId
	});
	return { ok: true, comment: mapComment(record, await usernamesById(admin, [userId])) };
};

export const handleTaskCommentDeleteRequest = async (
	body: { projectId?: string; commentId?: string },
	authorization: string | undefined
) => {
	const { userId, admin, projectPbId } = await access(authorization, body.projectId);
	const commentId = requireString(body.commentId, 'commentId');
	let record;
	try {
		record = await admin.collection('project_task_comments').getOne(commentId);
	} catch {
		throw new WorkspaceApiError(404, 'Comment not found.');
	}
	if (relationId(record.project) !== projectPbId)
		throw new WorkspaceApiError(404, 'Comment not found.');
	if (relationId(record.author) !== userId)
		throw new WorkspaceApiError(403, 'Only the comment author can delete it.');
	await admin.collection('project_task_comments').delete(record.id);
	return { ok: true, id: commentId, deleted: true };
};

export const handleAssetListRequest = async (
	query: { projectId?: string; target?: string; targetId?: string },
	authorization: string | undefined
) => {
	const { admin, projectPbId } = await access(authorization, query.projectId);
	const target = requireTarget(query.target);
	const targetId = requireString(query.targetId, 'targetId');
	const { collection, field } = ASSET_COLLECTION[target];
	const records = await admin.collection(collection).getFullList({
		filter: `${projectRelationFilter(projectPbId)} && ${field} = "${pbEscapeFilter(targetId)}"`,
		sort: '-created'
	});
	const usernames = await usernamesById(
		admin,
		records.map((record) => relationId(record.uploaded_by))
	);
	return { assets: records.map((record) => mapAsset(record, target, usernames)) };
};

export const handleAssetUploadRequest = async (
	form: Record<string, unknown>,
	authorization: string | undefined
) => {
	const { userId, admin, projectPbId } = await access(authorization, form.projectId);
	const target = requireTarget(form.target);
	const targetId = requireString(form.targetId, 'targetId');
	const file = form.file;
	if (!(file instanceof File)) throw new WorkspaceApiError(400, 'file is required.');
	if (file.size > MAX_ASSET_BYTES)
		throw new WorkspaceApiError(413, 'Attachments are limited to 20 MB.');
	const kind = form.kind === 'embed' ? 'embed' : 'attachment';
	await requireLiveTarget(admin, projectPbId, target, targetId);
	const { collection, field } = ASSET_COLLECTION[target];
	const name = (file.name || 'file').slice(0, 255);
	const record = await admin.collection(collection).create({
		project: projectPbId,
		[field]: targetId,
		kind,
		name,
		mime_type: (file.type || 'application/octet-stream').slice(0, 128),
		size_bytes: file.size,
		uploaded_by: userId,
		file
	});
	return { ok: true, asset: mapAsset(record, target, await usernamesById(admin, [userId])) };
};

const getProjectAsset = async (
	admin: PocketBase,
	projectPbId: string,
	target: AssetTarget,
	assetId: string
) => {
	const { collection } = ASSET_COLLECTION[target];
	let record;
	try {
		record = await admin.collection(collection).getOne(assetId);
	} catch {
		throw new WorkspaceApiError(404, 'Attachment not found.');
	}
	if (relationId(record.project) !== projectPbId)
		throw new WorkspaceApiError(404, 'Attachment not found.');
	return record;
};

export const handleAssetDownloadRequest = async (
	query: { projectId?: string; target?: string; assetId?: string },
	authorization: string | undefined
) => {
	const { admin, projectPbId } = await access(authorization, query.projectId);
	const target = requireTarget(query.target);
	const record = await getProjectAsset(
		admin,
		projectPbId,
		target,
		requireString(query.assetId, 'assetId')
	);
	// Asset files are protected; the superuser file token authorizes the read.
	const token = await admin.files.getToken();
	const response = await fetch(admin.files.getURL(record, String(record.file), { token }));
	if (!response.ok || !response.body)
		throw new WorkspaceApiError(502, `Attachment storage returned HTTP ${response.status}.`);
	return {
		body: response.body,
		name: String(record.name || 'file'),
		mimeType: String(record.mime_type || 'application/octet-stream'),
		contentLength: response.headers.get('content-length')
	};
};

export const handleAssetDeleteRequest = async (
	body: { projectId?: string; target?: string; assetId?: string },
	authorization: string | undefined
) => {
	const { admin, projectPbId } = await access(authorization, body.projectId);
	const target = requireTarget(body.target);
	const assetId = requireString(body.assetId, 'assetId');
	const record = await getProjectAsset(admin, projectPbId, target, assetId);
	await admin.collection(ASSET_COLLECTION[target].collection).delete(record.id);
	return { ok: true, id: assetId, deleted: true };
};

export const handleBoardPreferencesRequest = async (
	body: { projectId?: string; boardId?: string; preferences?: unknown },
	authorization: string | undefined
) => {
	const { admin, projectPbId } = await access(authorization, body.projectId);
	const boardId = requireString(body.boardId, 'boardId');
	const board = await findProjectChildByClientId(admin, 'project_boards', projectPbId, boardId);
	if (!board) throw new WorkspaceApiError(404, 'Board not found.');
	const patch = body.preferences;
	if (patch !== undefined && (typeof patch !== 'object' || patch === null || Array.isArray(patch)))
		throw new WorkspaceApiError(400, 'preferences must be an object.');
	const current = normalizeBoardPreferences(board.preferences);
	if (!patch) return { ok: true, preferences: current };
	const preferences = normalizeBoardPreferences({ ...current, ...patch });
	await admin.collection('project_boards').update(board.id, { preferences });
	return { ok: true, preferences };
};

/** Positions follow the supplied order; it must name every board/page in the project once. */
const reorderProjectChildren = async (
	collection: 'project_boards' | 'project_pages',
	body: { projectId?: string; ids?: unknown },
	authorization: string | undefined
) => {
	const { admin, projectPbId } = await access(authorization, body.projectId);
	const ids = body.ids;
	if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
		throw new WorkspaceApiError(400, 'ids must be an array of strings.');
	const records = await admin.collection(collection).getFullList({
		filter: projectRelationFilter(projectPbId)
	});
	const byClientId = new Map(records.map((record) => [String(record.client_id), record]));
	if (new Set(ids).size !== ids.length || ids.length !== records.length)
		throw new WorkspaceApiError(
			409,
			'The order must list every item exactly once. Refresh and retry.'
		);
	for (const id of ids)
		if (!byClientId.has(id))
			throw new WorkspaceApiError(409, `Unknown item ${id}. Refresh and retry.`);
	for (const [position, id] of ids.entries()) {
		const record = byClientId.get(id)!;
		if (Number(record.position) !== position)
			await admin.collection(collection).update(record.id, { position });
	}
	return { ok: true, ids };
};

export const handleBoardReorderRequest = (
	body: { projectId?: string; ids?: unknown },
	authorization: string | undefined
) => reorderProjectChildren('project_boards', body, authorization);

export const handlePageReorderRequest = (
	body: { projectId?: string; ids?: unknown },
	authorization: string | undefined
) => reorderProjectChildren('project_pages', body, authorization);

export const handleTaskMoveRequest = async (
	body: {
		projectId?: string;
		fromBoardId?: string;
		toBoardId?: string;
		columnId?: string;
		taskIds?: unknown;
	},
	authorization: string | undefined
) => {
	const { userId, admin, projectId } = await access(authorization, body.projectId);
	const taskIds = body.taskIds;
	if (!Array.isArray(taskIds) || !taskIds.length || !taskIds.every((id) => typeof id === 'string'))
		throw new WorkspaceApiError(400, 'taskIds must be a non-empty array of task IDs.');
	await admin.send('/api/kainbu/task-move', {
		method: 'POST',
		body: {
			projectId,
			userId,
			fromBoardId: requireString(body.fromBoardId, 'fromBoardId'),
			toBoardId: requireString(body.toBoardId, 'toBoardId'),
			columnId: requireString(body.columnId, 'columnId'),
			taskIds
		},
		requestKey: null
	});
	return { ok: true, taskIds };
};
