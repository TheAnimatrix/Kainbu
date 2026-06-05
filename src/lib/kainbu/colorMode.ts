import { DEFAULT_APP_BG_HEX } from '$lib/kainbu/backgrounds';

export type ColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'kainbu-color-mode';

export const DEFAULT_COLOR_MODE: ColorMode = 'dark';

export const normalizeColorMode = (value: unknown): ColorMode =>
	value === 'light' ? 'light' : 'dark';

export const applyColorMode = (mode: ColorMode) => {
	if (typeof document === 'undefined') return;

	document.documentElement.dataset.colorMode = mode;
	document.documentElement.style.colorScheme = mode;

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		meta.setAttribute('content', DEFAULT_APP_BG_HEX[mode]);
	}
};

export const persistColorMode = (mode: ColorMode) => {
	if (typeof localStorage === 'undefined') return;

	try {
		localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
	} catch {
		// ignore quota / private mode
	}
};

export const readStoredColorMode = (): ColorMode | null => {
	if (typeof localStorage === 'undefined') return null;

	try {
		const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
		return stored === 'light' || stored === 'dark' ? stored : null;
	} catch {
		return null;
	}
};
