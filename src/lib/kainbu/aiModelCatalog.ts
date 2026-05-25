import type { AiModelConfig, AiThinkingConfig, AiThinkingLevel } from '$lib/kainbu/types';

const LEGACY_MODEL_CONFIGS = [
	{ id: 'gemini 3 flash', model: 'google/gemini-3-flash-preview:nitro' },
	{ id: 'gemini 3.1 flash lite', model: 'google/gemini-3.1-flash-lite-preview' },
	{ id: 'grok 0.1 build', model: 'x-ai/grok-build-0.1', supportsThinking: true }
] as const;

export const ALL_THINKING_LEVELS = [
	'none',
	'low',
	'medium',
	'high',
	'xhigh',
	'max'
] as const satisfies readonly AiThinkingLevel[];

export type CatalogThinkingLevel = (typeof ALL_THINKING_LEVELS)[number];

export type AiModelCatalogEntry = {
	id: string;
	openrouterModel: string;
	enabled: boolean;
	thinkingLevels: AiThinkingLevel[];
	defaultThinkingLevel: AiThinkingLevel;
	position: number;
};

export type AiModelCatalog = {
	defaultModelId: string;
	models: AiModelCatalogEntry[];
};

const LEGACY_TO_CATALOG = (): AiModelCatalogEntry[] =>
	LEGACY_MODEL_CONFIGS.map((config, index) => {
		const supportsThinking = 'supportsThinking' in config && config.supportsThinking;
		const levels: AiThinkingLevel[] = supportsThinking
			? ['none', 'low', 'medium', 'high', 'xhigh', 'max']
			: ['none'];
		return {
			id: config.id,
			openrouterModel: config.model,
			enabled: true,
			thinkingLevels: levels,
			defaultThinkingLevel: supportsThinking ? 'medium' : 'none',
			position: index
		};
	});

export const defaultAiModelCatalog = (): AiModelCatalog => {
	const models = LEGACY_TO_CATALOG();
	return {
		defaultModelId: models[0]?.id || 'gemini 3 flash',
		models
	};
};

const normalizeThinkingLevels = (levels: unknown, fallback: AiThinkingLevel[]): AiThinkingLevel[] => {
	if (!Array.isArray(levels)) return fallback;
	const normalized = levels.filter(
		(level): level is AiThinkingLevel =>
			typeof level === 'string' && ALL_THINKING_LEVELS.includes(level as CatalogThinkingLevel)
	);
	const unique = [...new Set(normalized)];
	return unique.length ? unique : fallback;
};

export const normalizeCatalogEntry = (
	entry: Partial<AiModelCatalogEntry>,
	index: number
): AiModelCatalogEntry | null => {
	const id = typeof entry.id === 'string' ? entry.id.trim() : '';
	const openrouterModel =
		typeof entry.openrouterModel === 'string' ? entry.openrouterModel.trim() : '';
	if (!id || !openrouterModel) return null;

	const thinkingLevels = normalizeThinkingLevels(entry.thinkingLevels, ['none']);
	let defaultThinkingLevel = normalizeThinkingLevels(
		[entry.defaultThinkingLevel],
		[thinkingLevels[0] || 'none']
	)[0];

	if (!thinkingLevels.includes(defaultThinkingLevel)) {
		defaultThinkingLevel = thinkingLevels[0] || 'none';
	}

	return {
		id,
		openrouterModel,
		enabled: entry.enabled !== false,
		thinkingLevels,
		defaultThinkingLevel,
		position: Number.isFinite(entry.position) ? Number(entry.position) : index
	};
};

export const normalizeAiModelCatalog = (raw: unknown): AiModelCatalog => {
	const fallback = defaultAiModelCatalog();
	if (!raw || typeof raw !== 'object') return fallback;

	const candidate = raw as Partial<AiModelCatalog>;
	const models = Array.isArray(candidate.models)
		? candidate.models
				.map((entry, index) => normalizeCatalogEntry(entry as Partial<AiModelCatalogEntry>, index))
				.filter((entry): entry is AiModelCatalogEntry => Boolean(entry))
				.sort((left, right) => left.position - right.position)
				.map((entry, index) => ({ ...entry, position: index }))
		: fallback.models;

	if (!models.length) return fallback;

	const defaultModelId =
		typeof candidate.defaultModelId === 'string' &&
		models.some((entry) => entry.id === candidate.defaultModelId)
			? candidate.defaultModelId
			: models.find((entry) => entry.enabled)?.id || models[0].id;

	return { defaultModelId, models };
};

export const catalogEntryToModelConfig = (entry: AiModelCatalogEntry): AiModelConfig => {
	const allowedThinkingLevels = [...entry.thinkingLevels];
	const defaultThinkingLevel = entry.defaultThinkingLevel;

	let thinking: AiThinkingConfig | null = null;
	if (defaultThinkingLevel !== 'none') {
		thinking = {
			type: 'enabled',
			budget_tokens: 4096,
			level: defaultThinkingLevel
		};
	}

	return {
		id: entry.id,
		model: entry.openrouterModel,
		thinking,
		allowedThinkingLevels,
		defaultThinkingLevel
	};
};

export const catalogToModelConfigs = (catalog: AiModelCatalog): AiModelConfig[] =>
	catalog.models.filter((entry) => entry.enabled).map(catalogEntryToModelConfig);

export const newCatalogEntry = (catalog: AiModelCatalog): AiModelCatalogEntry => ({
	id: '',
	openrouterModel: '',
	enabled: true,
	thinkingLevels: ['none'],
	defaultThinkingLevel: 'none',
	position: catalog.models.length
});
