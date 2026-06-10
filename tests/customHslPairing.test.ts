import { describe, expect, it } from 'vitest';
import {
	DEFAULT_APP_BG_HEX,
	DEFAULT_DARK_CUSTOM_HSL,
	DEFAULT_LIGHT_CUSTOM_HSL,
	adaptBackgroundThemeForColorMode,
	customHslSolidTheme,
	getThemeAccentColors,
	pairCustomHslForColorMode
} from '$lib/kainbu/backgrounds';
import { normalizeUserSettings } from '$lib/kainbu/settings';

describe('pairCustomHslForColorMode', () => {
	it('exports app background hex values for theme-color meta', () => {
		expect(DEFAULT_APP_BG_HEX.dark).toMatch(/^#[0-9a-f]{6}$/i);
		expect(DEFAULT_APP_BG_HEX.light).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it('maps default dark to default light and back', () => {
		expect(pairCustomHslForColorMode(DEFAULT_DARK_CUSTOM_HSL, 'light')).toEqual(
			DEFAULT_LIGHT_CUSTOM_HSL
		);
		expect(pairCustomHslForColorMode(DEFAULT_LIGHT_CUSTOM_HSL, 'dark')).toEqual(
			DEFAULT_DARK_CUSTOM_HSL
		);
	});

	it('preserves hue when crossing modes', () => {
		const customDark = { h: 142, s: 70, l: 4 };
		const pairedLight = pairCustomHslForColorMode(customDark, 'light');

		expect(pairedLight.h).toBe(142);
		expect(pairedLight.l).toBe(DEFAULT_LIGHT_CUSTOM_HSL.l);
		expect(pairCustomHslForColorMode(pairedLight, 'dark').h).toBe(142);
	});

	it('infers light color mode from a light custom background when color_mode is missing', () => {
		const settings = normalizeUserSettings({
			background_theme: customHslSolidTheme(
				DEFAULT_LIGHT_CUSTOM_HSL.h,
				DEFAULT_LIGHT_CUSTOM_HSL.s,
				DEFAULT_LIGHT_CUSTOM_HSL.l
			)
		});

		expect(settings.colorMode).toBe('light');
		expect(settings.backgroundTheme).toEqual(
			customHslSolidTheme(
				DEFAULT_LIGHT_CUSTOM_HSL.h,
				DEFAULT_LIGHT_CUSTOM_HSL.s,
				DEFAULT_LIGHT_CUSTOM_HSL.l
			)
		);
	});

	it('derives accent hue from custom hsl even when the background stays near-neutral', () => {
		const coolAccent = getThemeAccentColors(customHslSolidTheme(220, 8, 6), '', 'dark');
		const warmAccent = getThemeAccentColors(customHslSolidTheme(32, 8, 6), '', 'dark');

		expect(coolAccent.primary).not.toEqual(warmAccent.primary);
		expect(coolAccent.primary.b).toBeGreaterThan(warmAccent.primary.b);
	});

	it('adapts custom hsl and legacy obsidian themes', () => {
		expect(
			adaptBackgroundThemeForColorMode(
				customHslSolidTheme(
					DEFAULT_DARK_CUSTOM_HSL.h,
					DEFAULT_DARK_CUSTOM_HSL.s,
					DEFAULT_DARK_CUSTOM_HSL.l
				),
				'light'
			)
		).toEqual(
			customHslSolidTheme(
				DEFAULT_LIGHT_CUSTOM_HSL.h,
				DEFAULT_LIGHT_CUSTOM_HSL.s,
				DEFAULT_LIGHT_CUSTOM_HSL.l
			)
		);

		expect(
			adaptBackgroundThemeForColorMode({ kind: 'solid', id: 'obsidian' }, 'light')
		).toEqual(
			customHslSolidTheme(
				DEFAULT_LIGHT_CUSTOM_HSL.h,
				DEFAULT_LIGHT_CUSTOM_HSL.s,
				DEFAULT_LIGHT_CUSTOM_HSL.l
			)
		);
	});
});
