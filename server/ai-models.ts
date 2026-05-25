import {
	catalogToModelConfigs,
	defaultAiModelCatalog,
	normalizeAiModelCatalog,
	type AiModelCatalog
} from '../src/lib/kainbu/aiModelCatalog.js';
import type { AiModelConfig, AiThinkingLevel } from '../src/lib/kainbu/types.js';
import { isAiThinkingLevel } from '../src/lib/kainbu/models.js';
import type PocketBase from 'pocketbase';
import { createAdminPb } from './pocketbase.js';
import { APP_SETTINGS_SINGLETON } from './adminAuth.js';

let cachedCatalog: AiModelCatalog | null = null;
let appSettingsSchemaReady = false;
let appSettingsSchemaRepair: Promise<void> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

export class AiModelCatalogPersistenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AiModelCatalogPersistenceError';
	}
}

export const invalidateAiModelCatalogCache = () => {
	cachedCatalog = null;
	cacheLoadedAt = 0;
};

/** Migrations may no-op on some PB builds; repair schema via Collections API. */
const ensureAppSettingsAiModelsField = async (pb: PocketBase) => {
	if (appSettingsSchemaReady) return;
	if (appSettingsSchemaRepair) {
		await appSettingsSchemaRepair;
		return;
	}

	appSettingsSchemaRepair = (async () => {
		const collection = await pb.collections.getOne('app_settings');
		const hasField = collection.fields.some((field) => field.name === 'ai_models_json');
		if (!hasField) {
			await pb.collections.update(collection.id, {
				fields: [
					...collection.fields,
					{
						name: 'ai_models_json',
						type: 'text',
						required: false,
						max: 50000
					}
				]
			});
			console.log('[ai-models] Added missing app_settings.ai_models_json field');
		}
		appSettingsSchemaReady = true;
	})();

	try {
		await appSettingsSchemaRepair;
	} finally {
		appSettingsSchemaRepair = null;
	}
};

const parseStoredCatalog = (raw: unknown): AiModelCatalog | null => {
	if (typeof raw !== 'string' || !raw.trim()) return null;
	try {
		return normalizeAiModelCatalog(JSON.parse(raw));
	} catch {
		return null;
	}
};

export const loadCatalogFromSettings = async (): Promise<AiModelCatalog | null> => {
	try {
		const pb = await createAdminPb();
		await ensureAppSettingsAiModelsField(pb);
		const rows = await pb.collection('app_settings').getFullList({
			filter: `singleton = "${APP_SETTINGS_SINGLETON}"`
		});
		return parseStoredCatalog(rows[0]?.ai_models_json);
	} catch (error) {
		console.error('[ai-models] Failed to load catalog from app_settings:', error);
		return null;
	}
};

export const loadAiModelCatalog = async (options?: { fresh?: boolean }): Promise<AiModelCatalog> => {
	const now = Date.now();
	if (
		!options?.fresh &&
		cachedCatalog &&
		now - cacheLoadedAt < CACHE_TTL_MS
	) {
		return cachedCatalog;
	}

	const fromDb = await loadCatalogFromSettings();
	cachedCatalog = fromDb ?? defaultAiModelCatalog();
	cacheLoadedAt = now;
	return cachedCatalog;
};

export const getAiModelCatalogSource = async (): Promise<'database' | 'defaults'> =>
	(await loadCatalogFromSettings()) ? 'database' : 'defaults';

export const saveAiModelCatalog = async (catalog: AiModelCatalog) => {
	const pb = await createAdminPb();
	await ensureAppSettingsAiModelsField(pb);
	const normalized = normalizeAiModelCatalog(catalog);
	const json = JSON.stringify(normalized);
	const rows = await pb.collection('app_settings').getFullList({
		filter: `singleton = "${APP_SETTINGS_SINGLETON}"`
	});

	const recordId = rows[0]
		? rows[0].id
		: (
				await pb.collection('app_settings').create({
					singleton: APP_SETTINGS_SINGLETON,
					ai_models_json: json
				})
			).id;

	if (rows[0]) {
		await pb.collection('app_settings').update(recordId, { ai_models_json: json });
	}

	const record = await pb.collection('app_settings').getOne(recordId);
	const stored = parseStoredCatalog(record.ai_models_json);
	if (!stored) {
		throw new AiModelCatalogPersistenceError(
			'Model catalog was not saved. The PocketBase app_settings.ai_models_json field is missing or not writable. Rebuild and restart the pocketbase service so migrations can run.'
		);
	}

	cachedCatalog = stored;
	cacheLoadedAt = Date.now();
	return stored;
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
