import { pbNoAutoCancel } from '$lib/kainbu/pbRequest';
import { pocketbase } from '$lib/pocketbaseClient';
import { getProjectPbId } from '$lib/kainbu/pbHelpers';
import { pbEscapeFilter, projectRelationFilter } from '$lib/kainbu/pbRecords';
import type { TaskAssetKind } from '$lib/kainbu/types';

const DEFAULT_FILE_MIME_TYPE = 'application/octet-stream';

const sanitizeFileName = (name: string) => {
	const trimmed = name.trim() || 'file';
	return trimmed
		.replace(/[^\w.\-() ]+/g, '-')
		.replace(/\s+/g, ' ')
		.slice(0, 120);
};

export const buildPageAssetStoragePath = (
	projectId: string,
	pageId: string,
	assetId: string,
	fileName: string
) => `project/${projectId}/page/${pageId}/${assetId}/${sanitizeFileName(fileName)}`;

export type PageAsset = {
	id: string;
	projectId: string;
	pageId: string;
	kind: TaskAssetKind;
	name: string;
	mimeType: string;
	sizeBytes: number;
	storagePath: string;
	uploadedByUserId: string;
	createdAt: number;
};

const mapPageAssetRecord = (record: Record<string, unknown>, projectId: string): PageAsset => ({
	id: String(record.id),
	projectId,
	pageId: String(record.page_client_id || ''),
	kind: record.kind === 'embed' ? 'embed' : 'attachment',
	name: String(record.name || ''),
	mimeType: String(record.mime_type || DEFAULT_FILE_MIME_TYPE),
	sizeBytes: typeof record.size_bytes === 'number' ? record.size_bytes : 0,
	storagePath: buildPageAssetStoragePath(
		projectId,
		String(record.page_client_id || ''),
		String(record.id),
		String(record.name || 'file')
	),
	uploadedByUserId:
		typeof record.uploaded_by === 'string'
			? record.uploaded_by
			: String((record.expand as { uploaded_by?: { id?: string } })?.uploaded_by?.id || ''),
	createdAt: new Date(String(record.created || Date.now())).getTime()
});

export const fetchPageAssets = async (projectId: string, pageId: string) => {
	const projectPbId = await getProjectPbId(projectId);
	const records = await pocketbase.collection('page_assets').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && page_client_id = "${pbEscapeFilter(pageId)}"`,
		...pbNoAutoCancel
	});
	return records
		.map((record) => mapPageAssetRecord(record, projectId))
		.sort((left, right) => right.createdAt - left.createdAt);
};

export const uploadPageAsset = async (
	projectId: string,
	pageId: string,
	file: File,
	kind: TaskAssetKind
) => {
	const projectPbId = await getProjectPbId(projectId);
	const mimeType = file.type || DEFAULT_FILE_MIME_TYPE;
	const userId = pocketbase.authStore.model?.id;
	if (!userId) {
		throw new Error('You must be signed in to upload images.');
	}

	const record = await pocketbase.collection('page_assets').create({
		project: projectPbId,
		page_client_id: pageId,
		kind,
		name: file.name || 'file',
		mime_type: mimeType,
		size_bytes: file.size,
		uploaded_by: userId,
		file
	});

	return mapPageAssetRecord(record, projectId);
};

export const deletePageAsset = async (asset: PageAsset) => {
	await pocketbase.collection('page_assets').delete(asset.id);
};

export const downloadPageAssetBlob = async (asset: PageAsset) => {
	const record = await pocketbase.collection('page_assets').getOne(asset.id);
	const url = pocketbase.files.getURL(record, record.file);
	const response = await fetch(url, {
		headers: {
			Authorization: pocketbase.authStore.token ? `Bearer ${pocketbase.authStore.token}` : ''
		}
	});
	if (!response.ok) {
		throw new Error('Unable to download page asset.');
	}
	return response.blob();
};
