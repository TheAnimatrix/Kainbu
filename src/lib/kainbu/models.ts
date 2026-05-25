import type { AiModelConfig, AiThinkingConfig, AiThinkingLevel } from '$lib/kainbu/types';
import { defaultAiModelCatalog, catalogToModelConfigs } from '$lib/kainbu/aiModelCatalog';

export const DEFAULT_AI_MODEL_CONFIGS: AiModelConfig[] = catalogToModelConfigs(defaultAiModelCatalog());

export const DEFAULT_AI_MODEL_ID = DEFAULT_AI_MODEL_CONFIGS[0]?.id || 'gemini 3 flash';

export const THINKING_BUDGET: Record<Exclude<AiThinkingLevel, 'none'>, number> = {
	low: 2048,
	medium: 4096,
	high: 8192,
	xhigh: 16384,
	max: 32768
};

const AI_THINKING_LEVELS = new Set<AiThinkingLevel>([
	'none',
	'low',
	'medium',
	'high',
	'xhigh',
	'max'
]);

export const isAiThinkingLevel = (value: unknown): value is AiThinkingLevel =>
	typeof value === 'string' && AI_THINKING_LEVELS.has(value as AiThinkingLevel);

const THINKING_LEVEL_LABELS: Record<AiThinkingLevel, string> = {
	none: 'No thinking',
	low: 'Think low',
	medium: 'Think medium',
	high: 'Think high',
	xhigh: 'Think xhigh',
	max: 'Think max'
};

export const thinkingLevelLabel = (level: AiThinkingLevel) =>
	THINKING_LEVEL_LABELS[level] ?? level;

export const defaultThinkingLevelForModel = (modelConfig: AiModelConfig): AiThinkingLevel => {
	const allowed = modelConfig.allowedThinkingLevels?.length
		? modelConfig.allowedThinkingLevels
		: ['none'];
	const preferred = modelConfig.defaultThinkingLevel;
	if (preferred && allowed.includes(preferred)) return preferred;
	if (modelConfig.thinking?.level && allowed.includes(modelConfig.thinking.level)) {
		return modelConfig.thinking.level;
	}
	return allowed[0] || 'none';
};

export const applyThinkingLevel = (
	modelConfig: AiModelConfig,
	thinkingLevel: unknown
): AiModelConfig => {
	if (thinkingLevel === undefined) return modelConfig;
	if (!isAiThinkingLevel(thinkingLevel)) return modelConfig;

	const allowed = modelConfig.allowedThinkingLevels?.length
		? modelConfig.allowedThinkingLevels
		: ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
	let resolvedLevel: AiThinkingLevel = thinkingLevel;
	if (!allowed.includes(resolvedLevel)) {
		resolvedLevel = defaultThinkingLevelForModel(modelConfig);
	}

	if (resolvedLevel === 'none') {
		return { ...modelConfig, thinking: null };
	}

	const budget = THINKING_BUDGET[resolvedLevel];
	const baseThinking: Partial<AiThinkingConfig> = modelConfig.thinking ?? {};

	return {
		...modelConfig,
		thinking: {
			...baseThinking,
			type: 'enabled',
			budget_tokens: budget,
			level: resolvedLevel
		}
	};
};
