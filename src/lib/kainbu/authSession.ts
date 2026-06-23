import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';
import { isOwnUserRecordNotFound } from '$lib/pocketbaseErrors';

let authRefreshInFlight: Promise<string> | null = null;

/** True when the error means the saved login can no longer be used. */
export const isStaleAuthError = (error: unknown, userId?: string): boolean => {
	if (userId && isOwnUserRecordNotFound(error, userId)) return true;

	if (error instanceof ClientResponseError && error.status === 401) return true;

	if (error && typeof error === 'object' && 'status' in error) {
		const status = (error as { status: unknown }).status;
		if (status === 401) return true;
	}

	if (error instanceof Error) {
		const message = error.message.trim();
		if (/^unauthorized\.?$/i.test(message)) return true;
		if (/sign in again/i.test(message)) return true;
		if (/session.*expired/i.test(message)) return true;
	}

	return false;
};

/** Refresh PocketBase auth when the stored JWT is expired; reuse one in-flight refresh. */
export const ensureFreshAuthToken = async (pb: PocketBase): Promise<string> => {
	const token = pb.authStore.token;
	if (!token) {
		throw new Error('You need to sign in again before using workspace actions.');
	}

	if (pb.authStore.isValid) {
		return token;
	}

	if (authRefreshInFlight) {
		return authRefreshInFlight;
	}

	authRefreshInFlight = (async () => {
		try {
			await pb.collection('users').authRefresh();
			const refreshed = pb.authStore.token;
			if (!refreshed) {
				throw new Error('Unauthorized');
			}
			return refreshed;
		} finally {
			authRefreshInFlight = null;
		}
	})();

	return authRefreshInFlight;
};

/** Force a token refresh (e.g. after a 401 from the workspace API). */
export const refreshAuthToken = async (pb: PocketBase): Promise<string> => {
	authRefreshInFlight = null;
	await pb.collection('users').authRefresh();
	const refreshed = pb.authStore.token;
	if (!refreshed) {
		throw new Error('Unauthorized');
	}
	return refreshed;
};
