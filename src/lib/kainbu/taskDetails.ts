import { pocketbase } from '$lib/pocketbaseClient';
import { createId } from '$lib/kainbu/id';
import { getProjectPbId } from '$lib/kainbu/pbHelpers';
import { pbEscapeFilter, projectRelationFilter } from '$lib/kainbu/pbRecords';
import type { TaskAsset, TaskAssetKind, TaskComment } from '$lib/kainbu/types';

const DEFAULT_FILE_MIME_TYPE = 'application/octet-stream';

const sanitizeFileName = (name: string) => {
	const trimmed = name.trim() || 'file';
	return trimmed
		.replace(/[^\w.\-() ]+/g, '-')
		.replace(/\s+/g, ' ')
		.slice(0, 120);
};

export const buildTaskAssetStoragePath = (
	projectId: string,
	taskId: string,
	assetId: string,
	fileName: string
) => `project/${projectId}/task/${taskId}/${assetId}/${sanitizeFileName(fileName)}`;

const mapTaskAssetRecord = (record: Record<string, unknown>, projectId: string): TaskAsset => ({
	id: String(record.id),
	projectId,
	taskId: String(record.task_client_id || ''),
	kind: record.kind === 'embed' ? 'embed' : 'attachment',
	name: String(record.name || ''),
	mimeType: String(record.mime_type || DEFAULT_FILE_MIME_TYPE),
	sizeBytes: typeof record.size_bytes === 'number' ? record.size_bytes : 0,
	storagePath: buildTaskAssetStoragePath(
		projectId,
		String(record.task_client_id || ''),
		String(record.id),
		String(record.name || 'file')
	),
	uploadedByUserId:
		typeof record.uploaded_by === 'string'
			? record.uploaded_by
			: String((record.expand as { uploaded_by?: { id?: string } })?.uploaded_by?.id || ''),
	createdAt: new Date(String(record.created || Date.now())).getTime()
});

const mapTaskCommentRecord = (record: Record<string, unknown>, projectId: string): TaskComment => ({
	id: String(record.id),
	projectId,
	taskId: String(record.task_client_id || ''),
	body: String(record.body || ''),
	authorUserId:
		typeof record.author === 'string'
			? record.author
			: String((record.expand as { author?: { id?: string } })?.author?.id || ''),
	createdAt: new Date(String(record.created || Date.now())).getTime(),
	updatedAt: new Date(String(record.updated || record.created || Date.now())).getTime()
});

export const fetchTaskAssets = async (projectId: string, taskId: string) => {
	const projectPbId = await getProjectPbId(projectId);
	const records = await pocketbase.collection('project_task_assets').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && task_client_id = "${pbEscapeFilter(taskId)}"`,
		sort: '-created'
	});
	return records.map((record) => mapTaskAssetRecord(record, projectId));
};

export const fetchTaskComments = async (projectId: string, taskId: string) => {
	const projectPbId = await getProjectPbId(projectId);
	const records = await pocketbase.collection('project_task_comments').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && task_client_id = "${pbEscapeFilter(taskId)}"`,
		sort: 'created'
	});
	return records.map((record) => mapTaskCommentRecord(record, projectId));
};

export const fetchTaskDetails = async (projectId: string, taskId: string) => {
	const [assets, comments] = await Promise.all([
		fetchTaskAssets(projectId, taskId),
		fetchTaskComments(projectId, taskId)
	]);

	return {
		assets,
		comments
	};
};

export const uploadTaskAsset = async (
	projectId: string,
	taskId: string,
	file: File,
	kind: TaskAssetKind
) => {
	const projectPbId = await getProjectPbId(projectId);
	const mimeType = file.type || DEFAULT_FILE_MIME_TYPE;
	const userId = pocketbase.authStore.model?.id;
	if (!userId) {
		throw new Error('You must be signed in to upload attachments.');
	}

	const record = await pocketbase.collection('project_task_assets').create({
		project: projectPbId,
		task_client_id: taskId,
		kind,
		name: file.name || 'file',
		mime_type: mimeType,
		size_bytes: file.size,
		uploaded_by: userId,
		file
	});

	return mapTaskAssetRecord(record, projectId);
};

export const deleteTaskAsset = async (asset: TaskAsset) => {
	await pocketbase.collection('project_task_assets').delete(asset.id);
};

export const addTaskComment = async (projectId: string, taskId: string, body: string) => {
	const trimmedBody = body.trim();
	if (!trimmedBody.length) {
		throw new Error('Comment cannot be empty.');
	}

	const userId = pocketbase.authStore.model?.id;
	if (!userId) {
		throw new Error('You must be signed in to comment.');
	}

	const projectPbId = await getProjectPbId(projectId);
	const record = await pocketbase.collection('project_task_comments').create({
		project: projectPbId,
		task_client_id: taskId,
		body: trimmedBody,
		author: userId
	});

	return mapTaskCommentRecord(record, projectId);
};

export const downloadTaskAssetBlob = async (asset: TaskAsset) => {
	const record = await pocketbase.collection('project_task_assets').getOne(asset.id);
	const url = pocketbase.files.getURL(record, record.file);
	const response = await fetch(url, {
		headers: {
			Authorization: pocketbase.authStore.token ? `Bearer ${pocketbase.authStore.token}` : ''
		}
	});
	if (!response.ok) {
		throw new Error('Unable to download attachment.');
	}
	return response.blob();
};
