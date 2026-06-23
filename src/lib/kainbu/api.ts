import { pocketbase } from '$lib/pocketbaseClient';
import { ensureFreshAuthToken, refreshAuthToken } from '$lib/kainbu/authSession';
import { invokeWorkspaceApi as invokeSharedWorkspaceApi, setWorkspaceApiConfig } from '$lib/kainbu/workspaceApi';

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

/** Production builds use same-origin `/api` (nginx or Vite proxy). Dev uses Vite proxy too. */
const inferDefaultApiBaseUrl = () => {
	if (typeof window === 'undefined') {
		return 'http://127.0.0.1:8788';
	}
	// In Capacitor (native app) the origin is localhost — use the real server instead
	const isNative = window.location.protocol === 'capacitor:' ||
		(window.location.hostname === 'localhost' && window.location.port === '');
	if (isNative) return 'https://kainbu.avarnic.com';
	return '';
};

const apiBaseUrl = normalizeBaseUrl(
	import.meta.env.VITE_API_BASE_URL || import.meta.env.PUBLIC_API_BASE_URL || inferDefaultApiBaseUrl()
);

setWorkspaceApiConfig({
	getApiBaseUrl: () => apiBaseUrl,
	getAccessToken: () => ensureFreshAuthToken(pocketbase),
	refreshAccessToken: () => refreshAuthToken(pocketbase)
});

export const getWorkspaceApiAccessToken = () => ensureFreshAuthToken(pocketbase);

export const invokeWorkspaceApi = invokeSharedWorkspaceApi;

export const resolveWorkspaceApiUrl = (path: string) => {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
};
