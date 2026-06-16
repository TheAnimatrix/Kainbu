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
import { KainbuError } from './errors.js';

/**
 * Read commands resolve everything from the workspace HTTP API (snapshot),
 * which works with an API key. Write commands still go through the PocketBase
 * SDK, which needs a real PB session — something API-key auth doesn't provide.
 *
 * Rather than let those writes fail with PocketBase's opaque "resource wasn't
 * found" 404, wrap the client so any collection access without a valid session
 * throws a clear, actionable error. Reads never touch `getPb()`, so this only
 * gates the write paths.
 */
const guardPbWrites = <T extends { authStore: { isValid: boolean } }>(client: T): T =>
	new Proxy(client, {
		get(target, prop, receiver) {
			if (prop === 'collection' && !target.authStore.isValid) {
				return () => {
					throw new KainbuError(
						'This command needs a PocketBase session, which API-key sign-in does not provide.',
						{
							hint: 'Read commands (project/board/task/column/page list & get) work with an API key. For writes, run: kainbu login --device'
						}
					);
				};
			}
			const value = Reflect.get(target, prop, receiver);
			// Bind methods to the real client so PocketBase's internal `this` stays intact.
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});

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
			// Core write helpers reach PocketBase via getPb(); hand them a
			// guarded client so writes under API-key auth fail clearly.
			setPocketBaseClient(guardPbWrites(pocketbase));
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
