import {
	catalogToModelConfigs,
	defaultAiModelCatalog,
	normalizeAiModelCatalog,
	type AiModelCatalog
} from '../src/lib/kainbu/aiModelCatalog.js';
import type { AiModelConfig, AiThinkingLevel } from '../src/lib/kainbu/types.js';
import { isAiThinkingLevel } from '../src/lib/kainbu/models.js';
import { createAdminPb } from './pocketbase.js';
import { APP_SETTINGS_SINGLETON } from './adminAuth.js';

let cachedCatalog: AiModelCatalog | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

export const invalidateAiModelCatalogCache = () => {
	cachedCatalog = null;
	cacheLoadedAt = 0;
};

const loadCatalogFromSettings = async (): Promise<AiModelCatalog | null> => {
	try {
		const pb = await createAdminPb();
		const rows = await pb.collection('app_settings').getFullList({
			filter: `singleton = "${APP_SETTINGS_SINGLETON}"`,
			fields: 'ai_models_json'
		});
		const raw = rows[0]?.ai_models_json;
		if (typeof raw !== 'string' || !raw.trim()) return null;
		return normalizeAiModelCatalog(JSON.parse(raw));
	} catch {
		return null;
	}
};

export const loadAiModelCatalog = async (): Promise<AiModelCatalog> => {
	const now = Date.now();
	if (cachedCatalog && now - cacheLoadedAt < CACHE_TTL_MS) {
		return cachedCatalog;
	}

	const fromDb = await loadCatalogFromSettings();
	cachedCatalog = fromDb ?? defaultAiModelCatalog();
	cacheLoadedAt = now;
	return cachedCatalog;
};

export const saveAiModelCatalog = async (catalog: AiModelCatalog) => {
	const pb = await createAdminPb();
	const normalized = normalizeAiModelCatalog(catalog);
	const rows = await pb.collection('app_settings').getFullList({
		filter: `singleton = "${APP_SETTINGS_SINGLETON}"`
	});
	const payload = { ai_models_json: JSON.stringify(normalized) };

	if (rows[0]) {
		await pb.collection('app_settings').update(rows[0].id, payload);
	} else {
		await pb.collection('app_settings').create({
			singleton: APP_SETTINGS_SINGLETON,
			...payload
		});
	}

	cachedCatalog = normalized;
	cacheLoadedAt = Date.now();
	return normalized;
};

export const getEnabledModelConfigs = (): AiModelConfig[] => {
	const catalog = cachedCatalog ?? defaultAiModelCatalog();
	return catalogToModelConfigs(catalog);
};

export const resolveModelConfigById = (modelId: string): AiModelConfig | null => {
	const normalizedId = modelId.trim();
	return getEnabledModelConfigs().find((entry) => entry.id === normalizedId) ?? null;
};

export const assertThinkingLevelAllowed = (
	modelConfig: AiModelConfig,
	thinkingLevel: unknown
): AiThinkingLevel => {
	if (!isAiThinkingLevel(thinkingLevel)) {
		throw new Error(`Invalid thinkingLevel "${String(thinkingLevel)}".`);
	}
	const allowed = modelConfig.allowedThinkingLevels?.length
		? modelConfig.allowedThinkingLevels
		: ['none'];
	if (!allowed.includes(thinkingLevel)) {
		throw new Error(
			`thinkingLevel "${thinkingLevel}" is not allowed for model "${modelConfig.id}". Allowed: ${allowed.join(', ')}.`
		);
	}
	return thinkingLevel;
};
