import { isPocketBaseAbort, pbNoAutoCancel } from '$lib/kainbu/pbRequest';
import { pocketbase } from '$lib/pocketbaseClient';
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
		...pbNoAutoCancel
	});
	return records
		.map((record) => mapTaskAssetRecord(record, projectId))
		.sort((left, right) => right.createdAt - left.createdAt);
};

/** Attachment counts keyed by task client id. Embeds live in the description, so they are excluded. */
export const fetchProjectAttachmentCounts = async (projectId: string) => {
	const projectPbId = await getProjectPbId(projectId);
	const records = await pocketbase.collection('project_task_assets').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && kind = "attachment"`,
		fields: 'task_client_id',
		...pbNoAutoCancel
	});
	const counts: Record<string, number> = {};
	for (const record of records) {
		const taskId = String(record.task_client_id || '');
		if (taskId) counts[taskId] = (counts[taskId] ?? 0) + 1;
	}
	return { projectPbId, counts };
};

/**
 * Keeps attachment counts for a project current: loads them once, then reloads whenever
 * an asset in the project is created, updated, or deleted (modal, CLI, or another client).
 */
export const watchProjectAttachmentCounts = (
	projectId: string,
	onCounts: (counts: Record<string, number>) => void
) => {
	let disposed = false;
	let unsubscribe: (() => void) | null = null;
	let reloadTimer: ReturnType<typeof setTimeout> | undefined;

	const load = async () => {
		const result = await fetchProjectAttachmentCounts(projectId);
		if (!disposed) onCounts(result.counts);
		return result.projectPbId;
	};

	const reportError = (stage: string, error: unknown) => {
		if (isPocketBaseAbort(error)) return;
		console.warn(`[kainbu] attachment counts ${stage} failed for project ${projectId}`, error);
	};

	void (async () => {
		try {
			const projectPbId = await load();
			if (disposed) return;
			const stop = await pocketbase.collection('project_task_assets').subscribe(
				'*',
				() => {
					if (reloadTimer) clearTimeout(reloadTimer);
					reloadTimer = setTimeout(() => {
						load().catch((error) => reportError('reload', error));
					}, 250);
				},
				{ filter: projectRelationFilter(projectPbId) }
			);
			if (disposed) stop();
			else unsubscribe = stop;
		} catch (error) {
			reportError('load', error);
		}
	})();

	return () => {
		disposed = true;
		if (reloadTimer) clearTimeout(reloadTimer);
		unsubscribe?.();
	};
};

export const fetchTaskComments = async (projectId: string, taskId: string) => {
	const projectPbId = await getProjectPbId(projectId);
	const records = await pocketbase.collection('project_task_comments').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && task_client_id = "${pbEscapeFilter(taskId)}"`,
		...pbNoAutoCancel
	});
	return records
		.map((record) => mapTaskCommentRecord(record, projectId))
		.sort((left, right) => left.createdAt - right.createdAt);
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
	const token = await pocketbase.files.getToken();
	const url = pocketbase.files.getURL(record, record.file, { token });
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
