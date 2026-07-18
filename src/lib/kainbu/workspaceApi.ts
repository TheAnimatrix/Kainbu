export type WorkspaceApiConfig = {
	getApiBaseUrl: () => string;
	getAccessToken: () => Promise<string>;
	/** Called once after a 401 to obtain a refreshed JWT before retrying the request. */
	refreshAccessToken?: () => Promise<string>;
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

const isReadOnlyWorkspaceRequest = (options: WorkspaceApiOptions) =>
	(options.method || 'POST') === 'GET';

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
	const lowerTrimmed = trimmed.toLowerCase();
	if (lowerTrimmed.startsWith('<!doctype') || lowerTrimmed.startsWith('<html')) {
		return `Workspace API returned HTML for ${path}. The deployment is missing that API route.`;
	}

	if (trimmed) {
		return trimmed.slice(0, 220);
	}

	return 'Workspace request failed.';
};

const requestWorkspaceApi = async (
	path: string,
	options: WorkspaceApiOptions,
	accessToken: string
) => {
	const apiBaseUrl = workspaceApiConfig!.getApiBaseUrl().replace(/\/+$/, '');

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

	return { response, responseText, payload, path };
};

export const invokeWorkspaceApi = async <T>(path: string, options: WorkspaceApiOptions = {}) => {
	if (!workspaceApiConfig) {
		throw new Error('Workspace API is not configured.');
	}

	let accessToken = await workspaceApiConfig.getAccessToken();
	let { response, responseText, payload } = await requestWorkspaceApi(path, options, accessToken);

	if (
		isReadOnlyWorkspaceRequest(options) &&
		!response.ok &&
		response.status === 401 &&
		workspaceApiConfig.refreshAccessToken
	) {
		try {
			accessToken = await workspaceApiConfig.refreshAccessToken();
			({ response, responseText, payload } = await requestWorkspaceApi(path, options, accessToken));
		} catch {
			// Fall through to the original 401 error below.
		}
	}

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

export type WorkspaceMe = {
	id: string;
	email: string | null;
	username: string | null;
	is_admin: boolean;
	auth_method: 'api-key' | 'jwt';
};

/**
 * Returns the currently-authenticated user, accepting either a PB JWT or an
 * API key in the active workspace API config. Used by the CLI as the
 * "whoami" path so a self-hosted-domain login with only an API key works
 * without ever talking to PocketBase directly.
 */
export const fetchWorkspaceMe = async (): Promise<WorkspaceMe> =>
	invokeWorkspaceApi<WorkspaceMe>('/api/me', { method: 'GET' });
