import { createId } from '$lib/kainbu/id';
import type { BackgroundTheme } from '$lib/kainbu/types';

type BackgroundScenePreset = {
	id: string;
	label: string;
	swatch: string;
	scene: string;
	primaryGlow: string;
	secondaryGlow: string;
	gridOpacity: number;
};

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
		gridOpacity: 0.10
	},
	{
		id: 'lagoon-veil',
		label: 'Lagoon',
		swatch: 'linear-gradient(135deg, #07141b 0%, #0d3f50 60%, #38bdf8 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(34, 211, 238, 0.09), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(14, 116, 144, 0.10), transparent 70%), linear-gradient(150deg, #060d12 0%, #0c1820 100%)',
		primaryGlow: 'rgba(34, 211, 238, 0.10)',
		secondaryGlow: 'rgba(14, 116, 144, 0.12)',
		gridOpacity: 0.10
	},
	{
		id: 'forest-glow',
		label: 'Forest',
		swatch: 'linear-gradient(135deg, #0a120b 0%, #1c5a35 60%, #84cc16 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(132, 204, 22, 0.09), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(22, 163, 74, 0.10), transparent 70%), linear-gradient(150deg, #070b08 0%, #0c130d 100%)',
		primaryGlow: 'rgba(132, 204, 22, 0.10)',
		secondaryGlow: 'rgba(22, 163, 74, 0.10)',
		gridOpacity: 0.10
	},
	{
		id: 'indigo-rain',
		label: 'Indigo',
		swatch: 'linear-gradient(135deg, #0b0f1c 0%, #1e3a8a 60%, #60a5fa 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(96, 165, 250, 0.08), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(30, 64, 175, 0.12), transparent 70%), linear-gradient(150deg, #070a13 0%, #0d1224 100%)',
		primaryGlow: 'rgba(96, 165, 250, 0.10)',
		secondaryGlow: 'rgba(30, 64, 175, 0.10)',
		gridOpacity: 0.10
	},
	{
		id: 'rose-fog',
		label: 'Rose',
		swatch: 'linear-gradient(135deg, #140a10 0%, #6f2440 60%, #f472b6 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(244, 114, 182, 0.08), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(190, 24, 93, 0.10), transparent 70%), linear-gradient(150deg, #0a070a 0%, #170c12 100%)',
		primaryGlow: 'rgba(244, 114, 182, 0.10)',
		secondaryGlow: 'rgba(190, 24, 93, 0.10)',
		gridOpacity: 0.09
	},
	{
		id: 'ash-sunrise',
		label: 'Ash',
		swatch: 'linear-gradient(135deg, #0f0f10 0%, #44362d 60%, #fbbf24 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(250, 204, 21, 0.07), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(217, 119, 6, 0.08), transparent 70%), linear-gradient(150deg, #09090b 0%, #131210 100%)',
		primaryGlow: 'rgba(250, 204, 21, 0.08)',
		secondaryGlow: 'rgba(217, 119, 6, 0.08)',
		gridOpacity: 0.08
	},
	{
		id: 'slate-paper',
		label: 'Slate',
		swatch: 'linear-gradient(135deg, #0f1115 0%, #1f242c 60%, #475569 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(148, 163, 184, 0.06), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(51, 65, 85, 0.10), transparent 70%), linear-gradient(150deg, #0c0e12 0%, #14171c 100%)',
		primaryGlow: 'rgba(148, 163, 184, 0.08)',
		secondaryGlow: 'rgba(71, 85, 105, 0.10)',
		gridOpacity: 0.08
	},
	{
		id: 'pearl-dusk',
		label: 'Pearl',
		swatch: 'linear-gradient(135deg, #11100d 0%, #3a342a 60%, #d6c5a8 100%)',
		scene:
			'radial-gradient(ellipse 80% 60% at 85% 0%, rgba(214, 197, 168, 0.05), transparent 70%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(120, 113, 108, 0.08), transparent 70%), linear-gradient(150deg, #0b0a08 0%, #131210 100%)',
		primaryGlow: 'rgba(214, 197, 168, 0.06)',
		secondaryGlow: 'rgba(120, 113, 108, 0.08)',
		gridOpacity: 0.08
	}
];

