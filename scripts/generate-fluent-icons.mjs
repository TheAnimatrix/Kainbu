import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const iconsDir = path.join(root, 'src/lib/icons');
const componentsDir = path.join(iconsDir, 'components');

const ICON_NAMES = [
	'ArrowDownToLine',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUpToLine',
	'AtSign',
	'Check',
	'CheckCheck',
	'CheckCircle2',
	'CheckSquare',
	'ChevronDown',
	'ChevronLeft',
	'ChevronRight',
	'ChevronsDownUp',
	'ChevronsLeft',
	'Circle',
	'ClipboardCopy',
	'Clock3',
	'CloudAlert',
	'CloudCog',
	'Copy',
	'Dot',
	'Download',
	'Edit3',
	'Ellipsis',
	'Expand',
	'ExternalLink',
	'Eye',
	'FileText',
	'FolderPlus',
	'Globe',
	'ImageUp',
	'Info',
	'KeyRound',
	'LayoutPanelTop',
	'Link2',
	'LoaderCircle',
	'Lock',
	'LogIn',
	'LogOut',
	'Mail',
	'Menu',
	'MessageSquare',
	'MessageSquarePlus',
	'Moon',
	'Network',
	'NotebookPen',
	'Palette',
	'Paperclip',
	'PanelRight',
	'PanelRightOpen',
	'Pencil',
	'Pin',
	'PinOff',
	'Plus',
	'RectangleHorizontal',
	'Redo2',
	'RefreshCcw',
	'RefreshCw',
	'Repeat2',
	'RotateCcw',
	'Search',
	'Send',
	'Server',
	'Settings2',
	'Share2',
	'SlidersHorizontal',
	'Sparkles',
	'Square',
	'Sun',
	'Tag',
	'TagIcon',
	'Trash2',
	'Undo2',
	'Unlink',
	'Upload',
	'UserPlus',
	'Users',
	'X',
	'XCircle',
	'Grid',
	'Board',
	'Document'
];

fs.mkdirSync(componentsDir, { recursive: true });

for (const name of ICON_NAMES) {
	const file = path.join(componentsDir, `${name}.svelte`);
	const content = `<script lang="ts">
	import BaseIcon from '$lib/components/FluentIcon.svelte';
	import type { FluentIconProps } from '$lib/icons/types';

	let props: FluentIconProps = $props();
</script>

<BaseIcon name="${name}" {...props} />
`;
	fs.writeFileSync(file, content);
}

const indexLines = ICON_NAMES.map(
	(name) => `export { default as ${name} } from './components/${name}.svelte';`
);
fs.writeFileSync(path.join(iconsDir, 'index.ts'), `${indexLines.join('\n')}\n`);

const svelteFiles = [];
function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (entry.name.endsWith('.svelte')) svelteFiles.push(full);
	}
}
walk(path.join(root, 'src'));

let migrated = 0;
for (const file of svelteFiles) {
	let source = fs.readFileSync(file, 'utf8');
	if (!source.includes("from 'lucide-svelte'")) continue;

	source = source.replaceAll("from 'lucide-svelte'", "from '$lib/icons'");
	fs.writeFileSync(file, source);
	migrated += 1;
}

console.log(`Generated ${ICON_NAMES.length} icon components. Migrated ${migrated} Svelte files.`);
