import { describe, expect, it } from 'vitest';
import {
	DEFAULT_APP_BG_HEX,
	DEFAULT_DARK_CUSTOM_HSL,
	DEFAULT_LIGHT_CUSTOM_HSL,
	adaptBackgroundThemeForColorMode,
	customHslSolidTheme,
	pairCustomHslForColorMode
} from '$lib/kainbu/backgrounds';

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
		expect(pairedLight.l).toBe(97);
		expect(pairCustomHslForColorMode(pairedLight, 'dark').h).toBe(142);
	});

	it('adapts custom hsl and legacy obsidian themes', () => {
		expect(
			adaptBackgroundThemeForColorMode(customHslSolidTheme(206, 78, 2), 'light')
		).toEqual(customHslSolidTheme(206, 18, 97));

		expect(
			adaptBackgroundThemeForColorMode({ kind: 'solid', id: 'obsidian' }, 'light')
		).toEqual(customHslSolidTheme(206, 18, 97));
	});
});
