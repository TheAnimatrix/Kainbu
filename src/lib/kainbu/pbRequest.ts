import { ClientResponseError } from 'pocketbase';

/** Allow parallel list reads (workspace fetch, pagination) without auto-cancelling each other. */
export const pbNoAutoCancel = { requestKey: null } as const;

const isAutocancelMessage = (message: string) => /autocancell?ed/i.test(message);

/** True for superseded PocketBase requests — not a user-facing failure. */
export const isPocketBaseAbort = (error: unknown): boolean => {
	if (error instanceof ClientResponseError) {
		if (error.isAbort || error.status === 0) return true;
		if (isAutocancelMessage(error.message || '')) return true;
	}
	if (error instanceof Error && isAutocancelMessage(error.message)) return true;
	return false;
};

/** Skip sync/workspace banners for benign PocketBase noise. */
export const shouldIgnorePocketBaseError = (error: unknown): boolean => isPocketBaseAbort(error);
