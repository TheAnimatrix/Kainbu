import { ClientResponseError } from 'pocketbase';

/** Allow parallel list reads (workspace fetch, pagination) without auto-cancelling each other. */
export const pbNoAutoCancel = { requestKey: null } as const;

export const isPocketBaseAbort = (error: unknown): boolean =>
	error instanceof ClientResponseError && error.isAbort;
