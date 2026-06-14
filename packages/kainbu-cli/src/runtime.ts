import {
	createCliPocketBaseClient,
	fetchWorkspaceMe,
	getActiveAuthProfile,
	getDefaultApiBase,
	loadCliEnv,
	readCliConfig,
	resolveEffectiveApiBase,
	setPocketBaseClient,
	setWorkspaceApiConfig,
	touchActiveProfile,
	type CliConfig
} from '@kainbu/core';
import { getEnvApiKey } from '@kainbu/core/env';
import { invokeWorkspaceApi } from '../../../src/lib/kainbu/workspaceApi.js';

let initialized = false;
let pocketbase: ReturnType<typeof createCliPocketBaseClient> | null = null;
let activeAccessToken: { token: string; source: 'profile' | 'env' | 'jwt' } | null = null;

const resolveAccessToken = async (): Promise<{ token: string; source: 'profile' | 'env' | 'jwt' }> => {
	if (activeAccessToken) return activeAccessToken;

	const profile = await getActiveAuthProfile();
	if (profile?.apiKey) {
		activeAccessToken = { token: profile.apiKey, source: 'profile' };
		return activeAccessToken;
	}

	const envKey = getEnvApiKey();
	if (envKey) {
		activeAccessToken = { token: envKey, source: 'env' };
		return activeAccessToken;
	}

	const pbToken = pocketbase?.authStore.token;
	if (pbToken) {
		activeAccessToken = { token: pbToken, source: 'jwt' };
		return activeAccessToken;
	}

	throw new Error('Not logged in. Run: kainbu login --server <url> --api-key <key>');
};

const resolveApiBase = async (configPatch?: Partial<CliConfig>) => {
	if (configPatch?.apiBase) return configPatch.apiBase;

	const profile = await getActiveAuthProfile();
	if (profile) return profile.apiBase;

	const config = await readCliConfig();
	return resolveEffectiveApiBase({ apiBase: config.apiBase }, getDefaultApiBase());
};

export const initRuntime = async (configPatch?: Partial<CliConfig>) => {
	if (!initialized) {
		loadCliEnv();
		try {
			pocketbase = createCliPocketBaseClient();
			setPocketBaseClient(pocketbase);
		} catch (error) {
			// PB URL not configured — the CLI no longer needs PB for the API path,
			// so we tolerate this. Direct PB reads will throw the same error.
			pocketbase = null;
		}

		const apiBase = await resolveApiBase(configPatch);

		setWorkspaceApiConfig({
			getApiBaseUrl: () => apiBase,
			getAccessToken: async () => {
				const resolved = await resolveAccessToken();
				if (resolved.source === 'profile') {
					void touchActiveProfile().catch(() => {
						// observability; never block the request
					});
				}
				return resolved.token;
			}
		});

		initialized = true;
	}
};

export const resetRuntimeAccessToken = () => {
	activeAccessToken = null;
};

export const getPocketBaseClient = () => {
	if (!pocketbase) {
		throw new Error('PocketBase is not configured for this CLI invocation.');
	}
	return pocketbase;
};

/** @deprecated Use getPocketBaseClient */
export const getSupabaseClient = getPocketBaseClient;

export const requireUser = async () => {
	await initRuntime();
	// Hits the Hono API (works for both API-key and JWT auth) rather than reading
	// the PB SDK's authStore — the CLI on a self-hosted domain may not have a PB
	// session at all.
	const me = await fetchWorkspaceMe();
	if (!me?.id) {
		throw new Error('Not logged in. Run: kainbu login --server <url> --api-key <key>');
	}
	return {
		id: me.id,
		email: me.email,
		username: me.username
	} as { id: string; email: string | null; username: string | null };
};

export const getApiBase = async () => {
	const profile = await getActiveAuthProfile();
	if (profile) return profile.apiBase;
	const config = await readCliConfig();
	return resolveEffectiveApiBase({ apiBase: config.apiBase }, getDefaultApiBase());
};

export { invokeWorkspaceApi };
