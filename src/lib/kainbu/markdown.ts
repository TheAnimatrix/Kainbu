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

const markdownRenderer = new Marked();
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
			const highlighted = language && hljs.getLanguage(language)
				? hljs.highlight(source, { language, ignoreIllegals: true }).value
				: escapeHtml(source);
			const languageClass = language ? ` language-${escapeHtml(language)}` : '';
			return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`;
		}
	}
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
	const normalizedValue = normalizeStandaloneCheckboxBoundaries(value || '');
	const raw = markdownRenderer.parse(normalizedValue, { async: false });
	const withAssets = replaceAssetEmbeds(raw, options.assetUrls || {});
	const withReferences = replaceReferenceLinks(withAssets, options.referenceLookup || {});
	const normalizedCheckboxMarkup = collapseNestedTaskListStandaloneCheckboxes(withReferences);
	return DOMPurify.sanitize(normalizedCheckboxMarkup, {
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
			'loading'
		],
		ALLOWED_URI_REGEXP: SAFE_URI_PATTERN
	});
};
