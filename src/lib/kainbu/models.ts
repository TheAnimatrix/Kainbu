import type { AiModelConfig, AiThinkingConfig, AiThinkingLevel } from '$lib/kainbu/types';

export const DEFAULT_AI_MODEL_CONFIGS: AiModelConfig[] = [
	{
		id: 'gemini 3 flash',
		model: 'google/gemini-3-flash-preview:nitro',
		thinking: null
	},
	{
		id: 'gemini 3.1 flash lite',
		model: 'google/gemini-3.1-flash-lite-preview',
		thinking: null
	},
	{
		id: 'grok 0.1 build',
		model: 'x-ai/grok-build-0.1',
		thinking: {
			type: 'enabled',
			budget_tokens: 4096,
			temperature: 0.7,
			level: 'medium'
		}
	}
];

export const DEFAULT_AI_MODEL_ID = DEFAULT_AI_MODEL_CONFIGS[0].id;

export const THINKING_BUDGET: Record<Exclude<AiThinkingLevel, 'none'>, number> = {
	low: 2048,
	medium: 4096,
	high: 8192
};

const AI_THINKING_LEVELS = new Set<AiThinkingLevel>(['none', 'low', 'medium', 'high']);

export const isAiThinkingLevel = (value: unknown): value is AiThinkingLevel =>
	typeof value === 'string' && AI_THINKING_LEVELS.has(value as AiThinkingLevel);

export const defaultThinkingLevelForModel = (modelConfig: AiModelConfig): AiThinkingLevel => {
	if (!modelConfig.thinking) return 'none';
	const level = modelConfig.thinking.level;
	if (level && level in THINKING_BUDGET) return level;
	return 'medium';
};

export const applyThinkingLevel = (
	modelConfig: AiModelConfig,
	thinkingLevel: unknown
): AiModelConfig => {
	if (thinkingLevel === undefined) return modelConfig;
	if (!isAiThinkingLevel(thinkingLevel)) return modelConfig;
	if (thinkingLevel === 'none') {
		return { ...modelConfig, thinking: null };
	}

	const budget = THINKING_BUDGET[thinkingLevel];
	const baseThinking: Partial<AiThinkingConfig> = modelConfig.thinking ?? {};

	return {
		...modelConfig,
		thinking: {
			...baseThinking,
			type: 'enabled',
			budget_tokens: budget,
			level: thinkingLevel
		}
	};
};
