import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceSvgPath = path.join(rootDir, 'assets', 'icon.svg');
const outputIconPath = path.join(rootDir, 'assets', 'icon.png');
const outputForegroundPath = path.join(rootDir, 'assets', 'icon-only.png');
const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

const BACKGROUND_COLOR = '#2d2d2d';
const LEGACY_MARK_SCALE = 0.68;
const ADAPTIVE_MARK_SCALE = 0.62;
const SOURCE_DENSITY = 2400;

const legacySizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptiveSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const createCanvas = (size, background) =>
	sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background
		}
	});

const renderMark = async (size) =>
	sharp(sourceSvgPath, { density: SOURCE_DENSITY })
		.resize(size, size, { fit: 'contain' })
		.png()
		.toBuffer();

const placeCentered = async (size, markBuffer, background = { r: 0, g: 0, b: 0, alpha: 0 }) => {
	const metadata = await sharp(markBuffer).metadata();
	const left = Math.floor((size - (metadata.width || 0)) / 2);
	const top = Math.floor((size - (metadata.height || 0)) / 2);

	return createCanvas(size, background)
		.composite([{ input: markBuffer, left, top }])
		.png()
		.toBuffer();
};

const buildTransparentIcon = async (size, scale) => {
	const markSize = Math.round(size * scale);
	const markBuffer = await renderMark(markSize);
	return placeCentered(size, markBuffer);
};

const buildFullIcon = async (size, scale) => {
	const foreground = await buildTransparentIcon(size, scale);
	return sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: BACKGROUND_COLOR
		}
	})
		.composite([{ input: foreground }])
		.png()
		.toBuffer();
};

const buildRoundIcon = async (size, scale) => {
	const squareIcon = await buildFullIcon(size, scale);
	const mask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
	);

	return sharp(squareIcon)
		.composite([{ input: mask, blend: 'dest-in' }])
		.png()
		.toBuffer();
};

await fs.mkdir(path.dirname(outputIconPath), { recursive: true });

await fs.writeFile(outputIconPath, await buildFullIcon(1024, LEGACY_MARK_SCALE));
await fs.writeFile(outputForegroundPath, await buildTransparentIcon(1024, ADAPTIVE_MARK_SCALE));

for (const [dpi, legacySize] of Object.entries(legacySizes)) {
	const adaptiveSize = adaptiveSizes[dpi];
	const mipmapDir = path.join(androidResDir, `mipmap-${dpi}`);
	await fs.mkdir(mipmapDir, { recursive: true });

	await fs.writeFile(
		path.join(mipmapDir, 'ic_launcher.png'),
		await buildFullIcon(legacySize, LEGACY_MARK_SCALE)
	);
	await fs.writeFile(
		path.join(mipmapDir, 'ic_launcher_round.png'),
		await buildRoundIcon(legacySize, LEGACY_MARK_SCALE)
	);
	await fs.writeFile(
		path.join(mipmapDir, 'ic_launcher_background.png'),
		await createCanvas(adaptiveSize, BACKGROUND_COLOR).png().toBuffer()
	);
	await fs.writeFile(
		path.join(mipmapDir, 'ic_launcher_foreground.png'),
		await buildTransparentIcon(adaptiveSize, ADAPTIVE_MARK_SCALE)
	);
	await fs.rm(path.join(mipmapDir, 'ic_launcher_monochrome.png'), { force: true });
}

console.log('Launcher icons generated from assets/icon.svg');
