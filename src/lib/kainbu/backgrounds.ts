import { createId } from '$lib/kainbu/id';
import type { BackgroundTheme, ColorMode } from '$lib/kainbu/types';

type BackgroundSceneVariant = {
	swatch: string;
	scene: string;
	primaryGlow: string;
	secondaryGlow: string;
	gridOpacity: number;
};

type BackgroundScenePreset = BackgroundSceneVariant & {
	id: string;
	label: string;
	light: BackgroundSceneVariant;
};

export const getBackgroundPresetPresentation = (
	option: BackgroundScenePreset,
	colorMode: ColorMode = 'dark'
): BackgroundSceneVariant => (colorMode === 'light' ? option.light : option);

export const getBackgroundSwatch = (option: BackgroundScenePreset, colorMode: ColorMode = 'dark') =>
	getBackgroundPresetPresentation(option, colorMode).swatch;

export const BACKGROUND_STORAGE_BUCKET = 'backgrounds';
export const BACKGROUND_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const BACKGROUND_SIGNED_URL_REFRESH_BUFFER_MS = 45_000;
export const BACKGROUND_MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const BACKGROUND_ALLOWED_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/avif'
] as const;

export const BACKGROUND_GRADIENT_OPTIONS: BackgroundScenePreset[] = [
	{
		id: 'ember-haze',
		label: 'Ember',
		swatch: 'linear-gradient(135deg, #0b0908 0%, #2a160e 50%, #b4541c 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(245, 158, 11, 0.10), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(194, 65, 12, 0.10), transparent 70%), linear-gradient(150deg, #0b0908 0%, #14100d 100%)',
		primaryGlow: 'rgba(245, 158, 11, 0.10)',
		secondaryGlow: 'rgba(194, 65, 12, 0.10)',
		gridOpacity: 0.10,
		light: {
			swatch: 'linear-gradient(135deg, #fffbf7 0%, #ffedd5 50%, #fdba74 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(251, 191, 36, 0.22), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(251, 146, 60, 0.16), transparent 70%), linear-gradient(150deg, #fffdfb 0%, #fff7ed 100%)',
			primaryGlow: 'rgba(251, 191, 36, 0.22)',
			secondaryGlow: 'rgba(251, 146, 60, 0.16)',
			gridOpacity: 0.14
		}
	},
	{
		id: 'lagoon-veil',
		label: 'Lagoon',
		swatch: 'linear-gradient(135deg, #07141b 0%, #0d3f50 60%, #38bdf8 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(34, 211, 238, 0.09), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(14, 116, 144, 0.10), transparent 70%), linear-gradient(150deg, #060d12 0%, #0c1820 100%)',
		primaryGlow: 'rgba(34, 211, 238, 0.10)',
		secondaryGlow: 'rgba(14, 116, 144, 0.12)',
		gridOpacity: 0.10,
		light: {
			swatch: 'linear-gradient(135deg, #f0f9ff 0%, #bae6fd 55%, #38bdf8 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(56, 189, 248, 0.20), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(14, 165, 233, 0.14), transparent 70%), linear-gradient(150deg, #f8fdff 0%, #ecfeff 100%)',
			primaryGlow: 'rgba(56, 189, 248, 0.20)',
			secondaryGlow: 'rgba(14, 165, 233, 0.14)',
			gridOpacity: 0.14
		}
	},
	{
		id: 'forest-glow',
		label: 'Forest',
		swatch: 'linear-gradient(135deg, #0a120b 0%, #1c5a35 60%, #84cc16 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(132, 204, 22, 0.09), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(22, 163, 74, 0.10), transparent 70%), linear-gradient(150deg, #070b08 0%, #0c130d 100%)',
		primaryGlow: 'rgba(132, 204, 22, 0.10)',
		secondaryGlow: 'rgba(22, 163, 74, 0.10)',
		gridOpacity: 0.10,
		light: {
			swatch: 'linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 55%, #84cc16 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(132, 204, 22, 0.18), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(34, 197, 94, 0.14), transparent 70%), linear-gradient(150deg, #f7fef9 0%, #ecfdf5 100%)',
			primaryGlow: 'rgba(132, 204, 22, 0.18)',
			secondaryGlow: 'rgba(34, 197, 94, 0.14)',
			gridOpacity: 0.14
		}
	},
	{
		id: 'indigo-rain',
		label: 'Indigo',
		swatch: 'linear-gradient(135deg, #0b0f1c 0%, #1e3a8a 60%, #60a5fa 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(96, 165, 250, 0.08), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(30, 64, 175, 0.12), transparent 70%), linear-gradient(150deg, #070a13 0%, #0d1224 100%)',
		primaryGlow: 'rgba(96, 165, 250, 0.10)',
		secondaryGlow: 'rgba(30, 64, 175, 0.10)',
		gridOpacity: 0.10,
		light: {
			swatch: 'linear-gradient(135deg, #eef2ff 0%, #c7d2fe 55%, #60a5fa 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(96, 165, 250, 0.18), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(59, 130, 246, 0.14), transparent 70%), linear-gradient(150deg, #f8faff 0%, #eef2ff 100%)',
			primaryGlow: 'rgba(96, 165, 250, 0.18)',
			secondaryGlow: 'rgba(59, 130, 246, 0.14)',
			gridOpacity: 0.14
		}
	},
	{
		id: 'rose-fog',
		label: 'Rose',
		swatch: 'linear-gradient(135deg, #140a10 0%, #6f2440 60%, #f472b6 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(244, 114, 182, 0.08), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(190, 24, 93, 0.10), transparent 70%), linear-gradient(150deg, #0a070a 0%, #170c12 100%)',
		primaryGlow: 'rgba(244, 114, 182, 0.10)',
		secondaryGlow: 'rgba(190, 24, 93, 0.10)',
		gridOpacity: 0.09,
		light: {
			swatch: 'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 55%, #f472b6 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(244, 114, 182, 0.18), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(236, 72, 153, 0.14), transparent 70%), linear-gradient(150deg, #fffafd 0%, #fdf2f8 100%)',
			primaryGlow: 'rgba(244, 114, 182, 0.18)',
			secondaryGlow: 'rgba(236, 72, 153, 0.14)',
			gridOpacity: 0.13
		}
	},
	{
		id: 'ash-sunrise',
		label: 'Ash',
		swatch: 'linear-gradient(135deg, #0f0f10 0%, #44362d 60%, #fbbf24 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(250, 204, 21, 0.07), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(217, 119, 6, 0.08), transparent 70%), linear-gradient(150deg, #09090b 0%, #131210 100%)',
		primaryGlow: 'rgba(250, 204, 21, 0.08)',
		secondaryGlow: 'rgba(217, 119, 6, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: 'linear-gradient(135deg, #fffbeb 0%, #fde68a 55%, #fbbf24 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(250, 204, 21, 0.20), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(245, 158, 11, 0.14), transparent 70%), linear-gradient(150deg, #fffef8 0%, #fffbeb 100%)',
			primaryGlow: 'rgba(250, 204, 21, 0.20)',
			secondaryGlow: 'rgba(245, 158, 11, 0.14)',
			gridOpacity: 0.13
		}
	},
	{
		id: 'slate-paper',
		label: 'Slate',
		swatch: 'linear-gradient(135deg, #0f1115 0%, #1f242c 60%, #475569 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(148, 163, 184, 0.06), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(51, 65, 85, 0.10), transparent 70%), linear-gradient(150deg, #0c0e12 0%, #14171c 100%)',
		primaryGlow: 'rgba(148, 163, 184, 0.08)',
		secondaryGlow: 'rgba(71, 85, 105, 0.10)',
		gridOpacity: 0.08,
		light: {
			swatch: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 55%, #94a3b8 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(148, 163, 184, 0.16), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(100, 116, 139, 0.12), transparent 70%), linear-gradient(150deg, #fcfcfd 0%, #f1f5f9 100%)',
			primaryGlow: 'rgba(148, 163, 184, 0.16)',
			secondaryGlow: 'rgba(100, 116, 139, 0.12)',
			gridOpacity: 0.13
		}
	},
	{
		id: 'pearl-dusk',
		label: 'Pearl',
		swatch: 'linear-gradient(135deg, #11100d 0%, #3a342a 60%, #d6c5a8 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(214, 197, 168, 0.05), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(120, 113, 108, 0.08), transparent 70%), linear-gradient(150deg, #0b0a08 0%, #131210 100%)',
		primaryGlow: 'rgba(214, 197, 168, 0.06)',
		secondaryGlow: 'rgba(120, 113, 108, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: 'linear-gradient(135deg, #fafaf9 0%, #e7e5e4 55%, #d6c5a8 100%)',
			scene:
				'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(214, 197, 168, 0.20), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(168, 162, 158, 0.12), transparent 70%), linear-gradient(150deg, #fdfcfb 0%, #f5f5f4 100%)',
			primaryGlow: 'rgba(214, 197, 168, 0.20)',
			secondaryGlow: 'rgba(168, 162, 158, 0.12)',
			gridOpacity: 0.13
		}
	}
];

