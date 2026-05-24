import { buildBackgroundStoragePath } from '$lib/kainbu/backgrounds';
import type { BackgroundTheme } from '$lib/kainbu/types';
import { pocketbase } from '$lib/pocketbaseClient';
import { pbEscapeFilter } from '$lib/kainbu/pbRecords';

export const uploadBackgroundImage = async (
	scope: 'user' | 'project',
	scopeId: string,
	file: File
): Promise<Extract<BackgroundTheme, { kind: 'image' }>> => {
	const path = buildBackgroundStoragePath(scope, scopeId, file.name, file.type);
	const ownerId = scope === 'user' ? scopeId : pocketbase.authStore.model?.id;
	if (!ownerId) {
		throw new Error('You must be signed in to upload a background.');
	}

	try {
		const existing = await pocketbase.collection('background_files').getFirstListItem(
			`owner = "${pbEscapeFilter(ownerId)}" && path = "${pbEscapeFilter(path)}"`
		);
		await pocketbase.collection('background_files').update(existing.id, {
			file
		});
	} catch {
		await pocketbase.collection('background_files').create({
			owner: ownerId,
			path,
			file
		});
	}

	return {
		kind: 'image',
		path
	};
};

export const deleteBackgroundImage = async (path: string) => {
	if (!path.trim()) return;
	const ownerId = pocketbase.authStore.model?.id;
	if (!ownerId) return;

	try {
		const existing = await pocketbase.collection('background_files').getFirstListItem(
			`owner = "${pbEscapeFilter(ownerId)}" && path = "${pbEscapeFilter(path)}"`
		);
		await pocketbase.collection('background_files').delete(existing.id);
	} catch {
		// already deleted
	}
};

export const createBackgroundSignedUrl = async (path: string) => {
	const ownerId = pocketbase.authStore.model?.id;
	if (!ownerId) {
		throw new Error('You must be signed in to load backgrounds.');
	}

	const record = await pocketbase.collection('background_files').getFirstListItem(
		`owner = "${pbEscapeFilter(ownerId)}" && path = "${pbEscapeFilter(path)}"`
	);

	return pocketbase.files.getURL(record, record.file);
};
