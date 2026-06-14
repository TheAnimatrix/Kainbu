type AvatarRecord = {
	id: string;
	avatar?: string | string[] | null;
};

export const resolveAvatarFilename = (record: AvatarRecord) => {
	const value = record.avatar;
	if (typeof value === 'string' && value.trim()) {
		return value.trim();
	}
	if (Array.isArray(value)) {
		const first = value.find((entry) => typeof entry === 'string' && entry.trim());
		return typeof first === 'string' ? first.trim() : null;
	}
	return null;
};

/**
 * Build a PocketBase file URL for an avatar. Server-safe: the caller passes
 * the PB client explicitly so this file doesn't need to import the Svelte
 * singleton.
 */
export const getAvatarUrlFromClient = (
	client: { files: { getURL: (record: { id: string }, filename: string) => string } },
	record: AvatarRecord,
	filename?: string | null
) => {
	const avatar = filename ?? resolveAvatarFilename(record);
	if (!avatar) return null;
	return client.files.getURL(record, avatar);
};
