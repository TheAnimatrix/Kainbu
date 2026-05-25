import { createAdminPb } from './pocketbase.js';
import { APP_SETTINGS_SINGLETON } from './adminAuth.js';
import { getEnv } from './env.js';

let cachedKey: string | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

const loadKeyFromSettings = async (): Promise<string> => {
	try {
		const pb = await createAdminPb();
		const rows = await pb.collection('app_settings').getFullList({
			filter: `singleton = "${APP_SETTINGS_SINGLETON}"`,
			fields: 'openrouter_api_key'
		});
		const stored = rows[0]?.openrouter_api_key;
		return typeof stored === 'string' ? stored.trim() : '';
	} catch {
		return '';
	}
};

export const getOpenRouterApiKey = async (): Promise<string> => {
	const now = Date.now();
	if (cachedKey !== null && now - cacheLoadedAt < CACHE_TTL_MS) {
		return cachedKey;
	}

	const fromDb = await loadKeyFromSettings();
	const key = fromDb || getEnv('OPENROUTER_API_KEY', '');
	cachedKey = key;
	cacheLoadedAt = now;
	return key;
};

export const invalidateOpenRouterKeyCache = () => {
	cachedKey = null;
	cacheLoadedAt = 0;
};
