import type { BoardShareSettingsResponse, PublicBoardShareResponse } from '$lib/kainbu/types';
import { invokeWorkspaceApi } from '$lib/kainbu/api';
import { resolveWorkspaceApiUrl } from '$lib/kainbu/api';

export const updateBoardShareSettings = (payload: {
	projectId: string;
	boardId: string;
	sharePublic?: boolean;
}) =>
	invokeWorkspaceApi<BoardShareSettingsResponse>('/api/workspace/boards/share', {
		body: payload
	});

export const fetchPublicBoardShare = async (slug: string, accessToken?: string | null) => {
	const response = await fetch(resolveWorkspaceApiUrl(`/api/share/${encodeURIComponent(slug)}`), {
		headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
	});
	const payload = (await response.json().catch(() => null)) as
		| PublicBoardShareResponse
		| { error?: string; requiresAuth?: boolean }
		| null;

	if (!response.ok) {
		const message =
			payload && typeof payload === 'object' && 'error' in payload && payload.error
				? payload.error
				: 'Unable to load shared board.';
		const error = new Error(message) as Error & { status?: number; requiresAuth?: boolean };
		error.status = response.status;
		if (
			payload &&
			typeof payload === 'object' &&
			'requiresAuth' in payload &&
			payload.requiresAuth
		) {
			error.requiresAuth = true;
		}
		throw error;
	}

	return payload as PublicBoardShareResponse;
};
