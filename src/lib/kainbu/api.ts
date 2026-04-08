import { supabase } from '$lib/supabaseClient';

const DEFAULT_PRODUCTION_API_BASE_URL = 'https://kainbu.vercel.app';

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');
const isLocalHostname = (hostname: string) =>
	hostname === 'localhost' ||
	hostname === '127.0.0.1' ||
	hostname.endsWith('.local') ||
	/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);

const inferDefaultApiBaseUrl = () => {
	if (import.meta.env.DEV) {
		return '';
	}

	if (typeof window === 'undefined') {
		return 'http://127.0.0.1:8788';
	}

	if (/^https?:$/.test(window.location.protocol)) {
		return isLocalHostname(window.location.hostname)
			? `${window.location.protocol}//${window.location.hostname}:8788`
			: '';
	}

	return DEFAULT_PRODUCTION_API_BASE_URL;
};

const apiBaseUrl = normalizeBaseUrl(
	import.meta.env.VITE_API_BASE_URL || import.meta.env.PUBLIC_API_BASE_URL || inferDefaultApiBaseUrl()
);

type WorkspaceApiOptions = {
	method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	body?: unknown;
};

const parseApiPayload = (responseText: string, contentType: string | null) => {
	if (!responseText) {
		return null;
	}

	const trimmed = responseText.trim();
	const looksLikeJson =
		contentType?.toLowerCase().includes('application/json') ||
		trimmed.startsWith('{') ||
		trimmed.startsWith('[');

	if (!looksLikeJson) {
		return {
			rawText: responseText
		};
	}

	try {
		return JSON.parse(responseText) as unknown;
	} catch {
		return {
			rawText: responseText
		};
	}
};

const getApiErrorMessage = (payload: unknown, responseText: string, path: string) => {
	if (
		payload &&
		typeof payload === 'object' &&
		'error' in payload &&
		typeof payload.error === 'string' &&
		payload.error.trim()
	) {
		return payload.error.trim();
	}

	const trimmed = responseText.trim();
	if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
		return `Workspace API returned HTML for ${path}. The deployment is missing that API route.`;
	}

	if (trimmed) {
		return trimmed.slice(0, 220);
	}

	return 'Workspace request failed.';
};

export const getWorkspaceApiAccessToken = async () => {
	const {
		data: { session }
	} = await supabase.auth.getSession();

	if (!session?.access_token) {
		throw new Error('You need to sign in again before using workspace actions.');
	}

	return session.access_token;
};

export const resolveWorkspaceApiUrl = (path: string) => `${apiBaseUrl}${path}`;

export const invokeWorkspaceApi = async <T>(path: string, options: WorkspaceApiOptions = {}) => {
	const accessToken = await getWorkspaceApiAccessToken();

	const response = await fetch(resolveWorkspaceApiUrl(path), {
		method: options.method || 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`
		},
		...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
	});

	const responseText = await response.text();
	const payload = parseApiPayload(responseText, response.headers.get('content-type'));

	if (!response.ok) {
		throw new Error(getApiErrorMessage(payload, responseText, path));
	}

	if (
		payload &&
		typeof payload === 'object' &&
		'rawText' in payload &&
		typeof payload.rawText === 'string'
	) {
		throw new Error(getApiErrorMessage(payload, responseText, path));
	}

	return payload as T;
};
