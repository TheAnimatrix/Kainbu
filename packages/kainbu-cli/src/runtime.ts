import {
	createCliSupabaseClient,
	getDefaultApiBase,
	loadCliEnv,
	readCliConfig,
	setSupabaseClient,
	setWorkspaceApiConfig,
	type CliConfig
} from '@kainbu/core';
import { invokeWorkspaceApi } from '../../../src/lib/kainbu/workspaceApi.js';

let initialized = false;
let supabase: ReturnType<typeof createCliSupabaseClient> | null = null;

export const initRuntime = async (configPatch?: Partial<CliConfig>) => {
	if (!initialized) {
		loadCliEnv();
		supabase = createCliSupabaseClient();
		setSupabaseClient(supabase);

		const config = await readCliConfig();
		const apiBase = configPatch?.apiBase || config.apiBase || getDefaultApiBase();

		setWorkspaceApiConfig({
			getApiBaseUrl: () => apiBase,
			getAccessToken: async () => {
				const {
					data: { session }
				} = await supabase.auth.getSession();
				if (!session?.access_token) {
					throw new Error('Not logged in. Run: kainbu login');
				}
				return session.access_token;
			}
		});

		initialized = true;
	}
};

export const getSupabaseClient = () => {
	if (!supabase) {
		throw new Error('CLI runtime is not initialized.');
	}
	return supabase;
};

export const requireUser = async () => {
	await initRuntime();
	const {
		data: { user },
		error
	} = await supabase.auth.getUser();

	if (error || !user) {
		throw new Error('Not logged in. Run: kainbu login');
	}

	return user;
};

export const getApiBase = async () => {
	const config = await readCliConfig();
	return config.apiBase || getDefaultApiBase();
};

export { invokeWorkspaceApi };
