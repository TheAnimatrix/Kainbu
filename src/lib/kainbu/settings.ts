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
		preferredModelPreset:
			value.preferredModelPreset === 'smart' || value.preferredModelPreset === 'fast'
				? value.preferredModelPreset
				: DEFAULT_SETTINGS.preferredModelPreset,
		preferredChatMode:
			value.preferredChatMode === 'chat' ||
			value.preferredChatMode === 'edit' ||
			value.preferredChatMode === 'auto'
				? value.preferredChatMode
				: DEFAULT_SETTINGS.preferredChatMode,
		backgroundTheme: normalizeBackgroundTheme(
			value.backgroundTheme,
			DEFAULT_SETTINGS.backgroundTheme
		)
	};
};
