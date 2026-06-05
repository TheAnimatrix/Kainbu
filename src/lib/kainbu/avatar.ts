import { pocketbase } from '$lib/pocketbaseClient';

export const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const getAvatarUploadError = (file: { type: string; size: number }) => {
	if (
		!AVATAR_ALLOWED_MIME_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number])
	) {
		return 'Use a PNG, JPEG, or WebP image for your profile picture.';
	}

	if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
		return 'Profile pictures must be 2 MB or smaller.';
	}

	return '';
};

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

export const getUserAvatarUrl = (
	record: AvatarRecord,
	filename?: string | null,
	client = pocketbase
) => {
	const avatar = filename ?? resolveAvatarFilename(record);
	if (!avatar) return null;
	return client.files.getURL(record, avatar);
};

export const getAvatarInitial = (label: string) => {
	const trimmed = label.trim();
	return (trimmed[0] || '?').toUpperCase();
};

export const getAvatarInitials = (label: string, length: 1 | 2 = 2) => {
	const trimmed = label.trim();
	if (!trimmed) return length === 2 ? '??' : '?';

	const parts = trimmed
		.replace(/^@/, '')
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean);

	if (length === 1) {
		return (parts[0]?.[0] || trimmed[0] || '?').toUpperCase();
	}

	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}

	const compact = parts[0] || trimmed;
	if (compact.length >= 2) {
		return compact.slice(0, 2).toUpperCase();
	}

	const letter = (compact[0] || '?').toUpperCase();
	return `${letter}${letter}`;
};
