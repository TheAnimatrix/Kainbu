import { ClientResponseError } from 'pocketbase';

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