export const BACKGROUND_SOLID_OPTIONS: BackgroundScenePreset[] = [
	{
		id: 'obsidian',
		label: 'Obsidian',
		swatch: '#09090b',
		scene: '#09090b',
		primaryGlow: 'rgba(255, 255, 255, 0.04)',
		secondaryGlow: 'rgba(255, 255, 255, 0.03)',
		gridOpacity: 0.08
	},
	{
		id: 'graphite',
		label: 'Graphite',
		swatch: '#131418',
		scene: '#131418',
		primaryGlow: 'rgba(255, 255, 255, 0.04)',
		secondaryGlow: 'rgba(255, 255, 255, 0.03)',
		gridOpacity: 0.08
	},
	{
		id: 'cinder',
		label: 'Cinder',
		swatch: '#1c1917',
		scene: '#1c1917',
		primaryGlow: 'rgba(251, 146, 60, 0.05)',
		secondaryGlow: 'rgba(120, 53, 15, 0.06)',
		gridOpacity: 0.08
	},
	{
		id: 'deep-sea',
		label: 'Deep Sea',
		swatch: '#0f1c24',
		scene: '#0f1c24',
		primaryGlow: 'rgba(56, 189, 248, 0.05)',
		secondaryGlow: 'rgba(8, 47, 73, 0.08)',
		gridOpacity: 0.08
	},
	{
		id: 'evergreen',
		label: 'Evergreen',
		swatch: '#141d17',
		scene: '#141d17',
		primaryGlow: 'rgba(74, 222, 128, 0.05)',
		secondaryGlow: 'rgba(20, 83, 45, 0.08)',
		gridOpacity: 0.08
	},
	{
		id: 'navy-room',
		label: 'Navy',
		swatch: '#141a2c',
		scene: '#141a2c',
		primaryGlow: 'rgba(96, 165, 250, 0.05)',
		secondaryGlow: 'rgba(30, 58, 138, 0.08)',
		gridOpacity: 0.08
	},
	{
		id: 'mulberry',
		label: 'Mulberry',
		swatch: '#221421',
		scene: '#221421',
		primaryGlow: 'rgba(244, 114, 182, 0.05)',
		secondaryGlow: 'rgba(131, 24, 67, 0.08)',
		gridOpacity: 0.08
	},
	{
		id: 'sand',
		label: 'Sand',
		swatch: '#1c1814',
		scene: '#1c1814',
		primaryGlow: 'rgba(214, 197, 168, 0.04)',
		secondaryGlow: 'rgba(120, 113, 108, 0.06)',
		gridOpacity: 0.07
	},
	{
		id: 'porcelain',
		label: 'Porcelain',
		swatch: '#15171a',
		scene: '#15171a',
		primaryGlow: 'rgba(148, 163, 184, 0.04)',
		secondaryGlow: 'rgba(71, 85, 105, 0.06)',
		gridOpacity: 0.07
	},
	{
		id: 'plum',
		label: 'Plum',
		swatch: '#1a1426',
		scene: '#1a1426',
		primaryGlow: 'rgba(168, 85, 247, 0.05)',
		secondaryGlow: 'rgba(88, 28, 135, 0.08)',
		gridOpacity: 0.08
	}
];

const gradientById = new Map(BACKGROUND_GRADIENT_OPTIONS.map((option) => [option.id, option]));
const solidById = new Map(BACKGROUND_SOLID_OPTIONS.map((option) => [option.id, option]));

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizePresetId = (id: unknown) => (typeof id === 'string' ? id.trim() : '');
const escapeCssUrl = (value: string) => value.replace(/"/g, '\\"');

export const DEFAULT_BACKGROUND_THEME: BackgroundTheme = {
	kind: 'gradient',
	id: 'ember-haze'
};

export const isBackgroundTheme = (value: unknown): value is BackgroundTheme => {
	if (!isObject(value) || typeof value.kind !== 'string') return false;

	if (value.kind === 'gradient') {
		return gradientById.has(normalizePresetId(value.id));
	}

	if (value.kind === 'solid') {
		return solidById.has(normalizePresetId(value.id));
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
		return gradientById.get(theme.id) || gradientById.get(DEFAULT_BACKGROUND_THEME.id)!;
	}

	if (theme.kind === 'solid') {
		return solidById.get(theme.id) || solidById.get(BACKGROUND_SOLID_OPTIONS[0].id)!;
	}

	return gradientById.get(DEFAULT_BACKGROUND_THEME.id)!;
};

export const getBackgroundScene = (theme: BackgroundTheme, imageUrl = '') => {
	if (theme.kind === 'image' && imageUrl.trim()) {
		return {
			baseStyle: `background-image: linear-gradient(180deg, rgba(9, 9, 11, 0.18) 0%, rgba(9, 9, 11, 0.72) 100%), url("${escapeCssUrl(
				imageUrl
			)}"); background-position: center; background-repeat: no-repeat; background-size: cover;`,
			primaryGlow: 'rgba(255, 255, 255, 0.08)',
			secondaryGlow: 'rgba(17, 24, 39, 0.22)',
			gridOpacity: 0.1
		};
	}

	const option = getBackgroundOption(theme);
	return {
		baseStyle: `background: ${option.scene};`,
		primaryGlow: option.primaryGlow,
		secondaryGlow: option.secondaryGlow,
		gridOpacity: option.gridOpacity
	};
};

export const getBackgroundImagePreviewStyle = (imageUrl: string | null | undefined) =>
	imageUrl
		? `background-image: linear-gradient(180deg, rgba(9, 9, 11, 0.12) 0%, rgba(9, 9, 11, 0.42) 100%), url("${escapeCssUrl(
				imageUrl
			)}"); background-position: center; background-repeat: no-repeat; background-size: cover;`
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
