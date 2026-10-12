import { getWorkspaceApiConfig } from '@kainbu/core';
export const readJsonResponse = async <T>(response: Response, context: string): Promise<T> => {
	const text = await response.text();
	const trimmed = text.trim();

	if (!trimmed) {
		throw new Error(`${context}: empty response (HTTP ${response.status}).`);
	}

	try {
		return JSON.parse(trimmed) as T;
	} catch {
		const preview = trimmed.replace(/\s+/g, ' ').slice(0, 160);
		const hint =
			trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
				? ' The URL may be pointing at the web app instead of the API — set KAINBU_API_BASE (e.g. http://127.0.0.1:8788).'
				: '';
		throw new Error(`${context}: expected JSON, got HTTP ${response.status}: ${preview}${hint}`);
	}
};

/**
 * Authenticated request for bodies the JSON client cannot carry (multipart
 * uploads, binary downloads). Errors carry `status` like invokeWorkspaceApi.
 */
export const rawWorkspaceRequest = async (path: string, init: RequestInit) => {
	const config = getWorkspaceApiConfig();
	if (!config) throw new Error('Workspace API is not configured.');
	const token = await config.getAccessToken();
	const response = await fetch(`${config.getApiBaseUrl().replace(/\/+$/, '')}${path}`, {
		...init,
		...(config.requestTimeoutMs ? { signal: AbortSignal.timeout(config.requestTimeoutMs) } : {}),
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!response.ok) {
		const text = await response.text();
		let message = text.trim().slice(0, 220) || `HTTP ${response.status}`;
		try {
			const parsed = JSON.parse(text) as { error?: unknown };
			if (typeof parsed.error === 'string') message = parsed.error;
		} catch {
			// Plain-text error body.
		}
		throw Object.assign(new Error(message), { status: response.status });
	}
	return response;
};
