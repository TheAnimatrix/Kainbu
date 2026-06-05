import { DEFAULT_SETTINGS } from '$lib/kainbu/constants';
import { normalizeBackgroundTheme } from '$lib/kainbu/backgrounds';
import { readStoredColorMode } from '$lib/kainbu/colorMode';
import type { ColorMode, UserSettings } from '$lib/kainbu/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const resolveColorMode = (value: Record<string, unknown>): ColorMode => {
	if (value.colorMode === 'light' || value.colorMode === 'dark') {
		return value.colorMode;
	}

	if (value.color_mode === 'light' || value.color_mode === 'dark') {
		return value.color_mode;
	}

	return readStoredColorMode() ?? DEFAULT_SETTINGS.colorMode;
};

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
		),
		colorMode: resolveColorMode(value)
	};
};
