import {
	createCliPocketBaseClient,
	fetchWorkspaceMe,
	getActiveAuthProfile,
	getDefaultApiBase,
	loadCliEnv,
	readAuthFile,
	setPocketBaseClient,
	setWorkspaceApiConfig,
	type CliConfig
} from '@kainbu/core';
import { getEnvApiKey, getPocketBaseEnv } from '@kainbu/core/env';
import { invokeWorkspaceApi } from '../../../src/lib/kainbu/workspaceApi.js';
import { KainbuError } from './errors.js';
import { getInvocation } from './invocation.js';

let pocketbase: ReturnType<typeof createCliPocketBaseClient> | null = null;

/** Resolve URL and key together, so credentials cannot drift across servers. */
export const resolveCredentials = async () => {
	loadCliEnv();
	const profileName = getInvocation().authProfile || process.env.KAINBU_PROFILE?.trim();
	if (profileName) {
		const profile = (await readAuthFile()).profiles[profileName];
		if (!profile?.apiKey)
			throw new KainbuError(`No credentials for profile "${profileName}".`, {
				code: 'unauthenticated',
				exitCode: 3
			});
		return {
			apiBase: profile.apiBase,
			token: profile.apiKey,
			source: 'profile',
			profile: profile.name
		};
	}
	const envKey = getEnvApiKey();
	const envBase = process.env.KAINBU_API_BASE?.trim();
	const profile = await getActiveAuthProfile();
	if (envKey)
		return {
			apiBase: envBase || profile?.apiBase || getDefaultApiBase(),
			token: envKey,
			source: 'env',
			profile: null
		};
	if (envBase && profile && envBase.replace(/\/+$/, '') !== profile.apiBase.replace(/\/+$/, '')) {
		throw new KainbuError('KAINBU_API_BASE differs from the saved profile server.', {
			code: 'invalid_config',
			exitCode: 2,
			hint: 'Set KAINBU_API_KEY too, or select --auth-profile. Saved keys are bound to their server.'
		});
	}
	if (profile?.apiKey)
		return {
			apiBase: profile.apiBase,
			token: profile.apiKey,
			source: 'profile',
			profile: profile.name
		};
	return {
		apiBase: getDefaultApiBase(),
		token: pocketbase?.authStore.token || '',
		source: 'jwt',
		profile: null
	};
};

export const initRuntime = async (configPatch?: Partial<CliConfig>) => {
	loadCliEnv();
	if (!pocketbase && getPocketBaseEnv().url) {
		// Workspace reads and writes use HTTP; PB is optional for legacy JWT login.
		pocketbase = createCliPocketBaseClient();
		setPocketBaseClient(pocketbase);
	}
	const credentials = await resolveCredentials();
	setWorkspaceApiConfig({
		getApiBaseUrl: () => configPatch?.apiBase || credentials.apiBase,
		requestTimeoutMs: getInvocation().timeout,
		getAccessToken: async () => {
			if (!credentials.token)
				throw new KainbuError('Not logged in.', {
					code: 'unauthenticated',
					exitCode: 3,
					hint: 'Set KAINBU_API_BASE and KAINBU_API_KEY, or run kainbu login.'
				});
			return credentials.token;
		}
	});
};

// Refresh both endpoint and credentials after changing profiles. Reads do not rewrite auth.json.
export const resetRuntimeAccessToken = () => initRuntime();
export const getPocketBaseClient = () => {
	if (!pocketbase)
		throw new KainbuError('PocketBase is not configured for this CLI invocation.', {
			code: 'invalid_config',
			exitCode: 2
		});
	return pocketbase;
};
export const getSupabaseClient = getPocketBaseClient;
export const requireUser = async () => {
	await initRuntime();
	const me = await fetchWorkspaceMe();
	if (!me?.id)
		throw new KainbuError('Server returned no user identity.', { code: 'invalid_response' });
	return { id: me.id, email: me.email, username: me.username };
};
export const getApiBase = async () => (await resolveCredentials()).apiBase;
export { invokeWorkspaceApi };
