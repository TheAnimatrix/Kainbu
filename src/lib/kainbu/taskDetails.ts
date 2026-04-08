import { supabase } from '$lib/supabaseClient';
import { createId } from '$lib/kainbu/id';
import type {
	ProjectTaskAssetRow,
	ProjectTaskCommentRow,
	TaskAsset,
	TaskAssetKind,
	TaskComment
} from '$lib/kainbu/types';

export const TASK_ASSET_STORAGE_BUCKET = 'task-assets';

const DEFAULT_FILE_MIME_TYPE = 'application/octet-stream';

type StorageErrorLike = {
	message?: string;
	error?: string;
};

const normalizeStorageErrorMessage = (error: StorageErrorLike | null | undefined) =>
	`${error?.message || ''} ${error?.error || ''}`.trim().toLowerCase();

const isBucketNotFoundError = (error: StorageErrorLike | null | undefined) => {
	const message = normalizeStorageErrorMessage(error);
	return message.includes('bucket') && message.includes('not found');
};

const toTaskAssetStorageError = (
	error: StorageErrorLike | null | undefined,
	action: 'upload' | 'delete' | 'download'
) => {
	if (isBucketNotFoundError(error)) {
		return new Error(
			`Attachment storage is not configured. Bucket "${TASK_ASSET_STORAGE_BUCKET}" was not found. Apply migration "202603310001_task_assets_comments.sql" and retry ${action}.`
		);
	}
	return error instanceof Error
		? error
		: new Error(error?.message || `Unable to ${action} attachment.`);
};

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

const mapTaskAssetRow = (row: ProjectTaskAssetRow): TaskAsset => ({
	id: row.id,
	projectId: row.project_id,
	taskId: row.task_id,
	kind: row.kind,
	name: row.name,
	mimeType: row.mime_type,
	sizeBytes: Number(row.size_bytes) || 0,
	storagePath: row.storage_path,
	uploadedByUserId: row.uploaded_by_user_id,
	createdAt: new Date(row.created_at).getTime()
});

const mapTaskCommentRow = (row: ProjectTaskCommentRow): TaskComment => ({
	id: row.id,
	projectId: row.project_id,
	taskId: row.task_id,
	body: row.body,
	authorUserId: row.author_user_id,
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

export const fetchTaskAssets = async (projectId: string, taskId: string) => {
	const { data, error } = await supabase
		.from('project_task_assets')
		.select('*')
		.eq('project_id', projectId)
		.eq('task_id', taskId)
		.order('created_at', { ascending: false });

	if (error) throw error;
	return ((data || []) as ProjectTaskAssetRow[]).map(mapTaskAssetRow);
};

export const fetchTaskComments = async (projectId: string, taskId: string) => {
	const { data, error } = await supabase
		.from('project_task_comments')
		.select('*')
		.eq('project_id', projectId)
		.eq('task_id', taskId)
		.order('created_at', { ascending: true });

	if (error) throw error;
	return ((data || []) as ProjectTaskCommentRow[]).map(mapTaskCommentRow);
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
	const assetId = createId();
	const mimeType = file.type || DEFAULT_FILE_MIME_TYPE;
	const storagePath = buildTaskAssetStoragePath(projectId, taskId, assetId, file.name);
	const { error: uploadError } = await supabase.storage
		.from(TASK_ASSET_STORAGE_BUCKET)
		.upload(storagePath, file, {
			contentType: mimeType,
			cacheControl: '3600',
			upsert: false
		});

	if (uploadError) throw toTaskAssetStorageError(uploadError, 'upload');

	const { data, error } = await supabase
		.from('project_task_assets')
		.insert({
			id: assetId,
			project_id: projectId,
			task_id: taskId,
			kind,
			name: file.name || 'file',
			mime_type: mimeType,
			size_bytes: file.size,
			storage_path: storagePath
		})
		.select('*')
		.single();

	if (error) {
		await supabase.storage.from(TASK_ASSET_STORAGE_BUCKET).remove([storagePath]);
		throw error;
	}

	return mapTaskAssetRow(data as ProjectTaskAssetRow);
};

export const deleteTaskAsset = async (asset: TaskAsset) => {
	const { error: storageError } = await supabase.storage
		.from(TASK_ASSET_STORAGE_BUCKET)
		.remove([asset.storagePath]);

	if (storageError) throw toTaskAssetStorageError(storageError, 'delete');

	const { error } = await supabase
		.from('project_task_assets')
		.delete()
		.eq('project_id', asset.projectId)
		.eq('id', asset.id);

	if (error) throw error;
};

export const addTaskComment = async (projectId: string, taskId: string, body: string) => {
	const trimmedBody = body.trim();
	if (!trimmedBody.length) {
		throw new Error('Comment cannot be empty.');
	}

	const { data, error } = await supabase
		.from('project_task_comments')
		.insert({
			project_id: projectId,
			task_id: taskId,
			body: trimmedBody
		})
		.select('*')
		.single();

	if (error) throw error;
	return mapTaskCommentRow(data as ProjectTaskCommentRow);
};

export const downloadTaskAssetBlob = async (storagePath: string) => {
	const { data, error } = await supabase.storage
		.from(TASK_ASSET_STORAGE_BUCKET)
		.download(storagePath);

	if (error) throw toTaskAssetStorageError(error, 'download');
	return data;
};
