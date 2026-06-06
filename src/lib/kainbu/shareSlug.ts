const SHARE_SLUG_LENGTH = 8;
const SHARE_SLUG_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const createShareSlug = (length = SHARE_SLUG_LENGTH) => {
	const cryptoApi = globalThis.crypto;
	if (!cryptoApi?.getRandomValues) {
		throw new Error('Secure random is required to create share slugs.');
	}

	const bytes = cryptoApi.getRandomValues(new Uint8Array(length));
	let slug = '';
	for (let index = 0; index < length; index += 1) {
		slug += SHARE_SLUG_ALPHABET[bytes[index] % SHARE_SLUG_ALPHABET.length];
	}
	return slug;
};

export const isValidShareSlug = (value: string) =>
	typeof value === 'string' && /^[a-zA-Z0-9]{6,12}$/.test(value.trim());

export const buildBoardShareUrl = (
	slug: string,
	origin = typeof window !== 'undefined' ? window.location.origin : ''
) => {
	const normalizedSlug = slug.trim();
	if (!isValidShareSlug(normalizedSlug)) {
		throw new Error('Invalid share slug.');
	}
	const base = (origin || '').replace(/\/$/, '');
	return `${base}/b/${normalizedSlug}`;
};
