import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const filesToPatch = [
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'src', 'helpers', 'scroller.js'),
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'dist', 'index.js'),
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'dist', 'index.mjs')
];

const speedReplacement = `function calcScrollStepPx(distancePx) {
        const baseStepPx = SCROLL_ZONE_PX - distancePx;
        const isMobileViewport =
            typeof window !== "undefined" &&
            window.matchMedia("(max-width: " + MOBILE_MAX_WIDTH_PX + "px)").matches;
        if (isMobileViewport) {
            return Math.max(1, Math.ceil(baseStepPx * MOBILE_SCROLL_DAMPING));
        }
        return baseStepPx;
    }`;

const patchFile = (filePath) => {
	if (!existsSync(filePath)) {
		return;
	}

	let content = readFileSync(filePath, 'utf8');

	if (content.includes('MOBILE_SCROLL_DAMPING')) {
		return;
	}

	content = content.replace(
		/(const|var) SCROLL_ZONE_PX = 30;/,
		`$1 SCROLL_ZONE_PX = 30;\n$1 MOBILE_SCROLL_DAMPING = 0.35;\n$1 MOBILE_MAX_WIDTH_PX = 1023;`
	);

	content = content.replace(
		/function calcScrollStepPx\(distancePx\) \{\s*return SCROLL_ZONE_PX - distancePx;\s*\}/,
		speedReplacement
	);

	writeFileSync(filePath, content);
};

for (const filePath of filesToPatch) {
	patchFile(filePath);
}
