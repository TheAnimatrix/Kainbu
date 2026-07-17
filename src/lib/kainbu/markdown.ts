import DOMPurify from 'dompurify';
import { Marked, type Token, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import type { TaskReferenceKind, TaskReferenceOption } from '$lib/kainbu/taskMarkdown';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c++', cpp);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('go', go);

const markdownRenderer = new Marked();
/** Inline/block fragment parser for table cell list items (no custom extensions). */
const tableCellMarkdown = new Marked({ gfm: true, breaks: true });
type StandaloneCheckboxToken = Tokens.Generic & {
	type: 'standaloneCheckbox';
	checked: boolean;
	text: string;
	tokens: Token[];
};

markdownRenderer.setOptions({
	gfm: true,
	breaks: true
});

type RenderMarkdownOptions = {
	assetUrls?: Record<string, string>;
	referenceLookup?: Record<string, TaskReferenceOption>;
};

// Task asset previews are loaded as object URLs (`blob:`), so we need to explicitly
// allow that scheme while keeping DOMPurify's default-safe URL policy otherwise.
const SAFE_URI_PATTERN =
	/^(?:(?:(?:blob|(f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)))/i;

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

/** Plain-text preview for status traces (thinking snippets, tool output). */
export const stripMarkdownLite = (value: string) => {
	const text = (value || '').replace(/\r\n/g, '\n');
	return text
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`\n]+)`/g, '$1')
		.replace(/\*\*([^*\n]+)\*\*/g, '$1')
		.replace(/\*([^*\n]+)\*/g, '$1')
		.replace(/__([^_\n]+)__/g, '$1')
		.replace(/_([^_\n]+)_/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*>\s?/gm, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*\d+\.\s+/gm, '')
		.replace(/\n+/g, ' ')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
};

const STANDALONE_CHECKBOX_LINE_PATTERN = /^\s*\[[ xX]\]\s+/;

export const normalizeStandaloneCheckboxBoundaries = (value: string) => {
	const normalized = (value || '').replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	const nextLines: string[] = [];
	let inFence = false;

	for (const line of lines) {
		if (!inFence && STANDALONE_CHECKBOX_LINE_PATTERN.test(line)) {
			const previousLine = nextLines[nextLines.length - 1] || '';
			if (previousLine.trim().length > 0) {
				nextLines.push('');
			}
		}

		nextLines.push(line);

		if (/^\s*```/.test(line)) {
			inFence = !inFence;
		}
	}

	return nextLines.join('\n');
};

markdownRenderer.use({
	extensions: [
		{
			name: 'standaloneCheckbox',
			level: 'block',
			start(source: string) {
				return source.match(/^\[[ xX]\]\s+/)?.index;
			},
			tokenizer(this: { lexer: { inlineTokens: (text: string) => unknown[] } }, source: string) {
				const match = source.match(/^\[([ xX])\]\s+([^\n]*)(?:\n|$)/);
				if (!match) return undefined;
				const text = match[2] || '';
				return {
					type: 'standaloneCheckbox',
					raw: match[0],
					checked: match[1]?.toLowerCase() === 'x',
					text,
					tokens: this.lexer.inlineTokens(text) as Token[]
				} satisfies StandaloneCheckboxToken;
			},
			renderer(token) {
				const standaloneToken = token as StandaloneCheckboxToken;
				const content = standaloneToken.tokens
					? this.parser.parseInline(standaloneToken.tokens)
					: escapeHtml(standaloneToken.text || '');
				return `<div class="kainbu-standalone-checkbox"><input type="checkbox" disabled${
					standaloneToken.checked ? ' checked' : ''
				}><span class="kainbu-standalone-checkbox__content">${content}</span></div>`;
			}
		}
	],
	renderer: {
		code(token) {
			const language = (token.lang || '').trim().toLowerCase();
			const source = token.text || '';
			const languageClass = language ? ` language-${escapeHtml(language)}` : '';
			const highlighted = language && hljs.getLanguage(language)
				? hljs.highlight(source, { language, ignoreIllegals: true }).value
				: escapeHtml(source);
			const langDisplay = language || 'plain';
			const copyId = `cb-${Math.random().toString(36).slice(2, 9)}`;
			return `<div class="kainbu-code-block">
				<div class="kainbu-code-block__header">
					<span class="kainbu-code-block__lang">${escapeHtml(langDisplay)}</span>
					<button class="kainbu-code-block__copy" data-copy="${copyId}" type="button" title="Copy code">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
						<span>Copy</span>
					</button>
				</div>
				<pre class="kainbu-code-block__pre"><code id="${copyId}" class="hljs${languageClass}">${highlighted}</code></pre>
			</div>`;

			// Attach click handler for copy button
			if (typeof document !== 'undefined') {
				setTimeout(() => {
					const btn = document.querySelector(`[data-copy="${copyId}"]`);
					if (btn) {
						btn.addEventListener('click', () => {
							const code = document.getElementById(copyId);
							if (code) {
								navigator.clipboard.writeText(code.textContent || '').then(() => {
									const span = btn.querySelector('span');
									if (span) { span.textContent = 'Copied!'; setTimeout(() => { span.textContent = 'Copy'; }, 2000); }
								}).catch(() => {});
							}
						});
					}
				}, 0);
			}
		}
	}
});

const TABLE_SEPARATOR_LINE = /^\|[-:\s|]+\|\s*$/;
const TABLE_LIST_LINE = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/;

const isTableSeparatorLine = (line: string) => TABLE_SEPARATOR_LINE.test(line.trim());

/** Merge continuation lines (e.g. list items) into the previous table row. */
export const joinContinuedTableRows = (value: string) => {
	const lines = value.replace(/\r\n/g, '\n').split('\n');
	const result: string[] = [];
	let inTable = false;
	let buffer: string | null = null;

	const flushBuffer = () => {
		if (buffer) {
			result.push(buffer);
			buffer = null;
		}
	};

	for (const line of lines) {
		const trimmed = line.trim();

		if (isTableSeparatorLine(trimmed)) {
			flushBuffer();
			inTable = true;
			result.push(line);
			continue;
		}

		if (inTable && trimmed && !trimmed.startsWith('|')) {
			const continuation = trimmed.endsWith('|') ? trimmed.slice(0, -1).trimEnd() : trimmed;
			if (!buffer) {
				const last = result.pop();
				buffer = last ? `${last.replace(/\|\s*$/, '')}<br>${continuation}` : line;
			} else {
				buffer = `${buffer}<br>${continuation}`;
			}
			if (trimmed.endsWith('|')) {
				buffer = `${buffer}|`;
				flushBuffer();
			}
			continue;
		}

		if (inTable && trimmed.startsWith('|')) {
			flushBuffer();
			if (trimmed.endsWith('|')) {
				result.push(line);
			} else {
				buffer = line;
			}
			continue;
		}

		if (!trimmed) {
			inTable = false;
			flushBuffer();
			result.push(line);
			continue;
		}

		inTable = false;
		flushBuffer();
		result.push(line);
	}

	flushBuffer();
	return result.join('\n');
};

const splitTableRowCells = (row: string) => {
	const trimmed = row.trim();
	if (!trimmed.startsWith('|')) return null;
	const inner = trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed.slice(1);
	return inner.split('|').map((cell) => cell.trim());
};

const splitCellLines = (text: string) =>
	text
		.split(/(?:<br\s*\/?>|\n)/i)
		.map((line) => line.trim())
		.filter(Boolean);

const isListCellContent = (text: string) => {
	const lines = splitCellLines(text);
	return lines.length > 0 && lines.every((line) => TABLE_LIST_LINE.test(line));
};

const parseTableCellInline = (markdown: string) => {
	const html = tableCellMarkdown.parse(markdown, { async: false });
	return html.replace(/^<p>([\s\S]*)<\/p>\s*$/i, '$1').trim() || html.trim();
};

const renderTableCellListHtml = (text: string) => {
	const lines = splitCellLines(text);
	const items = lines.map((line) => {
		const match = line.match(TABLE_LIST_LINE);
		const itemMarkdown = match?.[1] || line;
		return `<li>${parseTableCellInline(itemMarkdown)}</li>`;
	});
	return `<ul class="kainbu-cell-list">${items.join('')}</ul>`;
};

/** Convert markdown list syntax inside pipe-table cells to HTML lists (GFM cells are inline-only). */
export const convertMarkdownTableListCells = (value: string) => {
	const lines = value.split('\n');
	return lines
		.map((line) => {
			const trimmed = line.trim();
			if (!trimmed.startsWith('|') || isTableSeparatorLine(trimmed) || !trimmed.endsWith('|')) {
				return line;
			}

			const cells = splitTableRowCells(line);
			if (!cells) return line;

			const nextCells = cells.map((cell) =>
				isListCellContent(cell) ? renderTableCellListHtml(cell) : cell
			);
			return `| ${nextCells.join(' | ')} |`;
		})
		.join('\n');
};

const decodeHtmlEntities = (value: string) =>
	value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');

const extractCellPlainText = (html: string) =>
	decodeHtmlEntities(
		html
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>\s*<p>/gi, '\n')
			.replace(/<\/?p>/gi, '\n')
			.replace(/<[^>]+>/g, '')
	).trim();

/** Upgrade plain-text list lines inside rendered table cells (e.g. HTML tables from models). */
export const enhanceTableCellLists = (html: string) =>
	html.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, content) => {
		if (/<ul[\s>]/i.test(content)) return match;

		const plain = extractCellPlainText(content);
		if (!plain || !isListCellContent(plain)) return match;

		return `<${tag}${attrs}>${renderTableCellListHtml(plain)}</${tag}>`;
	});

const wrapTablesForScroll = (html: string) =>
	html.replace(/<table(\s[^>]*)?>[\s\S]*?<\/table>/gi, (table) => {
		return `<div class="kainbu-table-scroll">${table}</div>`;
	});

const replaceAssetEmbeds = (html: string, assetUrls: Record<string, string>) =>
	html.replace(/<img([^>]*?)src="asset:([^"]+)"([^>]*)>/g, (_match, before, assetId, after) => {
		const resolvedUrl = assetUrls[assetId];
		if (!resolvedUrl) {
			return `<span class="kainbu-asset-missing" data-asset-id="${escapeHtml(assetId)}">Image unavailable</span>`;
		}

		return `<img${before}src="${escapeHtml(resolvedUrl)}"${after} data-asset-id="${escapeHtml(assetId)}" loading="lazy">`;
	});

const getReferenceKey = (kind: TaskReferenceKind, id: string) => `${kind}:${id}`;

const renderTaskReferenceMeta = (reference: TaskReferenceOption) => {
	const metaParts = [reference.checked ? 'Done' : '', reference.columnTitle || ''].filter(Boolean);
	const tagBadges = (reference.tags || [])
		.slice(0, 3)
		.map(
			(tag) =>
				`<span class="kainbu-ref-chip__tag" data-tag-color="${escapeHtml(tag.color)}">${escapeHtml(tag.label)}</span>`
		)
		.join('');
	const extraTagCount = Math.max((reference.tags || []).length - 3, 0);
	const extraTagBadge = extraTagCount
		? `<span class="kainbu-ref-chip__tag kainbu-ref-chip__tag-more">+${extraTagCount}</span>`
		: '';

	return `
		<span class="kainbu-ref-chip__meta-row">
			${metaParts.length ? `<span class="kainbu-ref-chip__meta">${escapeHtml(metaParts.join(' · '))}</span>` : ''}
			${tagBadges}
			${extraTagBadge}
		</span>
	`;
};

const renderReferenceChip = (
	kind: TaskReferenceKind,
	id: string,
	label: string,
	referenceLookup: Record<string, TaskReferenceOption>
) => {
	const reference = referenceLookup[getReferenceKey(kind, id)];
	const taskDetails =
		kind === 'task' && reference
			? renderTaskReferenceMeta(reference)
			: '';

	return `<span class="kainbu-ref-chip kainbu-ref-chip-${escapeHtml(kind)}" data-ref-kind="${escapeHtml(kind)}" data-ref-id="${escapeHtml(id)}"><span class="kainbu-ref-chip__label">${label}</span>${taskDetails}</span>`;
};

const replaceReferenceLinks = (
	html: string,
	referenceLookup: Record<string, TaskReferenceOption>
) =>
	html.replace(
		/<a href="ref:(task|member|column):([^"]+)">([\s\S]*?)<\/a>/g,
		(_match, kind, id, label) =>
			renderReferenceChip(kind as TaskReferenceKind, id, label, referenceLookup)
	);

export const collapseNestedTaskListStandaloneCheckboxes = (html: string) =>
	html.replace(
		/<li>(\s*<input\b[^>]*>\s*)<div class="kainbu-standalone-checkbox">\s*<input\b[^>]*>\s*<span class="kainbu-standalone-checkbox__content">([\s\S]*?)<\/span>\s*<\/div>([\s\S]*?)<\/li>/g,
		(_match, listCheckbox, content, trailing) =>
			`<li>${listCheckbox}<span class="kainbu-standalone-checkbox__content">${content}</span>${trailing}</li>`
	);

export const renderMarkdown = (value: string, options: RenderMarkdownOptions = {}) => {
	// Do not escape < and > — marked handles raw HTML natively and DOMPurify
	// sanitises the final output. Escaping here would break intentional HTML.
	const normalizedValue = normalizeStandaloneCheckboxBoundaries(value || '');
	const withJoinedTableRows = joinContinuedTableRows(normalizedValue);
	const withTableListCells = convertMarkdownTableListCells(withJoinedTableRows);
	const raw = markdownRenderer.parse(withTableListCells, { async: false });
	const withCellLists = enhanceTableCellLists(raw);
	const withAssets = replaceAssetEmbeds(withCellLists, options.assetUrls || {});
	const withReferences = replaceReferenceLinks(withAssets, options.referenceLookup || {});
	const normalizedCheckboxMarkup = collapseNestedTaskListStandaloneCheckboxes(withReferences);
	const withTableScroll = wrapTablesForScroll(normalizedCheckboxMarkup);
	return DOMPurify.sanitize(withTableScroll, {
		ADD_TAGS: ['input'],
		ADD_ATTR: [
			'checked',
			'disabled',
			'type',
			'class',
			'data-asset-id',
			'data-ref-kind',
			'data-ref-id',
			'data-tag-color',
			'data-language',
			'loading'
		],
		ALLOWED_URI_REGEXP: SAFE_URI_PATTERN
	});
};
