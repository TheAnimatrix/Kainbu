import type { Tag } from '$lib/kainbu/types';

export type SlashCommandId =
	| 'paragraph'
	| 'page'
	| 'heading-1'
	| 'heading-2'
	| 'heading-3'
	| 'bullet-list'
	| 'checklist'
	| 'quote'
	| 'code-block'
	| 'divider'
	| 'image';

export type TaskReferenceKind = 'task' | 'member' | 'column';

export type TaskReferenceOption = {
	kind: TaskReferenceKind;
	id: string;
	label: string;
	description?: string;
	searchText: string;
	columnId?: string;
	columnTitle?: string;
	tags?: Tag[];
	checked?: boolean;
};

export type TextEditResult = {
	value: string;
	selectionStart: number;
	selectionEnd: number;
};

export type AssetBlockMatch = {
	alt: string;
	assetId: string;
	width?: number;
};

type TokenMatch = {
	start: number;
	end: number;
	query: string;
};

const normalizeLineRange = (value: string, caret: number) => {
	const safeCaret = Math.max(0, Math.min(caret, value.length));
	const lineStart = value.lastIndexOf('\n', safeCaret - 1) + 1;
	const nextBreak = value.indexOf('\n', safeCaret);
	const lineEnd = nextBreak === -1 ? value.length : nextBreak;

	return {
		lineStart,
		lineEnd,
		lineText: value.slice(lineStart, lineEnd),
		linePrefix: value.slice(lineStart, safeCaret)
	};
};

export const replaceRange = (
	value: string,
	start: number,
	end: number,
	replacement: string,
	selectionOffset = replacement.length
): TextEditResult => {
	const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
	const nextSelection = start + selectionOffset;
	return {
		value: nextValue,
		selectionStart: nextSelection,
		selectionEnd: nextSelection
	};
};

export const getActiveSlashQuery = (value: string, caret: number): TokenMatch | null => {
	const { lineStart, linePrefix } = normalizeLineRange(value, caret);
	const match = linePrefix.match(/^\s*\/([^\s]*)$/);
	if (!match) return null;

	return {
		start: lineStart + linePrefix.indexOf('/'),
		end: caret,
		query: match[1]?.toLowerCase() || ''
	};
};

export const getActiveMentionQuery = (value: string, caret: number): TokenMatch | null => {
	const prefix = value.slice(0, caret);
	const match = prefix.match(/(^|[\s([{>])@([^\s@[\](){}<>]*)$/);
	if (!match) return null;

	return {
		start: caret - (match[2]?.length || 0) - 1,
		end: caret,
		query: match[2]?.toLowerCase() || ''
	};
};

const SLASH_INSERTIONS: Record<
	Exclude<SlashCommandId, 'image'>,
	{ text: string; selectionOffset?: number }
> = {
	paragraph: { text: '' },
	page: { text: '# ' },
	'heading-1': { text: '# ' },
	'heading-2': { text: '## ' },
	'heading-3': { text: '### ' },
	'bullet-list': { text: '- ' },
	checklist: { text: '- [ ] ' },
	quote: { text: '> ' },
	'code-block': { text: '```\n\n```', selectionOffset: 4 },
	divider: { text: '---\n' }
};

export const applySlashCommand = (
	value: string,
	caret: number,
	commandId: Exclude<SlashCommandId, 'image'>
): TextEditResult => {
	const slashQuery = getActiveSlashQuery(value, caret);
	if (!slashQuery) {
		const insertion = SLASH_INSERTIONS[commandId];
		return replaceRange(
			value,
			caret,
			caret,
			insertion.text,
			insertion.selectionOffset ?? insertion.text.length
		);
	}

	const { lineEnd } = normalizeLineRange(value, caret);
	const insertion = SLASH_INSERTIONS[commandId];
	return replaceRange(
		value,
		slashQuery.start,
		lineEnd,
		insertion.text,
		insertion.selectionOffset ?? insertion.text.length
	);
};

export const buildReferenceMarkdown = (reference: TaskReferenceOption) =>
	`[${reference.label}](ref:${reference.kind}:${reference.id})`;

export const insertReference = (
	value: string,
	start: number,
	end: number,
	reference: TaskReferenceOption
) => replaceRange(value, start, end, buildReferenceMarkdown(reference));

const ASSET_BLOCK_PATTERN =
	/^!\[([^\]]*)\]\(asset:([^)]+)\)(?:\s*\{\s*width\s*=\s*(\d+)\s*\})?\s*$/;

export const parseAssetBlock = (block: string): AssetBlockMatch | null => {
	const match = block.trim().match(ASSET_BLOCK_PATTERN);
	if (!match) return null;

	const width = match[3] ? Number(match[3]) : undefined;
	return {
		alt: match[1] || '',
		assetId: match[2] || '',
		width: Number.isFinite(width) ? width : undefined
	};
};

export const buildAssetMarkdown = (
	assetId: string,
	alt: string,
	options: { width?: number } = {}
) => {
	const widthSuffix =
		typeof options.width === 'number' && Number.isFinite(options.width) && options.width > 0
			? `{width=${Math.round(options.width)}}`
			: '';
	return `![${alt}](asset:${assetId})${widthSuffix}`;
};

export const setAssetBlockWidth = (block: string, width?: number) => {
	const parsed = parseAssetBlock(block);
	if (!parsed) return block;
	return buildAssetMarkdown(parsed.assetId, parsed.alt, { width });
};

export const replaceAssetEmbedsForClipboard = (value: string) =>
	value.replace(/!\[[^\]]*?\]\(asset:[^)]+\)(?:\s*\{\s*width\s*=\s*\d+\s*\})?/g, '![]()');

