export type WorkspaceApiConfig = {
	getApiBaseUrl: () => string;
	getAccessToken: () => Promise<string>;
};

let workspaceApiConfig: WorkspaceApiConfig | null = null;

export const setWorkspaceApiConfig = (config: WorkspaceApiConfig) => {
	workspaceApiConfig = config;
};

export const getWorkspaceApiConfig = () => workspaceApiConfig;

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
		return { rawText: responseText };
	}

	try {
		return JSON.parse(responseText) as unknown;
	} catch {
		return { rawText: responseText };
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

export const invokeWorkspaceApi = async <T>(path: string, options: WorkspaceApiOptions = {}) => {
	if (!workspaceApiConfig) {
		throw new Error('Workspace API is not configured.');
	}

	const accessToken = await workspaceApiConfig.getAccessToken();
	const apiBaseUrl = workspaceApiConfig.getApiBaseUrl().replace(/\/+$/, '');

	const response = await fetch(`${apiBaseUrl}${path}`, {
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
		const message = getApiErrorMessage(payload, responseText, path);
		const error = new Error(message) as Error & { status?: number };
		error.status = response.status;
		throw error;
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
