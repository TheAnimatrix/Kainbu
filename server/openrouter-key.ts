import { createAdminPb } from './pocketbase.js';
import { APP_SETTINGS_SINGLETON } from './adminAuth.js';
import { getEnv } from './env.js';
import type { AiModelProvider } from '../src/lib/kainbu/types.js';

type ProviderKeyConfig = {
	/** app_settings column holding the stored key. */
	settingsField: string;
	/** Environment variable used when no database key is set. */
	envVar: string;
};

const PROVIDER_KEY_CONFIG: Record<AiModelProvider, ProviderKeyConfig> = {
	openrouter: { settingsField: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
	vercel: { settingsField: 'ai_gateway_api_key', envVar: 'AI_GATEWAY_API_KEY' }
};

const CACHE_TTL_MS = 30_000;
const keyCache = new Map<AiModelProvider, { value: string; loadedAt: number }>();

const loadKeyFromSettings = async (field: string): Promise<string> => {
	try {
		const pb = await createAdminPb();
		const rows = await pb.collection('app_settings').getFullList({
			filter: `singleton = "${APP_SETTINGS_SINGLETON}"`,
			fields: field
		});
		const stored = rows[0]?.[field];
		return typeof stored === 'string' ? stored.trim() : '';
	} catch {
		return '';
	}
};

export const getProviderApiKey = async (provider: AiModelProvider): Promise<string> => {
	const config = PROVIDER_KEY_CONFIG[provider];
	const now = Date.now();
	const cached = keyCache.get(provider);
	if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
		return cached.value;
	}

	const fromDb = await loadKeyFromSettings(config.settingsField);
	const key = fromDb || getEnv(config.envVar, '');
	keyCache.set(provider, { value: key, loadedAt: now });
	return key;
};

/** OpenRouter key — used by utility model calls (title generation) that always run on OpenRouter. */
export const getOpenRouterApiKey = (): Promise<string> => getProviderApiKey('openrouter');

export const getAiGatewayApiKey = (): Promise<string> => getProviderApiKey('vercel');

export const invalidateProviderKeyCache = (provider?: AiModelProvider) => {
	if (provider) {
		keyCache.delete(provider);
		return;
	}
	keyCache.clear();
};

/** Back-compat alias retained for existing call sites. */
export const invalidateOpenRouterKeyCache = () => invalidateProviderKeyCache('openrouter');
