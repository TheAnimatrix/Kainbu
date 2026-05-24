import {
	createCliPocketBaseClient,
	getDefaultApiBase,
	loadCliEnv,
	readCliConfig,
	setPocketBaseClient,
	setWorkspaceApiConfig,
	type CliConfig
} from '@kainbu/core';
import { invokeWorkspaceApi } from '../../../src/lib/kainbu/workspaceApi.js';

let initialized = false;
let pocketbase: ReturnType<typeof createCliPocketBaseClient> | null = null;

export const initRuntime = async (configPatch?: Partial<CliConfig>) => {
	if (!initialized) {
		loadCliEnv();
		pocketbase = createCliPocketBaseClient();
		setPocketBaseClient(pocketbase);

		const config = await readCliConfig();
		const apiBase = configPatch?.apiBase || config.apiBase || getDefaultApiBase();

		setWorkspaceApiConfig({
			getApiBaseUrl: () => apiBase,
			getAccessToken: async () => {
				const token = pocketbase!.authStore.token;
				if (!token) {
					throw new Error('Not logged in. Run: kainbu login');
				}
				return token;
			}
		});

		initialized = true;
	}
};

export const getPocketBaseClient = () => {
	if (!pocketbase) {
		throw new Error('CLI runtime is not initialized.');
	}
	return pocketbase;
};

/** @deprecated Use getPocketBaseClient */
export const getSupabaseClient = getPocketBaseClient;

export const requireUser = async () => {
	await initRuntime();
	const model = pocketbase!.authStore.model;

	if (!pocketbase!.authStore.isValid || !model?.id) {
		throw new Error('Not logged in. Run: kainbu login');
	}

	return model;
};

export const getApiBase = async () => {
	const config = await readCliConfig();
	return config.apiBase || getDefaultApiBase();
};

export { invokeWorkspaceApi };