export const replaceAssetToken = (value: string, fromAssetId: string, toAssetId: string) =>
	value.replaceAll(`asset:${fromAssetId}`, `asset:${toAssetId}`);

export const stripAssetEmbeds = (value: string, assetId: string) => {
	const escapedAssetId = assetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const embedPattern = new RegExp(
		String.raw`(?:^|\n)?!\[[^\]]*?\]\(asset:${escapedAssetId}\)(?:\s*\{\s*width\s*=\s*\d+\s*\})?\s*(?:\n|$)?`,
		'g'
	);
	const stripped = value.replace(embedPattern, (match) => {
		const startsWithBreak = match.startsWith('\n');
		const endsWithBreak = match.endsWith('\n');
		if (startsWithBreak && endsWithBreak) return '\n';
		return '';
	});

	return stripped.replace(/\n{3,}/g, '\n\n').trimEnd();
};

export const insertTextAtSelection = (value: string, start: number, end: number, text: string) =>
	replaceRange(value, start, end, text);

const CHECKBOX_LINE_PATTERN = /^(\s*(?:[-*+]\s+)?)\[([ xX])\](.*)$/;
const STANDALONE_CHECKBOX_LINE_PATTERN = /^(\s*)\[([ xX])\](.*)$/;
const LEADING_CARD_CHECKBOX_LINE_PATTERN = /^(\s*(?:[-*+]\s+)?)\[([ xX])\]\s*(.*)$/;

const transformMarkdownLines = (
	value: string,
	mutator: (line: string, inFence: boolean) => string
) => {
	const normalized = value.replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	let inFence = false;
	const nextLines = lines.map((line) => {
		const nextLine = mutator(line, inFence);
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
		}
		return nextLine;
	});
	return nextLines.join('\n');
};

export const normalizeStandaloneCheckboxLines = (value: string) =>
	transformMarkdownLines(value, (line, inFence) => {
		if (inFence) return line;
		const standalone = line.match(STANDALONE_CHECKBOX_LINE_PATTERN);
		if (!standalone) return line;
		return `${standalone[1]}- [${standalone[2]}]${standalone[3]}`;
	});

export const hasLeadingCardCheckboxLine = (value: string) => {
	const [firstLine = ''] = value.replace(/\r\n/g, '\n').split('\n');
	return LEADING_CARD_CHECKBOX_LINE_PATTERN.test(firstLine);
};

export const stripLeadingCardCheckboxLine = (value: string) =>
	value
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line, index) => {
			if (index !== 0) return line;
			const match = line.match(LEADING_CARD_CHECKBOX_LINE_PATTERN);
			if (!match) return line;
			const indentation = match[1].replace(/[-*+]\s+$/, '');
			return `${indentation}${match[3]}`;
		})
		.join('\n');

export const syncLeadingCardCheckboxLine = (value: string, checked: boolean) =>
	value
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line, index) => {
			if (index !== 0) return line;
			const match = line.match(LEADING_CARD_CHECKBOX_LINE_PATTERN);
			if (!match) return line;
			return `${match[1]}[${checked ? 'x' : ' '}] ${match[3]}`;
		})
		.join('\n');

export const countMarkdownCheckboxes = (value: string) => {
	let count = 0;
	transformMarkdownLines(value, (line, inFence) => {
		if (!inFence && CHECKBOX_LINE_PATTERN.test(line)) {
			count += 1;
		}
		return line;
	});
	return count;
};

export const toggleMarkdownCheckbox = (value: string, targetIndex: number, checked: boolean) => {
	if (targetIndex < 0) return value;
	let currentIndex = 0;
	let toggled = false;

	const nextValue = transformMarkdownLines(value, (line, inFence) => {
		if (toggled || inFence) return line;
		const match = line.match(CHECKBOX_LINE_PATTERN);
		if (!match) return line;
		if (currentIndex++ !== targetIndex) return line;
		toggled = true;
		return `${match[1]}[${checked ? 'x' : ' '}]${match[3]}`;
	});

	return toggled ? nextValue : value;
};