export const BACKGROUND_SOLID_OPTIONS: BackgroundScenePreset[] = [
	{
		id: 'obsidian',
		label: 'Obsidian',
		swatch: '#09090b',
		scene: '#09090b',
		primaryGlow: 'transparent',
		secondaryGlow: 'transparent',
		gridOpacity: 0,
		light: {
			swatch: '#fafafa',
			scene: '#fafafa',
			primaryGlow: 'transparent',
			secondaryGlow: 'transparent',
			gridOpacity: 0
		}
	},
	{
		id: 'graphite',
		label: 'Graphite',
		swatch: '#131418',
		scene: '#131418',
		primaryGlow: 'rgba(255, 255, 255, 0.04)',
		secondaryGlow: 'rgba(255, 255, 255, 0.03)',
		gridOpacity: 0.08,
		light: {
			swatch: '#f4f4f5',
			scene: '#f4f4f5',
			primaryGlow: 'rgba(0, 0, 0, 0.03)',
			secondaryGlow: 'rgba(0, 0, 0, 0.02)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'cinder',
		label: 'Cinder',
		swatch: '#1c1917',
		scene: '#1c1917',
		primaryGlow: 'rgba(251, 146, 60, 0.05)',
		secondaryGlow: 'rgba(120, 53, 15, 0.06)',
		gridOpacity: 0.08,
		light: {
			swatch: '#faf7f5',
			scene: '#faf7f5',
			primaryGlow: 'rgba(251, 146, 60, 0.10)',
			secondaryGlow: 'rgba(254, 215, 170, 0.18)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'deep-sea',
		label: 'Deep Sea',
		swatch: '#0f1c24',
		scene: '#0f1c24',
		primaryGlow: 'rgba(56, 189, 248, 0.05)',
		secondaryGlow: 'rgba(8, 47, 73, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: '#f0f9ff',
			scene: '#f0f9ff',
			primaryGlow: 'rgba(56, 189, 248, 0.12)',
			secondaryGlow: 'rgba(186, 230, 253, 0.28)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'evergreen',
		label: 'Evergreen',
		swatch: '#141d17',
		scene: '#141d17',
		primaryGlow: 'rgba(74, 222, 128, 0.05)',
		secondaryGlow: 'rgba(20, 83, 45, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: '#f0fdf4',
			scene: '#f0fdf4',
			primaryGlow: 'rgba(74, 222, 128, 0.12)',
			secondaryGlow: 'rgba(187, 247, 208, 0.28)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'navy-room',
		label: 'Navy',
		swatch: '#141a2c',
		scene: '#141a2c',
		primaryGlow: 'rgba(96, 165, 250, 0.05)',
		secondaryGlow: 'rgba(30, 58, 138, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: '#eef2ff',
			scene: '#eef2ff',
			primaryGlow: 'rgba(96, 165, 250, 0.12)',
			secondaryGlow: 'rgba(199, 210, 254, 0.28)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'mulberry',
		label: 'Mulberry',
		swatch: '#221421',
		scene: '#221421',
		primaryGlow: 'rgba(244, 114, 182, 0.05)',
		secondaryGlow: 'rgba(131, 24, 67, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: '#fdf2f8',
			scene: '#fdf2f8',
			primaryGlow: 'rgba(244, 114, 182, 0.12)',
			secondaryGlow: 'rgba(251, 207, 232, 0.28)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'sand',
		label: 'Sand',
		swatch: '#1c1814',
		scene: '#1c1814',
		primaryGlow: 'rgba(214, 197, 168, 0.04)',
		secondaryGlow: 'rgba(120, 113, 108, 0.06)',
		gridOpacity: 0.07,
		light: {
			swatch: '#f5f0e8',
			scene: '#f5f0e8',
			primaryGlow: 'rgba(214, 197, 168, 0.18)',
			secondaryGlow: 'rgba(231, 229, 228, 0.32)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'porcelain',
		label: 'Porcelain',
		swatch: '#15171a',
		scene: '#15171a',
		primaryGlow: 'rgba(148, 163, 184, 0.04)',
		secondaryGlow: 'rgba(71, 85, 105, 0.06)',
		gridOpacity: 0.07,
		light: {
			swatch: '#f8fafc',
			scene: '#f8fafc',
			primaryGlow: 'rgba(148, 163, 184, 0.12)',
			secondaryGlow: 'rgba(226, 232, 240, 0.32)',
			gridOpacity: 0.12
		}
	},
	{
		id: 'plum',
		label: 'Plum',
		swatch: '#1a1426',
		scene: '#1a1426',
		primaryGlow: 'rgba(168, 85, 247, 0.05)',
		secondaryGlow: 'rgba(88, 28, 135, 0.08)',
		gridOpacity: 0.08,
		light: {
			swatch: '#faf5ff',
			scene: '#faf5ff',
			primaryGlow: 'rgba(168, 85, 247, 0.12)',
			secondaryGlow: 'rgba(233, 213, 255, 0.28)',
			gridOpacity: 0.12
		}
	}
];

const gradientById = new Map(BACKGROUND_GRADIENT_OPTIONS.map((option) => [option.id, option]));
const DEFAULT_GRADIENT_FALLBACK_ID = BACKGROUND_GRADIENT_OPTIONS[0]?.id ?? 'ember-haze';
const solidById = new Map(BACKGROUND_SOLID_OPTIONS.map((option) => [option.id, option]));

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizePresetId = (id: unknown) => (typeof id === 'string' ? id.trim() : '');
const escapeCssUrl = (value: string) => value.replace(/"/g, '\\"');

const CUSTOM_HSL_SOLID_ID_RE = /^custom-hsl-(\d{1,3})-(\d{1,3})-(\d{1,3})$/;

const clampHslChannel = (value: number, max: number) =>
	Math.min(max, Math.max(0, Math.round(value)));

export const isCustomHslSolidId = (id: string) => CUSTOM_HSL_SOLID_ID_RE.test(id.trim());

export const parseCustomHslSolidId = (
	id: string
): { h: number; s: number; l: number } | null => {
	const match = id.trim().match(CUSTOM_HSL_SOLID_ID_RE);
	if (!match) return null;

	return {
		h: clampHslChannel(Number(match[1]), 360),
		s: clampHslChannel(Number(match[2]), 100),
		l: clampHslChannel(Number(match[3]), 100)
	};
};

export const customHslSolidTheme = (h: number, s: number, l: number): BackgroundTheme => ({
	kind: 'solid',
	id: `custom-hsl-${clampHslChannel(h, 360)}-${clampHslChannel(s, 100)}-${clampHslChannel(l, 100)}`
});

export const DEFAULT_DARK_CUSTOM_HSL = { h: 206, s: 78, l: 2 } as const;
export const DEFAULT_LIGHT_CUSTOM_HSL = { h: 206, s: 18, l: 97 } as const;

const DARK_TO_LIGHT_SAT_RATIO = DEFAULT_LIGHT_CUSTOM_HSL.s / DEFAULT_DARK_CUSTOM_HSL.s;
const LIGHT_TO_DARK_SAT_RATIO = DEFAULT_DARK_CUSTOM_HSL.s / DEFAULT_LIGHT_CUSTOM_HSL.s;

export const pairCustomHslForColorMode = (
	hsl: { h: number; s: number; l: number },
	targetMode: ColorMode
): { h: number; s: number; l: number } => {
	const isLightInput = hsl.l >= 50;

	if (targetMode === 'light') {
		if (isLightInput) return { h: hsl.h, s: hsl.s, l: hsl.l };

		return {
			h: hsl.h,
			s: clampHslChannel(Math.round(hsl.s * DARK_TO_LIGHT_SAT_RATIO), 100),
			l: DEFAULT_LIGHT_CUSTOM_HSL.l
		};
	}

	if (!isLightInput) return { h: hsl.h, s: hsl.s, l: hsl.l };

	return {
		h: hsl.h,
		s: clampHslChannel(Math.round(hsl.s * LIGHT_TO_DARK_SAT_RATIO), 100),
		l: DEFAULT_DARK_CUSTOM_HSL.l
	};
};

export const shouldAdaptBackgroundThemeForColorMode = (theme: BackgroundTheme) =>
	theme.kind === 'solid' &&
	(parseCustomHslSolidId(theme.id) !== null || theme.id === 'obsidian');

export const adaptBackgroundThemeForColorMode = (
	theme: BackgroundTheme,
	targetMode: ColorMode
): BackgroundTheme => {
	if (!shouldAdaptBackgroundThemeForColorMode(theme)) return theme;

	const hsl =
		theme.kind === 'solid'
			? parseCustomHslSolidId(theme.id) ?? { ...DEFAULT_DARK_CUSTOM_HSL }
			: { ...DEFAULT_DARK_CUSTOM_HSL };
	const paired = pairCustomHslForColorMode(hsl, targetMode);

	return customHslSolidTheme(paired.h, paired.s, paired.l);
};

export const defaultCustomHslForColorMode = (colorMode: ColorMode = 'dark') =>
	pairCustomHslForColorMode(DEFAULT_DARK_CUSTOM_HSL, colorMode);

export const resolveCustomHslFromTheme = (
	theme: BackgroundTheme | null | undefined,
	colorMode: ColorMode = 'dark'
) => {
	if (theme?.kind === 'solid') {
		const parsed = parseCustomHslSolidId(theme.id);
		if (parsed) return parsed;
	}

	return defaultCustomHslForColorMode(colorMode);
};

const buildCustomHslScene = (h: number, s: number, l: number, colorMode: ColorMode) => {
	const glowAlpha = colorMode === 'light' ? 0.14 : 0.1;

	return {
		baseStyle: `background: hsl(${h} ${s}% ${l}%);`,
		primaryGlow: `hsla(${h}, ${s}%, ${l}%, ${glowAlpha})`,
		secondaryGlow: `hsla(${h}, ${Math.max(0, s - 10)}%, ${Math.max(0, l - 8)}%, ${glowAlpha * 0.85})`,
		gridOpacity: colorMode === 'light' ? 0.1 : 0.08
	};
};

export const DEFAULT_BACKGROUND_THEME: BackgroundTheme = customHslSolidTheme(
	DEFAULT_DARK_CUSTOM_HSL.h,
	DEFAULT_DARK_CUSTOM_HSL.s,
	DEFAULT_DARK_CUSTOM_HSL.l
);

export const isBackgroundTheme = (value: unknown): value is BackgroundTheme => {
	if (!isObject(value) || typeof value.kind !== 'string') return false;

	if (value.kind === 'gradient') {
		return gradientById.has(normalizePresetId(value.id));
	}

	if (value.kind === 'solid') {
		const id = normalizePresetId(value.id);
		return solidById.has(id) || isCustomHslSolidId(id);
	}

	if (value.kind === 'image') {
		return typeof value.path === 'string' && value.path.trim().length > 0;
	}

	return false;
};

export const normalizeBackgroundTheme = (
	value: unknown,
	fallback: BackgroundTheme = DEFAULT_BACKGROUND_THEME
): BackgroundTheme => {
	if (!isBackgroundTheme(value)) {
		return fallback;
	}

	if (value.kind === 'image') {
		return {
			kind: 'image',
			path: value.path.trim()
		};
	}

	return {
		kind: value.kind,
		id: normalizePresetId(value.id)
	};
};

export const normalizeNullableBackgroundTheme = (value: unknown): BackgroundTheme | null =>
	value == null || !isBackgroundTheme(value) ? null : normalizeBackgroundTheme(value);

export const getBackgroundThemeKey = (theme: BackgroundTheme | null | undefined) => {
	if (!theme) return 'none';
	if (theme.kind === 'image') return `image:${theme.path}`;
	return `${theme.kind}:${theme.id}`;
};

export const isImageBackgroundTheme = (
	theme: BackgroundTheme | null | undefined
): theme is Extract<BackgroundTheme, { kind: 'image' }> => theme?.kind === 'image';

export const getBackgroundOption = (theme: BackgroundTheme) => {
	if (theme.kind === 'gradient') {
		return gradientById.get(theme.id) || gradientById.get(DEFAULT_GRADIENT_FALLBACK_ID)!;
	}

	if (theme.kind === 'solid') {
		return solidById.get(theme.id) || solidById.get(BACKGROUND_SOLID_OPTIONS[0].id)!;
	}

	return gradientById.get(DEFAULT_GRADIENT_FALLBACK_ID)!;
};

export const getBackgroundScene = (
	theme: BackgroundTheme,
	imageUrl = '',
	colorMode: ColorMode = 'dark'
) => {
	if (theme.kind === 'image' && imageUrl.trim()) {
		const overlay =
			colorMode === 'light'
				? 'linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(250, 250, 250, 0.72) 100%)'
				: 'linear-gradient(180deg, rgba(9, 9, 11, 0.18) 0%, rgba(9, 9, 11, 0.72) 100%)';

		return {
			baseStyle: `background-image: ${overlay}, url("${escapeCssUrl(
				imageUrl
			)}"); background-position: center; background-repeat: no-repeat; background-size: cover;`,
			primaryGlow:
				colorMode === 'light' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.08)',
			secondaryGlow:
				colorMode === 'light' ? 'rgba(15, 23, 42, 0.06)' : 'rgba(17, 24, 39, 0.22)',
			gridOpacity: colorMode === 'light' ? 0.12 : 0.1
		};
	}

	if (theme.kind === 'solid') {
		const customHsl = parseCustomHslSolidId(theme.id);
		if (customHsl) {
			return buildCustomHslScene(customHsl.h, customHsl.s, customHsl.l, colorMode);
		}
	}

	const option = getBackgroundOption(theme);
	const presentation = getBackgroundPresetPresentation(option, colorMode);
	return {
		baseStyle: `background: ${presentation.scene};`,
		primaryGlow: presentation.primaryGlow,
		secondaryGlow: presentation.secondaryGlow,
		gridOpacity: presentation.gridOpacity
	};
};

type Rgb = { r: number; g: number; b: number };

const CHAT_ORB_FALLBACK_PRIMARY: Rgb = { r: 113, g: 113, b: 122 };
const CHAT_ORB_FALLBACK_SECONDARY: Rgb = { r: 161, g: 161, b: 170 };

const clampChannel = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

const parseSceneColor = (value: string): Rgb | null => {
	const rgbaMatch = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
	if (rgbaMatch) {
		return {
			r: clampChannel(Number(rgbaMatch[1])),
			g: clampChannel(Number(rgbaMatch[2])),
			b: clampChannel(Number(rgbaMatch[3]))
		};
	}

	const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
	if (hexMatch) {
		const value32 = Number.parseInt(hexMatch[1], 16);
		return {
			r: (value32 >> 16) & 255,
			g: (value32 >> 8) & 255,
			b: value32 & 255
		};
	}

	const hslMatch = value.match(
		/hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i
	);
	if (hslMatch) {
		return hslToRgb(
			clampHslChannel(Number(hslMatch[1]), 360) / 360,
			clampHslChannel(Number(hslMatch[2]), 100) / 100,
			clampHslChannel(Number(hslMatch[3]), 100) / 100
		);
	}

	return null;
};

const rgbChannels = (color: Rgb) => `${color.r} ${color.g} ${color.b}`;

const mixRgb = (left: Rgb, right: Rgb, ratio: number): Rgb => ({
	r: clampChannel(left.r + (right.r - left.r) * ratio),
	g: clampChannel(left.g + (right.g - left.g) * ratio),
	b: clampChannel(left.b + (right.b - left.b) * ratio)
});

const darkenRgb = (color: Rgb, factor: number): Rgb => ({
	r: clampChannel(color.r * factor),
	g: clampChannel(color.g * factor),
	b: clampChannel(color.b * factor)
});

const lightenRgb = (color: Rgb, amount: number): Rgb => ({
	r: clampChannel(color.r + amount),
	g: clampChannel(color.g + amount),
	b: clampChannel(color.b + amount)
});

const colorSaturation = (color: Rgb) => {
	const max = Math.max(color.r, color.g, color.b);
	const min = Math.min(color.r, color.g, color.b);
	return max === 0 ? 0 : (max - min) / max;
};

const enrichNeutralGlow = (color: Rgb, fallback: Rgb) =>
	colorSaturation(color) < 0.12 ? mixRgb(color, fallback, 0.72) : color;

const rgbToHsl = (color: Rgb): { h: number; s: number; l: number } => {
	const r = color.r / 255;
	const g = color.g / 255;
	const b = color.b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	const l = (max + min) / 2;

	if (delta === 0) {
		return { h: 0, s: 0, l };
	}

	const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let h = 0;

	if (max === r) {
		h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
	} else if (max === g) {
		h = ((b - r) / delta + 2) / 6;
	} else {
		h = ((r - g) / delta + 4) / 6;
	}

	return { h, s, l };
};

const hslToRgb = (h: number, s: number, l: number): Rgb => {
	if (s === 0) {
		const channel = clampChannel(l * 255);
		return { r: channel, g: channel, b: channel };
	}

	const hueToChannel = (p: number, q: number, t: number) => {
		let value = t;
		if (value < 0) value += 1;
		if (value > 1) value -= 1;
		if (value < 1 / 6) return p + (q - p) * 6 * value;
		if (value < 1 / 2) return q;
		if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
		return p;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const normalizedHue = ((h % 1) + 1) % 1;

	return {
		r: clampChannel(hueToChannel(p, q, normalizedHue + 1 / 3) * 255),
		g: clampChannel(hueToChannel(p, q, normalizedHue) * 255),
		b: clampChannel(hueToChannel(p, q, normalizedHue - 1 / 3) * 255)
	};
};

const withHueLightness = (color: Rgb, hueOffset: number, lightness: number, saturation?: number) => {
	const { h, s } = rgbToHsl(color);
	return hslToRgb(h + hueOffset, saturation ?? Math.max(s, 0.58), lightness);
};

const hueDistance = (left: Rgb, right: Rgb) => {
	const leftHue = rgbToHsl(left).h;
	const rightHue = rgbToHsl(right).h;
	const delta = Math.abs(leftHue - rightHue);
	return Math.min(delta, 1 - delta);
};

const distinctCoolAccent = (warm: Rgb, sceneSecondary: Rgb) => {
	const secondary = enrichNeutralGlow(sceneSecondary, CHAT_ORB_FALLBACK_SECONDARY);
	if (hueDistance(warm, secondary) >= 0.14 && colorSaturation(secondary) >= 0.18) {
		return secondary;
	}
	return withHueLightness(warm, 0.56, rgbToHsl(warm).l, 0.68);
};

const buildChatOrbPalette = (warm: Rgb, sceneSecondary: Rgb, colorMode: ColorMode) => {
	const cool = distinctCoolAccent(warm, sceneSecondary);
	const accent = withHueLightness(warm, 0.2, rgbToHsl(warm).l, 0.72);
	const violet = withHueLightness(warm, 0.38, rgbToHsl(warm).l, 0.66);

	if (colorMode === 'light') {
		const warmLightness = Math.min(rgbToHsl(warm).l + 0.08, 0.58);
		return {
			ball: hslToRgb(rgbToHsl(warm).h, Math.max(rgbToHsl(warm).s, 0.72), warmLightness),
			primary: hslToRgb(rgbToHsl(warm).h, Math.max(rgbToHsl(warm).s, 0.78), warmLightness),
			secondary: hslToRgb(rgbToHsl(cool).h, Math.max(rgbToHsl(cool).s, 0.68), 0.52),
			tertiary: hslToRgb(rgbToHsl(violet).h, Math.max(rgbToHsl(violet).s, 0.62), 0.58),
			highlight: hslToRgb(rgbToHsl(warm).h, 0.42, 0.9),
			ringStart: { r: 255, g: 255, b: 255 },
			linesCenter: { r: 255, g: 255, b: 255 },
			focus: darkenRgb(cool, 0.82)
		};
	}

	return {
		ball: hslToRgb(rgbToHsl(warm).h, Math.max(rgbToHsl(warm).s, 0.76), 0.34),
		primary: hslToRgb(rgbToHsl(warm).h, Math.max(rgbToHsl(warm).s, 0.72), 0.38),
		secondary: hslToRgb(rgbToHsl(cool).h, Math.max(rgbToHsl(cool).s, 0.66), 0.36),
		tertiary: hslToRgb(rgbToHsl(accent).h, Math.max(rgbToHsl(accent).s, 0.62), 0.4),
		highlight: hslToRgb(rgbToHsl(warm).h, 0.48, 0.5),
		ringStart: hslToRgb(rgbToHsl(cool).h, 0.42, 0.42),
		linesCenter: hslToRgb(rgbToHsl(warm).h, 0.38, 0.56),
		focus: lightenRgb(hslToRgb(rgbToHsl(warm).h, 0.68, 0.38), 18)
	};
};

const firstSceneHexColor = (sceneValue: string): Rgb | null => {
	const match = sceneValue.match(/#([0-9a-f]{6})/i);
	return match ? parseSceneColor(`#${match[1]}`) : null;
};

const resolveChatOrbWarm = (
	theme: BackgroundTheme,
	scene: ReturnType<typeof getBackgroundScene>,
	colorMode: ColorMode
): Rgb => {
	if (scene.primaryGlow !== 'transparent') {
		const fromPrimary = parseSceneColor(scene.primaryGlow);
		if (fromPrimary) {
			return enrichNeutralGlow(fromPrimary, CHAT_ORB_FALLBACK_PRIMARY);
		}
	}

	if (scene.secondaryGlow !== 'transparent') {
		const fromSecondary = parseSceneColor(scene.secondaryGlow);
		if (fromSecondary) {
			return enrichNeutralGlow(fromSecondary, CHAT_ORB_FALLBACK_PRIMARY);
		}
	}

	if (theme.kind === 'solid' || theme.kind === 'gradient') {
		const option = getBackgroundOption(theme);
		const presentation = getBackgroundPresetPresentation(option, colorMode);
		const fromScene = firstSceneHexColor(presentation.scene);
		if (fromScene) {
			return enrichNeutralGlow(fromScene, CHAT_ORB_FALLBACK_PRIMARY);
		}
	}

	return CHAT_ORB_FALLBACK_PRIMARY;
};

/** Inline CSS custom properties for the chat orb, derived from the active background scene. */
export const getChatOrbStyle = (
	theme: BackgroundTheme,
	imageUrl = '',
	colorMode: ColorMode = 'dark'
) => {
	const scene = getBackgroundScene(theme, imageUrl, colorMode);
	const warm = resolveChatOrbWarm(theme, scene, colorMode);
	const sceneSecondary =
		scene.secondaryGlow !== 'transparent'
			? (parseSceneColor(scene.secondaryGlow) ?? CHAT_ORB_FALLBACK_SECONDARY)
			: CHAT_ORB_FALLBACK_SECONDARY;
	const palette = buildChatOrbPalette(warm, sceneSecondary, colorMode);

	const vars: Record<string, string> = {
		'--chat-orb-primary': rgbChannels(palette.primary),
		'--chat-orb-secondary': rgbChannels(palette.secondary),
		'--chat-orb-tertiary': rgbChannels(palette.tertiary),
		'--chat-orb-highlight': rgbChannels(palette.highlight),
		'--chat-orb-ring-start': rgbChannels(palette.ringStart),
		'--chat-orb-lines-center': rgbChannels(palette.linesCenter),
		'--chat-orb-ball': rgbChannels(palette.ball),
		'--chat-orb-focus': rgbChannels(palette.focus)
	};

	return Object.entries(vars)
		.map(([name, value]) => `${name}:${value}`)
		.join(';');
};

const rgbHex = (color: Rgb) =>
	`#${[color.r, color.g, color.b]
		.map((channel) => channel.toString(16).padStart(2, '0'))
		.join('')}`;

export const customHslToHex = (h: number, s: number, l: number) =>
	rgbHex(hslToRgb(h / 360, s / 100, l / 100));

export const DEFAULT_APP_BG_HEX = {
	dark: customHslToHex(
		DEFAULT_DARK_CUSTOM_HSL.h,
		DEFAULT_DARK_CUSTOM_HSL.s,
		DEFAULT_DARK_CUSTOM_HSL.l
	),
	light: customHslToHex(
		DEFAULT_LIGHT_CUSTOM_HSL.h,
		DEFAULT_LIGHT_CUSTOM_HSL.s,
		DEFAULT_LIGHT_CUSTOM_HSL.l
	)
} as const;

const resolveThemeAccentColors = (
	theme: BackgroundTheme,
	imageUrl = '',
	colorMode: ColorMode = 'dark'
) => {
	const scene = getBackgroundScene(theme, imageUrl, colorMode);
	const warm = resolveChatOrbWarm(theme, scene, colorMode);
	const { h, s } = rgbToHsl(warm);
	return {
		primary: hslToRgb(h, Math.max(s, 0.62), colorMode === 'light' ? 0.48 : 0.52),
		primaryHover: hslToRgb(h, Math.max(s, 0.7), colorMode === 'light' ? 0.38 : 0.42)
	};
};

/** Sync app primary/accent tokens with the active background theme. */
export const applyThemeAccent = (
	theme: BackgroundTheme,
	imageUrl = '',
	colorMode: ColorMode = 'dark'
) => {
	if (typeof document === 'undefined') return;

	const { primary, primaryHover } = resolveThemeAccentColors(theme, imageUrl, colorMode);
	const primaryHex = rgbHex(primary);
	const hoverHex = rgbHex(primaryHover);
	const root = document.documentElement;

	root.style.setProperty('--color-app-primary', primaryHex);
	root.style.setProperty('--color-app-primary-hover', hoverHex);
	root.style.setProperty('--color-app-accent', primaryHex);
	root.style.setProperty('--color-app-accent-hover', hoverHex);
};

export const getBackgroundImagePreviewStyle = (
	imageUrl: string | null | undefined,
	colorMode: ColorMode = 'dark'
) =>
	imageUrl
		? `background-image: ${
				colorMode === 'light'
					? 'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(250, 250, 250, 0.42) 100%)'
					: 'linear-gradient(180deg, rgba(9, 9, 11, 0.12) 0%, rgba(9, 9, 11, 0.42) 100%)'
			}, url("${escapeCssUrl(imageUrl)}"); background-position: center; background-repeat: no-repeat; background-size: cover;`
		: colorMode === 'light'
			? 'background: linear-gradient(145deg, rgba(244, 244, 245, 0.95), rgba(228, 228, 231, 0.86));'
			: 'background: linear-gradient(145deg, rgba(24, 24, 27, 0.95), rgba(39, 39, 42, 0.86));';

const getMimeExtension = (mimeType: string) => {
	switch (mimeType) {
		case 'image/png':
			return 'png';
		case 'image/jpeg':
			return 'jpg';
		case 'image/webp':
			return 'webp';
		case 'image/avif':
			return 'avif';
		default:
			return '';
	}
};

const getNameExtension = (name: string) => {
	const match = /\.([a-z0-9]+)$/i.exec(name);
	return match?.[1]?.toLowerCase() || '';
};

export const buildBackgroundStoragePath = (
	scope: 'user' | 'project',
	scopeId: string,
	fileName: string,
	mimeType: string
) => {
	const extension = getMimeExtension(mimeType) || getNameExtension(fileName) || 'png';
	return `${scope}/${scopeId}/${Date.now()}-${createId()}.${extension}`;
};

export const getBackgroundUploadError = (file: { name: string; type: string; size: number }) => {
	if (
		!BACKGROUND_ALLOWED_MIME_TYPES.includes(
			file.type as (typeof BACKGROUND_ALLOWED_MIME_TYPES)[number]
		)
	) {
		return 'Use a PNG, JPEG, WebP, or AVIF image for backgrounds.';
	}

	if (file.size > BACKGROUND_MAX_UPLOAD_BYTES) {
		return 'Background images must be 6 MB or smaller.';
	}

	return '';
};
