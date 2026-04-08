import type { AiModelConfig } from '$lib/kainbu/types';

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
	}
];

export const DEFAULT_AI_MODEL_ID = DEFAULT_AI_MODEL_CONFIGS[0].id;
