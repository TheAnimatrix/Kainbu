import { ClientResponseError } from 'pocketbase';

export const isPocketBaseNotFound = (error: unknown): boolean =>
	error instanceof ClientResponseError && error.status === 404;

/** 404 on the signed-in user's own users record — stale token or deleted account. */
export const isOwnUserRecordNotFound = (error: unknown, userId: string): boolean => {
	if (!isPocketBaseNotFound(error) || !userId) return false;
	const encoded = encodeURIComponent(userId);
	return (
		(error as ClientResponseError).url?.includes(`/users/records/${encoded}`) ||
		(error as ClientResponseError).url?.includes(`/users/records/${userId}`)
	);
};

/** Surface PocketBase validation / rule errors instead of generic "Failed to create record." */
export function formatPocketBaseError(error: unknown, fallback: string): string {
	if (!(error instanceof ClientResponseError)) {
		return error instanceof Error ? error.message : fallback;
	}

	const data = error.response?.data as Record<string, unknown> | undefined;
	if (data && typeof data === 'object') {
		const fieldMessages = Object.entries(data)
			.filter(([key]) => key !== 'message')
			.flatMap(([field, value]) => {
				if (typeof value === 'object' && value && 'message' in value) {
					return [`${field}: ${String((value as { message: unknown }).message)}`];
				}
				if (typeof value === 'string') return [`${field}: ${value}`];
				return [];
			});
		if (fieldMessages.length) return fieldMessages.join(' ');
	}

	return error.message || fallback;
}
