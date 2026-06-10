import type { ColorMode, Tag } from '$lib/kainbu/types';

export const formatTagsForAiContext = (tags: Tag[] = []) =>
	tags
		.map((tag) => (tag.color ? `${tag.label} (${tag.color})` : tag.label))
		.join(', ');

const TONE_RGB = {
	red: '248 113 113',
	orange: '251 146 60',
	amber: '251 191 36',
	green: '74 222 128',
	emerald: '52 211 153',
	teal: '45 212 191',
	cyan: '34 211 238',
	blue: '96 165 250',
	indigo: '129 140 248',
	violet: '167 139 250',
	purple: '192 132 252',
	fuchsia: '232 121 249',
	pink: '244 114 182',
	rose: '251 113 133',
	slate: '148 163 184',
	neutral: '113 113 122'
} as const;

const SURFACE_BASE_RGB: Record<ColorMode, string> = {
	dark: '24 24 27',
	light: '255 255 255'
};

const COLUMN_SURFACE_BASE_RGB: Record<ColorMode, string> = {
	dark: '19 19 22',
	light: '255 255 255'
};

const MODAL_BASE_RGB: Record<ColorMode, string> = {
	dark: '24 24 27',
	light: '255 255 255'
};

const SURFACE_TONE_OPTIONS = {
	card: {
		dark: {
			borderAlpha: 0.22,
			topAlpha: 0.18,
			midAlpha: 0.08,
			baseAlpha: 0.95,
			midStop: 38
		},
		light: {
			borderAlpha: 0.38,
			topAlpha: 0.24,
			midAlpha: 0.12,
			baseAlpha: 0.98,
			midStop: 38
		}
	},
	column: {
		dark: {
			borderAlpha: 0.18,
			topAlpha: 0.12,
			midAlpha: 0.02,
			baseAlpha: 1,
			midStopPx: 20,
			fadeStopPx: 56
		},
		light: {
			borderAlpha: 0.32,
			topAlpha: 0.16,
			midAlpha: 0.03,
			baseAlpha: 0.96,
			midStopPx: 20,
			fadeStopPx: 56
		}
	}
} as const;

const KNOWN_TONES = Object.keys(TONE_RGB).filter(
	(tone) => tone !== 'neutral'
) as Array<Exclude<keyof typeof TONE_RGB, 'neutral'>>;

const resolveTone = (serializedColor = '') => {
	const normalized = serializedColor.toLowerCase();
	return KNOWN_TONES.find((tone) => normalized.includes(tone)) || 'neutral';
};

const rgbValue = (rgb: string, alpha?: number) =>
	alpha === undefined ? `rgb(${rgb})` : `rgb(${rgb} / ${alpha})`;

export const getToneSurfaceClass = (serializedColor = '') =>
	resolveTone(serializedColor) !== 'neutral' ? 'kainbu-tone-surface' : '';

export const getTagToneClasses = (serializedColor = '') => {
	const matchedTone = resolveTone(serializedColor);

	return `kainbu-tag-tone kainbu-tag-tone--${matchedTone || 'neutral'}`;
};

const buildToneBackgroundStyle = (
	serializedColor = '',
	colorMode: ColorMode = 'dark',
	options: {
		topAlpha: number;
		midAlpha: number;
		baseAlpha: number;
		midStop: number;
		fadeStop?: number;
	},
	baseRgb: string = SURFACE_BASE_RGB[colorMode]
) => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	const fadeStop = options.fadeStop ?? 100;

	return `background: linear-gradient(180deg, ${rgbValue(rgb, options.topAlpha)} 0%, ${rgbValue(
		rgb,
		options.midAlpha
	)} ${options.midStop}%, ${rgbValue(baseRgb, options.baseAlpha)} ${fadeStop}%), ${rgbValue(
		baseRgb,
		options.baseAlpha
	)}`;
};

const buildToneSurfaceStyle = (
	serializedColor = '',
	colorMode: ColorMode = 'dark',
	options: {
		borderAlpha: number;
		topAlpha: number;
		midAlpha: number;
		baseAlpha: number;
		midStop: number;
		fadeStop?: number;
	},
	baseRgb: string = SURFACE_BASE_RGB[colorMode]
) => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];

	return [
		`border-color: ${rgbValue(rgb, options.borderAlpha)}`,
		buildToneBackgroundStyle(serializedColor, colorMode, options, baseRgb)
	].join('; ');
};

export const getCardToneStyle = (serializedColor = '', colorMode: ColorMode = 'dark') =>
	buildToneSurfaceStyle(serializedColor, colorMode, SURFACE_TONE_OPTIONS.card[colorMode]);

const buildColumnToneBackgroundStyle = (
	serializedColor = '',
	colorMode: ColorMode = 'dark'
) => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	const options = SURFACE_TONE_OPTIONS.column[colorMode];
	const baseRgb = COLUMN_SURFACE_BASE_RGB[colorMode];

	return `background: linear-gradient(180deg, ${rgbValue(rgb, options.topAlpha)} 0px, ${rgbValue(
		rgb,
		options.midAlpha
	)} ${options.midStopPx}px, ${rgbValue(baseRgb, options.baseAlpha)} ${options.fadeStopPx}px), ${rgbValue(
		baseRgb,
		options.baseAlpha
	)}`;
};

/** Single column-shell gradient (header + body share one background). */
export const getColumnToneStyle = (serializedColor = '', colorMode: ColorMode = 'dark') => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	const { borderAlpha } = SURFACE_TONE_OPTIONS.column[colorMode];

	return [
		`border-color: ${rgbValue(rgb, borderAlpha)}`,
		buildColumnToneBackgroundStyle(serializedColor, colorMode)
	].join('; ');
};

export const getColumnDotStyle = (serializedColor = '') => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	return `background: ${rgbValue(rgb)}`;
};

export const getModalToneStyle = (serializedColor = '', colorMode: ColorMode = 'dark') => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	const modalBase = MODAL_BASE_RGB[colorMode];
	const borderAlpha = colorMode === 'light' ? 0.32 : 0.22;
	const glowAlpha = colorMode === 'light' ? 0.16 : 0.22;
	const washAlpha = colorMode === 'light' ? 0.1 : 0.08;
	const baseAlpha = colorMode === 'light' ? 0.99 : 0.97;

	return [
		`border-color: ${rgbValue(rgb, borderAlpha)}`,
		`background: radial-gradient(circle at top right, ${rgbValue(rgb, glowAlpha)}, transparent 24rem), linear-gradient(180deg, ${rgbValue(rgb, washAlpha)} 0%, ${rgbValue(modalBase, baseAlpha)} 42%), ${rgbValue(modalBase, baseAlpha)}`
	].join('; ');
};
