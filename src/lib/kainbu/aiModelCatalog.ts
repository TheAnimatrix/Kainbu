import type {
	AiModelConfig,
	AiModelProvider,
	AiThinkingConfig,
	AiThinkingLevel,
	AiVisionFallbackConfig
} from '$lib/kainbu/types';

export const AI_MODEL_PROVIDERS = ['openrouter', 'vercel'] as const satisfies readonly AiModelProvider[];

export const DEFAULT_AI_MODEL_PROVIDER: AiModelProvider = 'openrouter';

export const AI_MODEL_PROVIDER_LABELS: Record<AiModelProvider, string> = {
	openrouter: 'OpenRouter',
	vercel: 'Vercel AI Gateway'
};

export const normalizeAiModelProvider = (value: unknown): AiModelProvider =>
	value === 'vercel' || value === 'openrouter' ? value : DEFAULT_AI_MODEL_PROVIDER;

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
	/** Provider-specific model slug (e.g. `anthropic/claude-sonnet-4.6`). */
	openrouterModel: string;
	provider: AiModelProvider;
	enabled: boolean;
	/** Native multimodal input for chat (images sent as image parts). */
	vision: boolean;
	thinkingLevels: AiThinkingLevel[];
	defaultThinkingLevel: AiThinkingLevel;
	position: number;
};

export type AiModelCatalog = {
	defaultModelId: string;
	models: AiModelCatalogEntry[];
	visionFallback: AiVisionFallbackConfig;
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
			provider: DEFAULT_AI_MODEL_PROVIDER,
			enabled: true,
			vision: true,
			thinkingLevels: levels,
			defaultThinkingLevel: supportsThinking ? 'medium' : 'none',
			position: index
		};
	});

export const defaultVisionFallback = (): AiVisionFallbackConfig => ({
	enabled: false,
	provider: DEFAULT_AI_MODEL_PROVIDER,
	model: ''
});

export const normalizeVisionFallback = (raw: unknown): AiVisionFallbackConfig => {
	const fallback = defaultVisionFallback();
	if (!raw || typeof raw !== 'object') return fallback;
	const candidate = raw as Partial<AiVisionFallbackConfig> & { openrouterModel?: string };
	const model =
		typeof candidate.model === 'string'
			? candidate.model.trim()
			: typeof candidate.openrouterModel === 'string'
				? candidate.openrouterModel.trim()
				: '';
	return {
		enabled: candidate.enabled === true,
		provider: normalizeAiModelProvider(candidate.provider),
		model
	};
};

export const defaultAiModelCatalog = (): AiModelCatalog => {
	const models = LEGACY_TO_CATALOG();
	return {
		defaultModelId: models[0]?.id || 'gemini 3 flash',
		models,
		visionFallback: defaultVisionFallback()
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
		provider: normalizeAiModelProvider(entry.provider),
		enabled: entry.enabled !== false,
		vision: entry.vision !== false,
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

	return {
		defaultModelId,
		models,
		visionFallback: normalizeVisionFallback(candidate.visionFallback)
	};
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
		provider: entry.provider,
		vision: entry.vision,
		thinking,
		allowedThinkingLevels,
		defaultThinkingLevel
	};
};

export const visionFallbackToModelConfig = (
	fallback: AiVisionFallbackConfig
): Pick<AiModelConfig, 'model' | 'provider'> | null => {
	if (!fallback.enabled || !fallback.model.trim()) return null;
	return {
		model: fallback.model.trim(),
		provider: fallback.provider
	};
};

export const catalogToModelConfigs = (catalog: AiModelCatalog): AiModelConfig[] =>
	catalog.models.filter((entry) => entry.enabled).map(catalogEntryToModelConfig);

export const newCatalogEntry = (catalog: AiModelCatalog): AiModelCatalogEntry => ({
	id: '',
	openrouterModel: '',
	provider: DEFAULT_AI_MODEL_PROVIDER,
	enabled: true,
	vision: true,
	thinkingLevels: ['none'],
	defaultThinkingLevel: 'none',
	position: catalog.models.length
});
