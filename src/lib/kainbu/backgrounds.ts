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
		label: 'Default',
		swatch: 'linear-gradient(135deg, #160c09 0%, #5f270f 48%, #f59e0b 100%)',
		scene:
			'radial-gradient(circle at top right, rgba(245, 158, 11, 0.2), transparent 24rem), radial-gradient(circle at bottom left, rgba(194, 65, 12, 0.2), transparent 30rem), linear-gradient(145deg, #0b0909 0%, #22100c 42%, #0e0908 100%)',
		primaryGlow: 'rgba(245, 158, 11, 0.2)',
		secondaryGlow: 'rgba(194, 65, 12, 0.18)',
		gridOpacity: 0.22
	},
	{
		id: 'lagoon-veil',
		label: 'Lagoon Veil',
		swatch: 'linear-gradient(135deg, #07141b 0%, #0d3f50 50%, #7dd3fc 100%)',
		scene:
			'radial-gradient(circle at top right, rgba(34, 211, 238, 0.18), transparent 24rem), radial-gradient(circle at bottom left, rgba(14, 116, 144, 0.2), transparent 28rem), linear-gradient(150deg, #050b12 0%, #0b1b24 38%, #071118 100%)',
		primaryGlow: 'rgba(34, 211, 238, 0.18)',
		secondaryGlow: 'rgba(14, 116, 144, 0.22)',
		gridOpacity: 0.2
	},
	{
		id: 'forest-glow',
		label: 'Forest Glow',
		swatch: 'linear-gradient(135deg, #0a120b 0%, #1c5a35 48%, #bef264 100%)',
		scene:
			'radial-gradient(circle at top right, rgba(163, 230, 53, 0.18), transparent 26rem), radial-gradient(circle at bottom left, rgba(34, 197, 94, 0.2), transparent 28rem), linear-gradient(150deg, #050805 0%, #0d1610 36%, #060907 100%)',
		primaryGlow: 'rgba(163, 230, 53, 0.18)',
		secondaryGlow: 'rgba(34, 197, 94, 0.18)',
		gridOpacity: 0.2
	},
	{
		id: 'indigo-rain',
		label: 'Indigo Rain',
		swatch: 'linear-gradient(135deg, #0b0f1c 0%, #223a7a 46%, #93c5fd 100%)',
		scene:
			'radial-gradient(circle at top right, rgba(96, 165, 250, 0.16), transparent 24rem), radial-gradient(circle at bottom left, rgba(30, 64, 175, 0.22), transparent 28rem), linear-gradient(152deg, #060912 0%, #10172d 40%, #060913 100%)',
		primaryGlow: 'rgba(96, 165, 250, 0.18)',
		secondaryGlow: 'rgba(30, 64, 175, 0.18)',
		gridOpacity: 0.2
	},
	{
		id: 'rose-fog',
		label: 'Rose Fog',
		swatch: 'linear-gradient(135deg, #170d12 0%, #6f2440 50%, #f9a8d4 100%)',
		scene:
			'radial-gradient(circle at top right, rgba(244, 114, 182, 0.16), transparent 24rem), radial-gradient(circle at bottom left, rgba(190, 24, 93, 0.2), transparent 28rem), linear-gradient(150deg, #0b0709 0%, #1c0f16 38%, #0d080b 100%)',
		primaryGlow: 'rgba(244, 114, 182, 0.18)',
		secondaryGlow: 'rgba(190, 24, 93, 0.18)',
		gridOpacity: 0.18
	},
	{
		id: 'ash-sunrise',
		label: 'Ash Sunrise',
		swatch: 'linear-gradient(135deg, #111113 0%, #58463b 48%, #fde68a 100%)',
		scene:
			'radial-gradient(circle at top right, rgba(250, 204, 21, 0.15), transparent 24rem), radial-gradient(circle at bottom left, rgba(217, 119, 6, 0.16), transparent 30rem), linear-gradient(148deg, #09090b 0%, #171515 36%, #0b0a09 100%)',
		primaryGlow: 'rgba(250, 204, 21, 0.16)',
		secondaryGlow: 'rgba(217, 119, 6, 0.16)',
		gridOpacity: 0.16
	}
];

export const BACKGROUND_SOLID_OPTIONS: BackgroundScenePreset[] = [
	{
		id: 'obsidian',
		label: 'Obsidian',
		swatch: '#09090b',
		scene:
			'radial-gradient(circle at top right, rgba(255, 255, 255, 0.05), transparent 22rem), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.08), transparent 28rem), #09090b',
		primaryGlow: 'rgba(99, 102, 241, 0.1)',
		secondaryGlow: 'rgba(255, 255, 255, 0.06)',
		gridOpacity: 0.12
	},
	{
		id: 'cinder',
		label: 'Cinder',
		swatch: '#1c1917',
		scene:
			'radial-gradient(circle at top right, rgba(251, 146, 60, 0.12), transparent 24rem), radial-gradient(circle at bottom left, rgba(120, 53, 15, 0.16), transparent 28rem), #1c1917',
		primaryGlow: 'rgba(251, 146, 60, 0.12)',
		secondaryGlow: 'rgba(120, 53, 15, 0.14)',
		gridOpacity: 0.14
	},
	{
		id: 'deep-sea',
		label: 'Deep Sea',
		swatch: '#102028',
		scene:
			'radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 24rem), radial-gradient(circle at bottom left, rgba(8, 47, 73, 0.2), transparent 28rem), #102028',
		primaryGlow: 'rgba(56, 189, 248, 0.14)',
		secondaryGlow: 'rgba(8, 47, 73, 0.18)',
		gridOpacity: 0.16
	},
	{
		id: 'evergreen',
		label: 'Evergreen',
		swatch: '#17211a',
		scene:
			'radial-gradient(circle at top right, rgba(74, 222, 128, 0.12), transparent 24rem), radial-gradient(circle at bottom left, rgba(20, 83, 45, 0.18), transparent 28rem), #17211a',
		primaryGlow: 'rgba(74, 222, 128, 0.12)',
		secondaryGlow: 'rgba(20, 83, 45, 0.16)',
		gridOpacity: 0.16
	},
	{
		id: 'navy-room',
		label: 'Navy Room',
		swatch: '#171d31',
		scene:
			'radial-gradient(circle at top right, rgba(96, 165, 250, 0.12), transparent 24rem), radial-gradient(circle at bottom left, rgba(30, 58, 138, 0.2), transparent 28rem), #171d31',
		primaryGlow: 'rgba(96, 165, 250, 0.12)',
		secondaryGlow: 'rgba(30, 58, 138, 0.16)',
		gridOpacity: 0.16
	},
	{
		id: 'mulberry',
		label: 'Mulberry',
		swatch: '#281824',
		scene:
			'radial-gradient(circle at top right, rgba(244, 114, 182, 0.12), transparent 24rem), radial-gradient(circle at bottom left, rgba(131, 24, 67, 0.18), transparent 28rem), #281824',
		primaryGlow: 'rgba(244, 114, 182, 0.12)',
		secondaryGlow: 'rgba(131, 24, 67, 0.16)',
		gridOpacity: 0.15
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
