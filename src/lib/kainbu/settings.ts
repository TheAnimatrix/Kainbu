import { DEFAULT_SETTINGS } from '$lib/kainbu/constants';
import {
	adaptBackgroundThemeForColorMode,
	normalizeBackgroundTheme,
	resolveCustomHslFromTheme,
	shouldAdaptBackgroundThemeForColorMode
} from '$lib/kainbu/backgrounds';
import { readStoredColorMode } from '$lib/kainbu/colorMode';
import { isAiThinkingLevel } from '$lib/kainbu/models';
import type { BackgroundTheme, ColorMode, UserSettings } from '$lib/kainbu/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const inferColorModeFromBackground = (
	backgroundTheme: BackgroundTheme
): ColorMode | null => {
	if (!shouldAdaptBackgroundThemeForColorMode(backgroundTheme)) return null;

	return resolveCustomHslFromTheme(backgroundTheme).l >= 50 ? 'light' : 'dark';
};

const resolveColorMode = (
	value: Record<string, unknown>,
	backgroundTheme: BackgroundTheme
): ColorMode => {
	if (value.colorMode === 'light' || value.colorMode === 'dark') {
		return value.colorMode;
	}

	if (value.color_mode === 'light' || value.color_mode === 'dark') {
		return value.color_mode;
	}

	return (
		inferColorModeFromBackground(backgroundTheme) ??
		readStoredColorMode() ??
		DEFAULT_SETTINGS.colorMode
	);
};

export const reconcileUserSettings = (
	settings: UserSettings,
	options: { preferStoredColorMode?: boolean } = {}
): UserSettings => {
	let { colorMode, backgroundTheme } = settings;

	if (options.preferStoredColorMode) {
		const storedColorMode = readStoredColorMode();
		if (storedColorMode) {
			colorMode = storedColorMode;
		}
	}

	if (shouldAdaptBackgroundThemeForColorMode(backgroundTheme)) {
		backgroundTheme = adaptBackgroundThemeForColorMode(backgroundTheme, colorMode);
	}

	return {
		...settings,
		colorMode,
		backgroundTheme
	};
};

export const normalizeUserSettings = (value: unknown): UserSettings => {
	if (!isObject(value)) {
		return structuredClone(DEFAULT_SETTINGS);
	}

	const backgroundTheme = normalizeBackgroundTheme(
		value.backgroundTheme ?? value.background_theme,
		DEFAULT_SETTINGS.backgroundTheme
	);
	const colorMode = resolveColorMode(value, backgroundTheme);

	return reconcileUserSettings({
		defaultShowCheckbox:
			typeof value.defaultShowCheckbox === 'boolean'
				? value.defaultShowCheckbox
				: typeof value.default_show_checkbox === 'boolean'
					? value.default_show_checkbox
					: DEFAULT_SETTINGS.defaultShowCheckbox,
		preferredAiModelId:
			typeof value.preferredAiModelId === 'string' && value.preferredAiModelId.trim()
				? value.preferredAiModelId.trim()
				: typeof value.preferred_ai_model_id === 'string' && value.preferred_ai_model_id.trim()
					? value.preferred_ai_model_id.trim()
					: typeof value.preferredModelPreset === 'string' && value.preferredModelPreset.trim()
						? value.preferredModelPreset.trim()
						: typeof value.preferred_model_preset === 'string' &&
							  value.preferred_model_preset.trim()
							? value.preferred_model_preset.trim()
							: DEFAULT_SETTINGS.preferredAiModelId,
		preferredAiThinkingLevel: (() => {
			const raw =
				value.preferredAiThinkingLevel ?? value.preferred_ai_thinking_level ?? undefined;
			return isAiThinkingLevel(raw) ? raw : undefined;
		})(),
		backgroundTheme,
		colorMode
	});
};
