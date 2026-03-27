const TAG_TONE_CLASSES = {
	red: 'border-red-400/25 bg-red-500/18 text-red-100',
	orange: 'border-orange-400/25 bg-orange-500/18 text-orange-100',
	amber: 'border-amber-400/25 bg-amber-500/18 text-amber-100',
	green: 'border-green-400/25 bg-green-500/18 text-green-100',
	emerald: 'border-emerald-400/25 bg-emerald-500/18 text-emerald-100',
	teal: 'border-teal-400/25 bg-teal-500/18 text-teal-100',
	cyan: 'border-cyan-400/25 bg-cyan-500/18 text-cyan-100',
	blue: 'border-blue-400/25 bg-blue-500/18 text-blue-100',
	indigo: 'border-indigo-400/25 bg-indigo-500/18 text-indigo-100',
	violet: 'border-violet-400/25 bg-violet-500/18 text-violet-100',
	purple: 'border-purple-400/25 bg-purple-500/18 text-purple-100',
	fuchsia: 'border-fuchsia-400/25 bg-fuchsia-500/18 text-fuchsia-100',
	pink: 'border-pink-400/25 bg-pink-500/18 text-pink-100',
	rose: 'border-rose-400/25 bg-rose-500/18 text-rose-100',
	slate: 'border-slate-300/20 bg-slate-500/18 text-slate-100',
	neutral: 'border-white/10 bg-white/8 text-app-text'
} as const;

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

const KNOWN_TONES = Object.keys(TAG_TONE_CLASSES).filter(
	(tone) => tone !== 'neutral'
) as Array<Exclude<keyof typeof TAG_TONE_CLASSES, 'neutral'>>;

const resolveTone = (serializedColor = '') => {
	const normalized = serializedColor.toLowerCase();
	return KNOWN_TONES.find((tone) => normalized.includes(tone)) || 'neutral';
};

const rgbValue = (rgb: string, alpha?: number) =>
	alpha === undefined ? `rgb(${rgb})` : `rgb(${rgb} / ${alpha})`;

export const getTagToneClasses = (serializedColor = '') => {
	const matchedTone = resolveTone(serializedColor);

	return `border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
		TAG_TONE_CLASSES[matchedTone || 'neutral']
	}`;
};

const buildToneSurfaceStyle = (
	serializedColor = '',
	options: {
		borderAlpha: number;
		topAlpha: number;
		midAlpha: number;
		baseAlpha: number;
		midStop: number;
	}
) => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];

	return [
		`border-color: ${rgbValue(rgb, options.borderAlpha)}`,
		`background: linear-gradient(180deg, ${rgbValue(rgb, options.topAlpha)} 0%, ${rgbValue(
			rgb,
			options.midAlpha
		)} ${options.midStop}%, ${rgbValue('24 24 27', options.baseAlpha)} 100%), ${rgbValue(
			'24 24 27',
			options.baseAlpha
		)}`
	].join('; ');
};

export const getCardToneStyle = (serializedColor = '') =>
	buildToneSurfaceStyle(serializedColor, {
		borderAlpha: 0.22,
		topAlpha: 0.18,
		midAlpha: 0.08,
		baseAlpha: 0.95,
		midStop: 38
	});

export const getColumnToneStyle = (serializedColor = '') =>
	buildToneSurfaceStyle(serializedColor, {
		borderAlpha: 0.18,
		topAlpha: 0.12,
		midAlpha: 0.05,
		baseAlpha: 0.9,
		midStop: 32
	});

export const getColumnHeaderToneStyle = (serializedColor = '') => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	return [
		`border-color: ${rgbValue(rgb, 0.16)}`,
		`background: linear-gradient(180deg, ${rgbValue(rgb, 0.16)} 0%, ${rgbValue(rgb, 0.06)} 100%), ${rgbValue('9 9 11', 0.38)}`
	].join('; ');
};

export const getColumnDotStyle = (serializedColor = '') => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	return `background: ${rgbValue(rgb)}`;
};

export const getModalToneStyle = (serializedColor = '') => {
	const tone = resolveTone(serializedColor);
	if (tone === 'neutral') return '';

	const rgb = TONE_RGB[tone];
	return [
		`border-color: ${rgbValue(rgb, 0.22)}`,
		`background: radial-gradient(circle at top right, ${rgbValue(rgb, 0.22)}, transparent 24rem), linear-gradient(180deg, ${rgbValue(rgb, 0.08)} 0%, ${rgbValue('24 24 27', 0.97)} 42%), ${rgbValue('24 24 27', 0.97)}`
	].join('; ');
};
