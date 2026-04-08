import { DEFAULT_SETTINGS } from '$lib/kainbu/constants';
import { normalizeBackgroundTheme } from '$lib/kainbu/backgrounds';
import type { UserSettings } from '$lib/kainbu/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const normalizeUserSettings = (value: unknown): UserSettings => {
	if (!isObject(value)) {
		return structuredClone(DEFAULT_SETTINGS);
	}

	return {
		defaultShowCheckbox:
			typeof value.defaultShowCheckbox === 'boolean'
				? value.defaultShowCheckbox
				: DEFAULT_SETTINGS.defaultShowCheckbox,
		preferredAiModelId:
			typeof value.preferredAiModelId === 'string' && value.preferredAiModelId.trim()
				? value.preferredAiModelId.trim()
				: typeof value.preferredModelPreset === 'string' && value.preferredModelPreset.trim()
					? value.preferredModelPreset.trim()
					: DEFAULT_SETTINGS.preferredAiModelId,
		backgroundTheme: normalizeBackgroundTheme(
			value.backgroundTheme,
			DEFAULT_SETTINGS.backgroundTheme
		)
	};
};
