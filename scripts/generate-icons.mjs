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

const BACKGROUND_COLOR = '#262820';
const MARK_COLOR = '#f4f0e7';
const sourceSvg = await fs.readFile(sourceSvgPath, 'utf8');
const iconSvg = sourceSvg.replace('currentColor', MARK_COLOR);
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
	sharp(Buffer.from(iconSvg), { density: SOURCE_DENSITY })
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
	await fs.writeFile(
		path.join(mipmapDir, 'ic_launcher_monochrome.png'),
		await buildTransparentIcon(adaptiveSize, ADAPTIVE_MARK_SCALE)
	);
}

// All web and native variants derive from the same vector used by BrandMark.
const webIconsDir = path.join(rootDir, 'static', 'icons');
await fs.mkdir(webIconsDir, { recursive: true });
for (const size of [192, 512]) {
	await fs.writeFile(
		path.join(webIconsDir, `icon-${size}x${size}.png`),
		await buildFullIcon(size, LEGACY_MARK_SCALE)
	);
}
await fs.writeFile(
	path.join(webIconsDir, 'apple-touch-icon.png'),
	await buildFullIcon(180, LEGACY_MARK_SCALE)
);
await fs.writeFile(
	path.join(webIconsDir, 'icon-maskable-512x512.png'),
	await buildFullIcon(512, 0.6)
);
const markPaths = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${BACKGROUND_COLOR}"/><g transform="translate(16 16) scale(.68)" fill="${MARK_COLOR}">${markPaths}</g></svg>\n`;
for (const file of ['static/favicon.svg', 'src/lib/assets/favicon.svg']) {
	await fs.writeFile(path.join(rootDir, file), favicon);
}
await fs.writeFile(
	path.join(androidResDir, 'values/ic_launcher_background.xml'),
	`<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${BACKGROUND_COLOR}</color></resources>\n`
);
await fs.writeFile(
	path.join(androidResDir, 'drawable/ic_launcher_background.xml'),
	`<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="${BACKGROUND_COLOR}"/></shape>\n`
);
const themedIconDir = path.join(androidResDir, 'mipmap-anydpi-v33');
await fs.mkdir(themedIconDir, { recursive: true });
for (const name of ['ic_launcher', 'ic_launcher_round']) {
	await fs.writeFile(
		path.join(themedIconDir, `${name}.xml`),
		`<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/><monochrome android:drawable="@mipmap/ic_launcher_monochrome"/></adaptive-icon>\n`
	);
}
const paths = [...sourceSvg.matchAll(/<path[^>]*d="([^"]+)"[^>]*\/>/g)];
const androidPaths = paths
	.map(
		(match) =>
			`<path android:fillColor="${MARK_COLOR}" android:fillType="evenOdd" android:pathData="${match[1]}"/>`
	)
	.join('\n');
await fs.writeFile(
	path.join(androidResDir, 'drawable-v24/ic_launcher_foreground.xml'),
	`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="100" android:viewportHeight="100"><group android:scaleX=".62" android:scaleY=".62" android:translateX="19" android:translateY="19">${androidPaths}</group></vector>\n`
);
// Preserve each existing splash canvas size while replacing its old brand artwork.
for (const directory of await fs.readdir(androidResDir, { withFileTypes: true })) {
	if (!directory.isDirectory() || !directory.name.startsWith('drawable')) continue;
	const file = path.join(androidResDir, directory.name, 'splash.png');
	try {
		await fs.access(file);
	} catch {
		continue;
	}
	const { width, height } = await sharp(file).metadata();
	const mark = await renderMark(Math.round(Math.min(width, height) * 0.2));
	const output = await sharp({
		create: { width, height, channels: 4, background: BACKGROUND_COLOR }
	})
		.composite([{ input: mark, gravity: 'centre' }])
		.png()
		.toBuffer();
	await fs.writeFile(file, output);
}
console.log('Join identity generated for web, Apple touch, Android launchers, and splash screens.');
