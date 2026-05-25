/** PocketBase default record id (15-char alphanumeric). */
export const POCKETBASE_RECORD_ID_PATTERN = /^[a-z0-9]{15}$/i;

export const isPocketBaseRecordId = (value: string | undefined | null): value is string =>
	typeof value === 'string' && POCKETBASE_RECORD_ID_PATTERN.test(value.trim());
