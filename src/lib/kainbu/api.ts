import { pocketbase } from '$lib/pocketbaseClient';
import { invokeWorkspaceApi as invokeSharedWorkspaceApi, setWorkspaceApiConfig } from '$lib/kainbu/workspaceApi';

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

/** Production builds use same-origin `/api` (nginx or Vite proxy). Dev uses Vite proxy too. */
const inferDefaultApiBaseUrl = () => {
	if (typeof window === 'undefined') {
		return 'http://127.0.0.1:8788';
	}
	return '';
};

const apiBaseUrl = normalizeBaseUrl(
	import.meta.env.VITE_API_BASE_URL || import.meta.env.PUBLIC_API_BASE_URL || inferDefaultApiBaseUrl()
);

setWorkspaceApiConfig({
	getApiBaseUrl: () => apiBaseUrl,
	getAccessToken: async () => {
		const token = pocketbase.authStore.token;
		if (!token) {
			throw new Error('You need to sign in again before using workspace actions.');
		}
		return token;
	}
});

export const getWorkspaceApiAccessToken = async () => {
	const token = pocketbase.authStore.token;
	if (!token) {
		throw new Error('You need to sign in again before using workspace actions.');
	}
	return token;
};

export const invokeWorkspaceApi = invokeSharedWorkspaceApi;

export const resolveWorkspaceApiUrl = (path: string) => {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
};
