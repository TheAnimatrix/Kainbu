import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const filesToPatch = [
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'src', 'helpers', 'scroller.js'),
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'src', 'helpers', 'multiScroller.js'),
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'dist', 'index.js'),
	path.join(rootDir, 'node_modules', 'svelte-dnd-action', 'dist', 'index.mjs')
];

const findScrollableParentsReplacement = `function findScrollableParents(element) {
    if (!element) {
        return [];
    }
    const scrollableContainers = [];
    let parent = element;
    while (parent) {
        const style = window.getComputedStyle(parent);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const isScrollableY = overflowY === "scroll" || overflowY === "auto";
        const isScrollableX = overflowX === "scroll" || overflowX === "auto";
        if (isScrollableX || isScrollableY) {
            scrollableContainers.push(parent);
        }
        parent = parent.parentElement;
    }
    return scrollableContainers;
}`;

const findScrollableParentsDistReplacement = `function findScrollableParents(element) {
  if (!element) {
    return [];
  }
  var scrollableContainers = [];
  var parent = element;
  while (parent) {
    var style = window.getComputedStyle(parent);
    var overflowY = style.overflowY;
    var overflowX = style.overflowX;
    var isScrollableY = overflowY === "scroll" || overflowY === "auto";
    var isScrollableX = overflowX === "scroll" || overflowX === "auto";
    if (isScrollableX || isScrollableY) {
      scrollableContainers.push(parent);
    }
    parent = parent.parentElement;
  }
  return scrollableContainers;
}`;

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

const patchScrollerSpeed = (content) => {
	if (content.includes('MOBILE_SCROLL_DAMPING')) {
		return content;
	}

	let next = content.replace(
		/(const|var) SCROLL_ZONE_PX = 30;/,
		`$1 SCROLL_ZONE_PX = 30;\n$1 MOBILE_SCROLL_DAMPING = 0.35;\n$1 MOBILE_MAX_WIDTH_PX = 1023;`
	);

	next = next.replace(
		/function calcScrollStepPx\(distancePx\) \{\s*return SCROLL_ZONE_PX - distancePx;\s*\}/,
		speedReplacement
	);

	return next;
};

const patchScrollableParents = (content, filePath) => {
	if (content.includes('const isScrollableY = overflowY === "scroll"')) {
		return content;
	}

	if (filePath.endsWith('multiScroller.js')) {
		return content.replace(
			/function findScrollableParents\(element\) \{[\s\S]*?return scrollableContainers;\n\}/,
			findScrollableParentsReplacement
		);
	}

	return content.replace(
		/function findScrollableParents\(element\) \{[\s\S]*?return scrollableContainers;\n\}/,
		findScrollableParentsDistReplacement
	);
};

const patchFile = (filePath) => {
	if (!existsSync(filePath)) {
		return;
	}

	let content = readFileSync(filePath, 'utf8');

	if (filePath.endsWith('scroller.js')) {
		content = patchScrollerSpeed(content);
	} else if (filePath.includes('multiScroller') || filePath.endsWith('index.js') || filePath.endsWith('index.mjs')) {
		content = patchScrollableParents(content, filePath);
		if (filePath.endsWith('index.js') || filePath.endsWith('index.mjs')) {
			content = patchScrollerSpeed(content);
		}
	}

	writeFileSync(filePath, content);
};

for (const filePath of filesToPatch) {
	patchFile(filePath);
}
