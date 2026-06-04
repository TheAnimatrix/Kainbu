<script lang="ts">
	import {
		Editor,
		Extension,
		Node,
		type JSONContent,
		type NodeViewRendererProps
	} from '@tiptap/core';
	import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import { Table } from '@tiptap/extension-table';
	import { TableCell } from '@tiptap/extension-table-cell';
	import { TableHeader } from '@tiptap/extension-table-header';
	import { TableRow } from '@tiptap/extension-table-row';
	import TaskItem from '@tiptap/extension-task-item';
	import TaskList from '@tiptap/extension-task-list';
	import { Markdown } from '@tiptap/markdown';
	import { NodeSelection, PluginKey } from '@tiptap/pm/state';
	import StarterKit from '@tiptap/starter-kit';
	import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
	import { createLowlight } from 'lowlight';
	import bash from 'highlight.js/lib/languages/bash';
	import css from 'highlight.js/lib/languages/css';
	import javascript from 'highlight.js/lib/languages/javascript';
	import json from 'highlight.js/lib/languages/json';
	import python from 'highlight.js/lib/languages/python';
	import typescript from 'highlight.js/lib/languages/typescript';
	import xml from 'highlight.js/lib/languages/xml';

	const lowlight = createLowlight();
	lowlight.register('bash', bash);
	lowlight.register('sh', bash);
	lowlight.register('css', css);
	lowlight.register('javascript', javascript);
	lowlight.register('js', javascript);
	lowlight.register('json', json);
	lowlight.register('python', python);
	lowlight.register('py', python);
	lowlight.register('typescript', typescript);
	lowlight.register('ts', typescript);
	lowlight.register('xml', xml);
	lowlight.register('html', xml);
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		createBlockHandleObserverPlugin,
		deleteTopLevelNode,
		duplicateTopLevelNode,
		type BlockTransformId,
		type TopLevelBlock,
		ensureWritableSurfacesAroundAssetImages,
		findTopLevelBlockAtPos,
		focusWritableSurfaceBesideBlock,
		getTopLevelBlockDom,
		getTopLevelBlockByIndex,
		getTopLevelBlocks,
		insertParagraphNearTopLevelNode,
		moveTopLevelNode,
		transformTopLevelNode
	} from '$lib/kainbu/blockHandle';
	import { createId } from '$lib/kainbu/id';
	import {
		buildAssetMarkdown,
		buildReferenceMarkdown,
		type SlashCommandId,
		type TaskReferenceOption
	} from '$lib/kainbu/taskMarkdown';

	type ChangeReason = 'typing' | 'blur' | 'command' | 'mention' | 'upload' | 'checkbox';
	type ImageUploadSource = 'paste' | 'command';
	type ImageUploadRequest = {
		tempId: string;
		file: File;
		source: ImageUploadSource;
	};
	type ImageUploadResult = {
		tempId: string;
		assetId?: string;
		error?: string;
	};
	type SlashCommandOption = {
		id: SlashCommandId;
		label: string;
		description: string;
		queryTokens: string[];
	};
	type MenuRenderableItem = {
		label: string;
		description?: string;
	};
	type BlockMenuAction =
		| { id: BlockTransformId; kind: 'transform'; label: string; description: string }
		| {
				id: 'insert-above' | 'insert-below' | 'duplicate' | 'delete';
				kind: 'action';
				label: string;
				description: string;
		  };

	export let value = '';
	export let placeholder = '';
	export let disabled = false;
	export let blockHandleMode: 'page' | undefined = undefined;
	export let assetUrls: Record<string, string> = {};
	export let referenceOptions: TaskReferenceOption[] = [];
	export let onCheckboxToggle: ((index: number, checked: boolean) => void) | undefined = undefined;
	export let onReferenceNavigate: ((reference: TaskReferenceOption) => void) | undefined =
		undefined;
	export let onReferenceRemove: ((reference: TaskReferenceOption) => void) | undefined = undefined;
	export let onReferencePromote: ((reference: TaskReferenceOption) => void) | undefined = undefined;
	export let onEmbedDelete: ((assetId: string) => Promise<void> | void) | undefined = undefined;
	export let onEmbedAddToChat: ((assetId: string) => Promise<void> | void) | undefined = undefined;
	export let onChange: (
		nextValue: string,
		options?: { immediate?: boolean; reason?: ChangeReason }
	) => void = () => {};
	export let onImageUpload: (
		requests: ImageUploadRequest[]
	) => Promise<ImageUploadResult[]> = async () => [];

	// Kept for API compatibility while Tiptap handles checkbox edits directly.
	const getCheckboxToggleHandler = () => onCheckboxToggle;

	const slashCommands: SlashCommandOption[] = [
		{
			id: 'paragraph',
			label: 'Paragraph',
			description: 'Return to plain body text.',
			queryTokens: ['paragraph', 'text', 'body']
		},
		{
			id: 'page',
			label: 'Page',
			description: 'Insert a page-style heading block.',
			queryTokens: ['page', 'subpage', 'section']
		},
		{
			id: 'heading-1',
			label: 'Heading 1',
			description: 'Large section heading.',
			queryTokens: ['h1', 'heading', 'title']
		},
		{
			id: 'heading-2',
			label: 'Heading 2',
			description: 'Mid-sized section heading.',
			queryTokens: ['h2', 'heading']
		},
		{
			id: 'heading-3',
			label: 'Heading 3',
			description: 'Compact subsection heading.',
			queryTokens: ['h3', 'heading']
		},
		{
			id: 'bullet-list',
			label: 'Bullet List',
			description: 'Start a bulleted list.',
			queryTokens: ['bullet', 'list', 'ul']
		},
		{
			id: 'checklist',
			label: 'Checklist',
			description: 'Add a checkbox list item.',
			queryTokens: ['check', 'todo', 'list']
		},
		{
			id: 'quote',
			label: 'Quote',
			description: 'Indented block quote.',
			queryTokens: ['quote', 'callout']
		},
		{
			id: 'code-block',
			label: 'Code Block',
			description: 'Multi-line fenced code.',
			queryTokens: ['code', 'snippet', 'fence']
		},
		{
			id: 'divider',
			label: 'Divider',
			description: 'Horizontal rule.',
			queryTokens: ['divider', 'rule', 'separator']
		},
		{
			id: 'image',
			label: 'Image Embed',
			description: 'Upload and embed an image.',
			queryTokens: ['image', 'photo', 'embed', 'upload']
		}
	];
	const blockMenuActions: BlockMenuAction[] = [
		...slashCommands
			.filter((command) => command.id !== 'image')
			.map((command) => ({
				id: command.id as BlockTransformId,
				kind: 'transform' as const,
				label: command.label,
				description: command.description
			})),
		{
			id: 'insert-above',
			kind: 'action',
			label: 'Insert above',
			description: 'Add an empty paragraph block above this one.'
		},
		{
			id: 'insert-below',
			kind: 'action',
			label: 'Insert below',
			description: 'Add an empty paragraph block below this one.'
		},
		{
			id: 'duplicate',
			kind: 'action',
			label: 'Duplicate block',
			description: 'Create a copy of this block directly underneath.'
		},
		{
			id: 'delete',
			kind: 'action',
			label: 'Delete block',
			description: 'Remove this block from the page.'
		}
	];

	const TRAILING_BLOCK_HINT = '@ for reference  / for command';
	const EMPTY_EDITOR_DOC: JSONContent = {
		type: 'doc',
		content: [{ type: 'paragraph' }]
	};
	const IMAGE_BLOCK_DEFAULT_WIDTH = 520;
	const IMAGE_BLOCK_MIN_WIDTH = 180;
	const IMAGE_BLOCK_MAX_WIDTH = 920;
	const REFERENCE_SUGGESTION_KEY = new PluginKey('kainbu-reference-suggestion');
	const SLASH_SUGGESTION_KEY = new PluginKey('kainbu-slash-suggestion');

	const copySvg = `
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<rect x="9" y="9" width="10" height="10" rx="2"></rect>
			<path d="M5 15V7a2 2 0 0 1 2-2h8"></path>
		</svg>
	`;
	const openSvg = `
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<path d="M14 5h5v5"></path>
			<path d="M10 14L19 5"></path>
			<path d="M19 14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3"></path>
		</svg>
	`;
	const chatSvg = `
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<path d="M7 17l-3 3V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7z"></path>
			<path d="M12 9v6"></path>
			<path d="M9 12h6"></path>
		</svg>
	`;
	const trashSvg = `
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 6h18"></path>
			<path d="M8 6V4h8v2"></path>
			<path d="M19 6l-1 14H6L5 6"></path>
			<path d="M10 11v5"></path>
			<path d="M14 11v5"></path>
		</svg>
	`;

	const clampImageWidth = (width?: number) =>
		Math.max(
			IMAGE_BLOCK_MIN_WIDTH,
			Math.min(IMAGE_BLOCK_MAX_WIDTH, Math.round(width || IMAGE_BLOCK_DEFAULT_WIDTH))
		);

	const escapeHtml = (text: string) =>
		text
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');

	const getReferenceKey = (kind: TaskReferenceOption['kind'], id: string) => `${kind}:${id}`;

	const renderReferenceChipHtml = (
		attrs: { kind: TaskReferenceOption['kind']; id: string; label: string },
		referenceLookup: Record<string, TaskReferenceOption>
	) => {
		const reference = referenceLookup[getReferenceKey(attrs.kind, attrs.id)];
		const label = reference?.label || attrs.label;
		const metaParts = [
			reference?.checked ? 'Done' : '',
			reference?.columnTitle || reference?.description || ''
		].filter(Boolean);
		const tagBadges =
			attrs.kind === 'task'
				? (reference?.tags || [])
						.slice(0, 3)
						.map(
							(tag) =>
								`<span class="kainbu-ref-chip__tag" data-tag-color="${escapeHtml(tag.color)}">${escapeHtml(tag.label)}</span>`
						)
						.join('')
				: '';
		const extraTagCount =
			attrs.kind === 'task' ? Math.max((reference?.tags || []).length - 3, 0) : 0;
		const extraTagBadge = extraTagCount
			? `<span class="kainbu-ref-chip__tag kainbu-ref-chip__tag-more">+${extraTagCount}</span>`
			: '';
		const taskMeta =
			attrs.kind === 'task'
				? `<span class="kainbu-ref-chip__meta-row">${
						metaParts.length
							? `<span class="kainbu-ref-chip__meta">${escapeHtml(metaParts.join(' · '))}</span>`
							: ''
					}${tagBadges}${extraTagBadge}</span>`
				: '';

		return `<span class="kainbu-ref-chip kainbu-ref-chip-${escapeHtml(attrs.kind)}" data-ref-kind="${escapeHtml(attrs.kind)}" data-ref-id="${escapeHtml(attrs.id)}"><span class="kainbu-ref-chip__label">${escapeHtml(label)}</span>${taskMeta}</span>`;
	};

	const buildReferencePlaceholderHtml = (reference: TaskReferenceOption) =>
		`<kainbu-reference data-kind="${escapeHtml(reference.kind)}" data-id="${escapeHtml(reference.id)}" data-label="${escapeHtml(reference.label)}"></kainbu-reference>`;

	const buildAssetPlaceholderHtml = (assetId: string, alt: string, width?: number) =>
		`<kainbu-asset data-asset-id="${escapeHtml(assetId)}" data-alt="${escapeHtml(
			alt
		)}"${typeof width === 'number' ? ` data-width="${clampImageWidth(width)}"` : ''}></kainbu-asset>`;

	const preprocessMarkdownForEditor = (source: string) =>
		(source || '')
			.replace(
				/\[([^\]]+)\]\(ref:(task|member|column):([^)]+)\)/g,
				(_match, label: string, kind: TaskReferenceOption['kind'], id: string) =>
					buildReferencePlaceholderHtml({
						kind,
						id,
						label,
						searchText: label
					})
			)
			.replace(
				/^!\[([^\]]*)\]\(asset:([^)]+)\)(?:\s*\{\s*width\s*=\s*(\d+)\s*\})?\s*$/gm,
				(_match, alt: string, assetId: string, width?: string) =>
					buildAssetPlaceholderHtml(assetId, alt, width ? Number(width) : IMAGE_BLOCK_DEFAULT_WIDTH)
			);

	const ASSET_MARKDOWN_PATTERN = /!\[[^\]]*]\(asset:[^)]+\)/;

	const hasMarkdownContent = (source: string) => {
		const raw = source || '';
		if (ASSET_MARKDOWN_PATTERN.test(raw)) return true;
		return preprocessMarkdownForEditor(raw).trim().length > 0;
	};

	const serializeEditorMarkdown = (target: Editor) => {
		const markdown = target.getMarkdown();
		if (markdown.trim()) return markdown;

		const assetBlocks: string[] = [];
		target.state.doc.forEach((node) => {
			if (node.type.name !== 'assetImage') return;
			assetBlocks.push(
				buildAssetMarkdown(node.attrs.assetId || '', node.attrs.alt || '', {
					width: clampImageWidth(node.attrs.width)
				})
			);
		});
		return assetBlocks.length ? assetBlocks.join('\n\n') : markdown;
	};

	const normalizeAssetImageEditingSurfaces = (
		target: Editor,
		options: { emitChange?: boolean } = { emitChange: true }
	) => {
		if (!ensureWritableSurfacesAroundAssetImages(target)) return;
		if (options.emitChange) queueChange('command');
	};

	const applyEditorContent = (target: Editor, source: string) => {
		if (!hasMarkdownContent(source)) {
			target.commands.setContent(EMPTY_EDITOR_DOC, { emitUpdate: false });
			return;
		}

		target.commands.setContent(preprocessMarkdownForEditor(source), {
			contentType: 'markdown',
			emitUpdate: false
		});
		normalizeAssetImageEditingSurfaces(target, { emitChange: false });
	};

	type MenuRendererOptions<T extends MenuRenderableItem> = {
		pluginKey: PluginKey;
		getRoot: () => HTMLElement | null;
		getTitle: () => string;
		getBadge: (item: T) => string;
		getExtraHtml?: (item: T) => string;
	};

	const createSuggestionMenuRenderer =
		<T extends MenuRenderableItem>(options: MenuRendererOptions<T>) =>
		() => {
			let popup: HTMLDivElement | null = null;
			let props: SuggestionProps<T, T> | null = null;
			let highlightedIndex = 0;
			let removePositionListeners = () => {};

			const cleanup = () => {
				removePositionListeners();
				removePositionListeners = () => {};
				popup?.remove();
				popup = null;
				props = null;
				highlightedIndex = 0;
			};

			const updatePosition = () => {
				if (!popup || !props) return;
				const root = options.getRoot();
				const rect = props.clientRect?.();
				if (!root || !rect) return;
				const rootRect = root.getBoundingClientRect();
				popup.style.top = `${Math.max(0, rect.bottom - rootRect.top + 8)}px`;
			};

			const render = () => {
				if (!popup || !props) return;
				const items = props.items || [];
				if (!items.length) {
					cleanup();
					return;
				}

				highlightedIndex = Math.min(highlightedIndex, items.length - 1);
				popup.innerHTML = `
				<div class="markdown-editor__menu-panel">
					<div class="markdown-editor__menu-title">${escapeHtml(options.getTitle())}</div>
					<div class="markdown-editor__menu-list">
						${items
							.map(
								(item, index) => `
									<button
										type="button"
										class="markdown-editor__menu-item${index === highlightedIndex ? ' is-active' : ''}"
										data-menu-index="${index}"
									>
										<span class="markdown-editor__menu-copy">
											<span class="markdown-editor__menu-label">${escapeHtml(item.label)}</span>
											${
												item.description
													? `<span class="markdown-editor__menu-description">${escapeHtml(item.description)}</span>`
													: ''
											}
											${options.getExtraHtml ? options.getExtraHtml(item) : ''}
										</span>
										<span class="markdown-editor__menu-badge">${escapeHtml(options.getBadge(item))}</span>
									</button>
								`
							)
							.join('')}
					</div>
				</div>
			`;

				popup.querySelectorAll<HTMLButtonElement>('[data-menu-index]').forEach((button) => {
					button.addEventListener('mousedown', (event) => {
						event.preventDefault();
					});
					button.addEventListener('click', () => {
						const index = Number(button.dataset.menuIndex || 0);
						const item = items[index];
						if (!item) return;
						props?.command(item);
					});
				});

				updatePosition();
			};

			return {
				onStart(nextProps: SuggestionProps<T, T>) {
					const root = options.getRoot();
					if (!root || !nextProps.items.length) return;
					cleanup();
					props = nextProps;
					popup = document.createElement('div');
					popup.className = 'markdown-editor__menu';
					root.appendChild(popup);
					const handlePositionChange = () => updatePosition();
					window.addEventListener('resize', handlePositionChange);
					window.addEventListener('scroll', handlePositionChange, true);
					removePositionListeners = () => {
						window.removeEventListener('resize', handlePositionChange);
						window.removeEventListener('scroll', handlePositionChange, true);
					};
					render();
				},
				onUpdate(nextProps: SuggestionProps<T, T>) {
					props = nextProps;
					render();
				},
				onKeyDown({ event, view }: { event: KeyboardEvent; view: Editor['view'] }) {
					if (!props || !props.items.length) return false;
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						highlightedIndex = (highlightedIndex + 1) % props.items.length;
						render();
						return true;
					}
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						highlightedIndex = (highlightedIndex - 1 + props.items.length) % props.items.length;
						render();
						return true;
					}
					if (event.key === 'Enter' || event.key === 'Tab') {
						event.preventDefault();
						const item = props.items[highlightedIndex];
						if (item) props.command(item);
						return true;
					}
					if (event.key === 'Escape') {
						event.preventDefault();
						exitSuggestion(view, options.pluginKey);
						return true;
					}
					return false;
				},
				onExit() {
					cleanup();
				}
			};
		};

	let editor: Editor | null = null;
	let editorRoot: HTMLDivElement | null = null;
	let editorElement: HTMLDivElement | null = null;
	let imageInput: HTMLInputElement | null = null;
	let editorValue = value;
	let editorNotice = '';
	let pendingImageInsertPos: number | null = null;
	let syncingFromValue = false;
	let pendingChange: {
		reason?: ChangeReason;
		immediate?: boolean;
	} | null = null;
	let blockHandleButton: HTMLButtonElement | null = null;
	let blockMenuElement: HTMLDivElement | null = null;
	let hoveredBlock: TopLevelBlock | null = null;
	let focusedBlock: TopLevelBlock | null = null;
	let activeBlock: TopLevelBlock | null = null;
	let blockHandleTop = 0;
	let blockHandleVisible = false;
	let blockMenuOpen = false;
	let refMenuOpen: {
		kind: TaskReferenceOption['kind'];
		id: string;
		label: string;
		x: number;
		y: number;
	} | null = null;
	let blockMenuAnchor: DOMRect | null = null;
	let blockMenuStyle = '';
	let draggingBlock: {
		pointerId: number;
		sourceIndex: number;
		dropIndex: number;
		y: number;
		started: boolean;
	} | null = null;
	let dropIndicatorTop: number | null = null;
	let suppressNextBlockMenuOpen = false;
	let cleanupBlockDrag = () => {};

	$: referenceLookup = Object.fromEntries(
		referenceOptions.map((reference) => [getReferenceKey(reference.kind, reference.id), reference])
	) as Record<string, TaskReferenceOption>;
	$: isPageBlockHandleMode = blockHandleMode === 'page';
	$: activeBlockIndex =
		draggingBlock?.sourceIndex ??
		(blockMenuOpen
			? (activeBlock?.index ?? null)
			: (hoveredBlock?.index ?? focusedBlock?.index ?? null));
	$: canTransformActiveBlock = activeBlock?.node.type.name !== 'assetImage';
	$: visibleBlockTransformActions = canTransformActiveBlock
		? blockMenuActions.filter((action) => action.kind === 'transform')
		: [];
	$: visibleBlockEditActions = blockMenuActions.filter((action) => action.kind === 'action');

	const queueChange = (reason?: ChangeReason, immediate = false) => {
		pendingChange = { reason, immediate };
	};

	const flushEditorChange = (
		options: { immediate?: boolean; reason?: ChangeReason } = {},
		force = false
	) => {
		if (!editor) return;
		const nextValue = serializeEditorMarkdown(editor);
		if (!force && nextValue === editorValue) return;
		editorValue = nextValue;
		onChange(nextValue, options);
	};

	const assetViewRenderers = new Set<() => void>();

	const refreshEditorViews = () => {
		for (const render of assetViewRenderers) render();
	};

	const closeBlockMenu = () => {
		blockMenuOpen = false;
		blockMenuAnchor = null;
		blockMenuStyle = '';
	};

	const closeRefMenu = () => {
		refMenuOpen = null;
	};

	const resolveRefMenuReference = (): TaskReferenceOption | null => {
		if (!refMenuOpen) return null;
		return (
			referenceLookup[getReferenceKey(refMenuOpen.kind, refMenuOpen.id)] || {
				kind: refMenuOpen.kind,
				id: refMenuOpen.id,
				label: refMenuOpen.label,
				searchText: refMenuOpen.label
			}
		);
	};

	const syncBlockMenuPosition = async () => {
		if (!blockMenuOpen || !blockMenuAnchor || !blockMenuElement) return;
		await tick();
		if (!blockMenuElement || !blockMenuAnchor) return;
		const padding = 14;
		const menuRect = blockMenuElement.getBoundingClientRect();
		const prefersRight = blockMenuAnchor.right + 12 + menuRect.width <= window.innerWidth - padding;
		const left = prefersRight
			? blockMenuAnchor.right + 12
			: Math.max(padding, blockMenuAnchor.left - menuRect.width - 12);
		const top = Math.max(
			padding,
			Math.min(blockMenuAnchor.top - 12, window.innerHeight - menuRect.height - padding)
		);
		blockMenuStyle = `left:${left}px;top:${top}px;`;
	};

	const syncBlockHandlePosition = async () => {
		if (!editor || !editorRoot || disabled || !isPageBlockHandleMode || activeBlockIndex === null) {
			blockHandleVisible = false;
			dropIndicatorTop = draggingBlock ? dropIndicatorTop : null;
			if (!draggingBlock) {
				activeBlock = null;
			}
			return;
		}

		const nextActiveBlock = getTopLevelBlockByIndex(editor.state.doc, activeBlockIndex);
		if (!nextActiveBlock) {
			blockHandleVisible = false;
			activeBlock = null;
			closeBlockMenu();
			return;
		}

		const blockDom = getTopLevelBlockDom(editor.view, nextActiveBlock);
		if (!blockDom) {
			blockHandleVisible = false;
			return;
		}

		activeBlock = nextActiveBlock;
		const rootRect = editorRoot.getBoundingClientRect();
		const blockRect = blockDom.getBoundingClientRect();
		blockHandleTop =
			blockRect.top - rootRect.top + Math.min(18, Math.max(14, blockRect.height / 2));
		blockHandleVisible = true;

		if (blockMenuOpen && blockHandleButton) {
			blockMenuAnchor = blockHandleButton.getBoundingClientRect();
			await syncBlockMenuPosition();
		}
	};

	const resolveDropIndexFromPointer = (pointerY: number) => {
		if (!editor) return 0;
		const blocks = getTopLevelBlocks(editor.state.doc);
		for (const block of blocks) {
			const blockDom = getTopLevelBlockDom(editor.view, block);
			if (!blockDom) continue;
			const rect = blockDom.getBoundingClientRect();
			if (pointerY < rect.top + rect.height / 2) {
				return block.index;
			}
		}
		return blocks.length;
	};

	const syncDropIndicator = () => {
		if (!editorRoot || !editor || !draggingBlock) {
			dropIndicatorTop = null;
			return;
		}

		const blocks = getTopLevelBlocks(editor.state.doc);
		const rootRect = editorRoot.getBoundingClientRect();
		const normalizedIndex = Math.max(0, Math.min(blocks.length, draggingBlock.dropIndex));

		if (!blocks.length) {
			dropIndicatorTop = 8;
			return;
		}

		if (normalizedIndex <= 0) {
			const firstDom = getTopLevelBlockDom(editor.view, blocks[0]);
			dropIndicatorTop = firstDom ? firstDom.getBoundingClientRect().top - rootRect.top : 0;
			return;
		}

		if (normalizedIndex >= blocks.length) {
			const lastDom = getTopLevelBlockDom(editor.view, blocks[blocks.length - 1]);
			dropIndicatorTop = lastDom ? lastDom.getBoundingClientRect().bottom - rootRect.top : null;
			return;
		}

		const nextDom = getTopLevelBlockDom(editor.view, blocks[normalizedIndex]);
		dropIndicatorTop = nextDom ? nextDom.getBoundingClientRect().top - rootRect.top : null;
	};

	const applyBlockMenuAction = (action: BlockMenuAction) => {
		if (!editor || activeBlockIndex === null) return;

		let changed = false;
		queueChange('command');

		if (action.kind === 'transform') {
			changed = transformTopLevelNode(editor, activeBlockIndex, action.id);
		} else {
			switch (action.id) {
				case 'insert-above':
					changed = insertParagraphNearTopLevelNode(editor, activeBlockIndex, 'above');
					break;
				case 'insert-below':
					changed = insertParagraphNearTopLevelNode(editor, activeBlockIndex, 'below');
					break;
				case 'duplicate':
					changed = duplicateTopLevelNode(editor, activeBlockIndex);
					break;
				case 'delete':
					changed = deleteTopLevelNode(editor, activeBlockIndex);
					break;
			}
		}

		if (!changed) {
			pendingChange = null;
			return;
		}
		closeBlockMenu();
		void syncBlockHandlePosition();
		editor.commands.focus();
	};

	const startBlockDrag = (event: PointerEvent) => {
		if (!editor || !activeBlock || disabled) return;
		const currentEditor = editor;
		event.stopPropagation();
		closeBlockMenu();

		const pointerId = event.pointerId;
		const sourceIndex = activeBlock.index;
		const handleTarget = event.currentTarget as HTMLElement | null;
		handleTarget?.setPointerCapture?.(pointerId);

		draggingBlock = {
			pointerId,
			sourceIndex,
			dropIndex: sourceIndex,
			y: event.clientY,
			started: false
		};
		syncDropIndicator();

		const handlePointerMove = (nextEvent: PointerEvent) => {
			if (!draggingBlock || nextEvent.pointerId !== pointerId) return;
			const movedDistance = Math.abs(nextEvent.clientY - event.clientY);
			draggingBlock = {
				...draggingBlock,
				y: nextEvent.clientY,
				started: draggingBlock.started || movedDistance > 4,
				dropIndex: resolveDropIndexFromPointer(nextEvent.clientY)
			};
			syncDropIndicator();
		};

		const finishDrag = (nextEvent?: PointerEvent) => {
			if (!draggingBlock || (nextEvent && nextEvent.pointerId !== pointerId)) return;
			const finalDrag = draggingBlock;
			dropIndicatorTop = null;
			draggingBlock = null;
			cleanupBlockDrag();
			handleTarget?.releasePointerCapture?.(pointerId);
			if (!finalDrag.started) {
				void syncBlockHandlePosition();
				return;
			}
			suppressNextBlockMenuOpen = true;
			queueChange('command');
			const changed = moveTopLevelNode(currentEditor, finalDrag.sourceIndex, finalDrag.dropIndex);
			if (!changed) {
				pendingChange = null;
			}
			void syncBlockHandlePosition();
			currentEditor.commands.focus();
		};

		const handlePointerUp = (nextEvent: PointerEvent) => finishDrag(nextEvent);
		const handlePointerCancel = (nextEvent: PointerEvent) => finishDrag(nextEvent);

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerCancel);
		cleanupBlockDrag = () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointercancel', handlePointerCancel);
			cleanupBlockDrag = () => {};
		};
	};

	const openBlockMenu = async () => {
		if (suppressNextBlockMenuOpen) {
			suppressNextBlockMenuOpen = false;
			return;
		}
		if (!blockHandleButton || !activeBlock) return;
		blockMenuOpen = true;
		blockMenuAnchor = blockHandleButton.getBoundingClientRect();
		await syncBlockMenuPosition();
	};

	const getBlockTypeLabel = (block: TopLevelBlock | null) => {
		switch (block?.node.type.name) {
			case 'heading':
				return `Heading ${block.node.attrs.level || 1}`;
			case 'bulletList':
				return 'Bullet list';
			case 'taskList':
				return 'Checklist';
			case 'blockquote':
				return 'Quote';
			case 'codeBlock':
				return 'Code block';
			case 'horizontalRule':
				return 'Divider';
			case 'assetImage':
				return 'Image';
			default:
				return 'Paragraph';
		}
	};

	const getImageInsertPosition = () => {
		if (!editor) return null;
		if (typeof pendingImageInsertPos === 'number') {
			return pendingImageInsertPos;
		}
		return editor.state.selection.from;
	};

	const findAssetNodes = (assetId: string) => {
		if (!editor) return [];
		const matches: Array<{ from: number; to: number }> = [];
		editor.state.doc.descendants((node, pos) => {
			if (node.type.name !== 'assetImage' || node.attrs.assetId !== assetId) return;
			matches.push({
				from: pos,
				to: pos + node.nodeSize
			});
		});
		return matches;
	};

	const removeAssetNodes = (
		assetIds: string[],
		options: { immediate?: boolean; reason?: ChangeReason } = {}
	) => {
		if (!editor || !assetIds.length) return;
		const matches = assetIds
			.flatMap((assetId) => findAssetNodes(assetId))
			.sort((left, right) => right.from - left.from);
		if (!matches.length) return;
		let transaction = editor.state.tr;
		for (const match of matches) {
			transaction = transaction.delete(match.from, match.to);
		}
		queueChange(options.reason, options.immediate);
		editor.view.dispatch(transaction);
	};

	const replaceAssetNodeIds = (
		replacements: Array<{ from: string; to: string }>,
		options: { immediate?: boolean; reason?: ChangeReason } = {}
	) => {
		if (!editor || !replacements.length) return;
		const replacementMap = new Map(replacements.map((entry) => [entry.from, entry.to]));
		let transaction = editor.state.tr;
		let changed = false;

		editor.state.doc.descendants((node, pos) => {
			if (node.type.name !== 'assetImage') return;
			const nextAssetId = replacementMap.get(node.attrs.assetId);
			if (!nextAssetId) return;
			transaction = transaction.setNodeMarkup(pos, node.type, {
				...node.attrs,
				assetId: nextAssetId
			});
			changed = true;
		});

		if (!changed) return;
		queueChange(options.reason, options.immediate);
		editor.view.dispatch(transaction);
	};

	const handleCopyAsset = async (assetId: string) => {
		const assetUrl = assetUrls[assetId];
		if (!assetUrl) {
			editorNotice = 'Image is still loading. Please try again.';
			return;
		}
		if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
			editorNotice = 'Image copy is not supported in this browser.';
			return;
		}

		try {
			const response = await fetch(assetUrl);
			if (!response.ok) {
				throw new Error('Unable to read image data for copying.');
			}
			const blob = await response.blob();
			const mimeType = blob.type || 'image/png';
			await navigator.clipboard.write([
				new ClipboardItem({
					[mimeType]: blob
				})
			]);
			editorNotice = 'Image copied.';
		} catch (error) {
			editorNotice = error instanceof Error ? error.message : 'Unable to copy image.';
		}
	};

	const handleOpenAsset = (assetId: string) => {
		const assetUrl = assetUrls[assetId];
		if (!assetUrl) {
			editorNotice = 'Image is still loading. Please try again.';
			return;
		}
		window.open(assetUrl, '_blank', 'noopener,noreferrer');
	};

	const handleDeleteAsset = async (assetId: string) => {
		editorNotice = '';
		if (onEmbedDelete) {
			try {
				await onEmbedDelete(assetId);
				return;
			} catch (error) {
				editorNotice = error instanceof Error ? error.message : 'Unable to remove image block.';
				return;
			}
		}

		removeAssetNodes([assetId], {
			immediate: true,
			reason: 'command'
		});
	};

	const handleAddAssetToChat = async (assetId: string) => {
		if (!onEmbedAddToChat) return;
		editorNotice = '';
		try {
			await onEmbedAddToChat(assetId);
			editorNotice = 'Image added to chat.';
		} catch (error) {
			editorNotice = error instanceof Error ? error.message : 'Unable to add image to chat.';
		}
	};

	const applySlashCommandToEditor = (
		targetEditor: Editor,
		range: { from: number; to: number },
		commandId: Exclude<SlashCommandId, 'image'>
	) => {
		queueChange('command');
		switch (commandId) {
			case 'paragraph':
				targetEditor.chain().focus().deleteRange(range).setParagraph().run();
				return;
			case 'page':
			case 'heading-1':
				targetEditor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
				return;
			case 'heading-2':
				targetEditor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
				return;
			case 'heading-3':
				targetEditor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
				return;
			case 'bullet-list':
				targetEditor.chain().focus().deleteRange(range).toggleBulletList().run();
				return;
			case 'checklist':
				targetEditor.chain().focus().deleteRange(range).toggleTaskList().run();
				return;
			case 'quote':
				targetEditor.chain().focus().deleteRange(range).toggleBlockquote().run();
				return;
			case 'code-block':
				targetEditor.chain().focus().deleteRange(range).setCodeBlock().run();
				return;
			case 'divider':
				targetEditor
					.chain()
					.focus()
					.deleteRange(range)
					.setHorizontalRule()
					.createParagraphNear()
					.run();
		}
	};

	const handleImageFiles = async (files: File[], source: ImageUploadSource) => {
		const imageFiles = files.filter((file) => file.type.startsWith('image/'));
		if (!editor || !imageFiles.length || disabled) return;

		editorNotice = '';
		const uploadRequests = imageFiles.map((file) => ({
			tempId: createId(),
			file,
			source
		}));
		const insertPosition = getImageInsertPosition();
		pendingImageInsertPos = null;
		if (insertPosition === null) return;

		queueChange('upload');
		editor
			.chain()
			.focus()
			.insertContentAt(
				insertPosition,
				uploadRequests.map((request) => ({
					type: 'assetImage',
					attrs: {
						assetId: `pending:${request.tempId}`,
						alt: request.file.name || 'Image',
						width: IMAGE_BLOCK_DEFAULT_WIDTH
					}
				}))
			)
			.run();
		normalizeAssetImageEditingSurfaces(editor);
		const imageBlockIndex = getTopLevelBlocks(editor.state.doc).findIndex(
			(block) => block.node.type.name === 'assetImage'
		);
		if (imageBlockIndex >= 0) {
			focusWritableSurfaceBesideBlock(editor, imageBlockIndex, 'below');
		}

		let uploadResults: ImageUploadResult[];
		try {
			uploadResults = await onImageUpload(uploadRequests);
		} catch (error) {
			editorNotice =
				error instanceof Error ? error.message : 'Image upload failed. Please try again.';
			removeAssetNodes(
				uploadRequests.map((request) => `pending:${request.tempId}`),
				{
					immediate: true,
					reason: 'upload'
				}
			);
			return;
		}

		const replacements: Array<{ from: string; to: string }> = [];
		const failedAssetIds: string[] = [];
		const failedMessages: string[] = [];

		for (const result of uploadResults) {
			if (result.assetId) {
				replacements.push({
					from: `pending:${result.tempId}`,
					to: result.assetId
				});
				continue;
			}

			failedAssetIds.push(`pending:${result.tempId}`);
			failedMessages.push(result.error || 'Image upload failed.');
		}

		if (replacements.length) {
			replaceAssetNodeIds(replacements, {
				immediate: true,
				reason: 'upload'
			});
		}

		if (failedAssetIds.length) {
			removeAssetNodes(failedAssetIds, {
				immediate: true,
				reason: 'upload'
			});
		}

		editorNotice = failedMessages[0] || '';
	};

	const createReferenceNode = () =>
		Node.create({
			name: 'referenceChip',
			group: 'inline',
			inline: true,
			atom: true,
			selectable: false,
			addAttributes() {
				return {
					kind: {
						default: 'task'
					},
					id: {
						default: ''
					},
					label: {
						default: ''
					}
				};
			},
			parseHTML() {
				return [
					{
						tag: 'kainbu-reference',
						getAttrs: (element) => {
							if (!(element instanceof HTMLElement)) return false;
							return {
								kind: element.dataset.kind || 'task',
								id: element.dataset.id || '',
								label: element.dataset.label || ''
							};
						}
					},
					{
						tag: 'span.kainbu-ref-chip[data-ref-kind][data-ref-id]',
						getAttrs: (element) => {
							if (!(element instanceof HTMLElement)) return false;
							return {
								kind: element.dataset.refKind || 'task',
								id: element.dataset.refId || '',
								label:
									element.querySelector('.kainbu-ref-chip__label')?.textContent?.trim() ||
									element.textContent?.trim() ||
									''
							};
						}
					}
				];
			},
			renderHTML({ HTMLAttributes }) {
				return [
					'kainbu-reference',
					{
						'data-kind': HTMLAttributes.kind,
						'data-id': HTMLAttributes.id,
						'data-label': HTMLAttributes.label
					}
				];
			},
			renderText({ node }) {
				return node.attrs.label || '';
			},
			renderMarkdown(node) {
				const attrs = (node.attrs || {}) as {
					kind?: TaskReferenceOption['kind'];
					id?: string;
					label?: string;
				};
				return buildReferenceMarkdown({
					kind: attrs.kind || 'task',
					id: attrs.id || '',
					label: attrs.label || '',
					searchText: attrs.label || ''
				});
			},
			addNodeView() {
				return (props: NodeViewRendererProps) => {
					let currentNode = props.node;
					const dom = document.createElement('span');
					dom.className = 'markdown-editor__reference';
					dom.contentEditable = 'false';

					const render = () => {
						dom.innerHTML = renderReferenceChipHtml(
							{
								kind: currentNode.attrs.kind,
								id: currentNode.attrs.id,
								label: currentNode.attrs.label
							},
							referenceLookup
						);
					};

					dom.addEventListener('mousedown', (event) => {
						if (event.button === 2) return;
						event.preventDefault();
						event.stopPropagation();
						const reference =
							referenceLookup[getReferenceKey(currentNode.attrs.kind, currentNode.attrs.id)] ||
							({
								kind: currentNode.attrs.kind,
								id: currentNode.attrs.id,
								label: currentNode.attrs.label,
								searchText: currentNode.attrs.label
							} satisfies TaskReferenceOption);
						onReferenceNavigate?.(reference);
					});

					dom.addEventListener('contextmenu', (event) => {
						event.preventDefault();
						event.stopPropagation();
						refMenuOpen = {
							kind: currentNode.attrs.kind,
							id: currentNode.attrs.id,
							label: currentNode.attrs.label,
							x: event.clientX,
							y: event.clientY
						};
					});

					render();

					return {
						dom,
						update(updatedNode) {
							if (updatedNode.type.name !== 'referenceChip') return false;
							currentNode = updatedNode;
							render();
							return true;
						},
						stopEvent() {
							return true;
						},
						ignoreMutation() {
							return true;
						}
					};
				};
			},
			addProseMirrorPlugins() {
				return [
					Suggestion<TaskReferenceOption, TaskReferenceOption>({
						editor: this.editor,
						pluginKey: REFERENCE_SUGGESTION_KEY,
						char: '@',
						allowedPrefixes: [null, ' ', '(', '[', '{', '>'] as any,
						items: ({ query }) =>
							referenceOptions.filter((reference) =>
								reference.searchText.toLowerCase().includes(query.toLowerCase())
							),
						command: ({ editor: targetEditor, range, props }) => {
							queueChange('mention');
							targetEditor
								.chain()
								.focus()
								.insertContentAt(range, [
									{
										type: 'referenceChip',
										attrs: {
											kind: props.kind,
											id: props.id,
											label: props.label
										}
									},
									{
										type: 'text',
										text: ' '
									}
								])
								.run();
						},
						render: createSuggestionMenuRenderer<TaskReferenceOption>({
							pluginKey: REFERENCE_SUGGESTION_KEY,
							getRoot: () => editorRoot,
							getTitle: () => 'References',
							getBadge: (item) => item.kind,
							getExtraHtml: (item) => {
								if (item.kind !== 'task' || !item.tags?.length) return '';
								return `<span class="markdown-editor__menu-tags">${item.tags
									.slice(0, 3)
									.map(
										(tag) =>
											`<span class="markdown-editor__menu-tag">${escapeHtml(tag.label)}</span>`
									)
									.join('')}${
									item.tags.length > 3
										? `<span class="markdown-editor__menu-more">+${item.tags.length - 3}</span>`
										: ''
								}</span>`;
							}
						})
					})
				];
			}
		});

	const createAssetNode = () =>
		Node.create({
			name: 'assetImage',
			group: 'block',
			atom: true,
			draggable: false,
			selectable: true,
			addAttributes() {
				return {
					assetId: {
						default: ''
					},
					alt: {
						default: ''
					},
					width: {
						default: IMAGE_BLOCK_DEFAULT_WIDTH
					}
				};
			},
			parseHTML() {
				return [
					{
						tag: 'kainbu-asset',
						getAttrs: (element) => {
							if (!(element instanceof HTMLElement)) return false;
							return {
								assetId: element.dataset.assetId || '',
								alt: element.dataset.alt || '',
								width: element.dataset.width
									? Number(element.dataset.width)
									: IMAGE_BLOCK_DEFAULT_WIDTH
							};
						}
					}
				];
			},
			renderHTML({ HTMLAttributes }) {
				return [
					'kainbu-asset',
					{
						'data-asset-id': HTMLAttributes.assetId,
						'data-alt': HTMLAttributes.alt,
						'data-width': clampImageWidth(HTMLAttributes.width)
					}
				];
			},
			renderMarkdown(node) {
				const attrs = (node.attrs || {}) as {
					assetId?: string;
					alt?: string;
					width?: number;
				};
				return buildAssetMarkdown(attrs.assetId || '', attrs.alt || '', {
					width: clampImageWidth(attrs.width)
				});
			},
			addNodeView() {
				return (props: NodeViewRendererProps) => {
					let currentNode = props.node;
					let selected = false;
					let stopResize: (() => void) | null = null;
					const dom = document.createElement('div');
					const wrapper = document.createElement('div');

					dom.className = 'markdown-editor__asset-block';
					dom.contentEditable = 'false';
					dom.appendChild(wrapper);

					const createIconButton = (label: string, icon: string, extraClass = '') => {
						const button = document.createElement('button');
						button.type = 'button';
						button.className = `markdown-editor__asset-button${extraClass ? ` ${extraClass}` : ''}`;
						button.dataset.kainbuControl = 'true';
						button.title = label;
						button.innerHTML = icon;
						return button;
					};

					const clearResize = () => {
						stopResize?.();
						stopResize = null;
					};

					const updateNodeAttributes = (nextAttrs: Record<string, unknown>) => {
						const position = props.getPos();
						if (typeof position !== 'number') return;
						const transaction = props.view.state.tr.setNodeMarkup(position, undefined, {
							...currentNode.attrs,
							...nextAttrs
						});
						props.view.dispatch(transaction);
					};

					const startResize = (edge: 'left' | 'right', event: PointerEvent) => {
						event.preventDefault();
						event.stopPropagation();
						const startX = event.clientX;
						const startWidth = clampImageWidth(currentNode.attrs.width);

						const handlePointerMove = (nextEvent: PointerEvent) => {
							const delta =
								edge === 'right' ? nextEvent.clientX - startX : startX - nextEvent.clientX;
							queueChange('command');
							updateNodeAttributes({
								width: clampImageWidth(startWidth + delta)
							});
						};

						const handlePointerEnd = () => {
							window.removeEventListener('pointermove', handlePointerMove);
							window.removeEventListener('pointerup', handlePointerEnd);
							window.removeEventListener('pointercancel', handlePointerEnd);
							stopResize = null;
						};

						window.addEventListener('pointermove', handlePointerMove);
						window.addEventListener('pointerup', handlePointerEnd);
						window.addEventListener('pointercancel', handlePointerEnd);
						stopResize = handlePointerEnd;
					};

					const createResizeHandle = (edge: 'left' | 'right') => {
						const handle = document.createElement('button');
						handle.type = 'button';
						handle.className = `markdown-editor__asset-handle markdown-editor__asset-handle-${edge}`;
						handle.dataset.kainbuControl = 'true';
						handle.setAttribute(
							'aria-label',
							edge === 'left' ? 'Resize image narrower' : 'Resize image wider'
						);
						const inner = document.createElement('span');
						inner.className = 'markdown-editor__asset-handle-inner';
						handle.appendChild(inner);
						handle.addEventListener('pointerdown', (event) =>
							startResize(edge, event as PointerEvent)
						);
						return handle;
					};

					const render = () => {
						const assetId = currentNode.attrs.assetId;
						const assetUrl = assetUrls[assetId];
						const width = clampImageWidth(currentNode.attrs.width);
						wrapper.className = `markdown-editor__asset${selected ? ' is-selected' : ''}`;
						wrapper.style.width = `min(100%, ${width}px)`;
						wrapper.innerHTML = '';

						const frame = document.createElement('div');
						frame.className = 'markdown-editor__asset-frame';

						if (assetUrl) {
							const image = document.createElement('img');
							image.className = 'markdown-editor__asset-image';
							image.src = assetUrl;
							image.alt = currentNode.attrs.alt || '';
							image.draggable = false;
							frame.appendChild(image);
						} else {
							const loading = document.createElement('div');
							loading.className = 'markdown-editor__asset-loading';
							loading.textContent = 'Loading image…';
							frame.appendChild(loading);
						}

						wrapper.appendChild(frame);

						if (!selected) return;

						const outline = document.createElement('div');
						outline.className = 'markdown-editor__asset-outline';
						wrapper.appendChild(outline);

						const widthBadge = document.createElement('div');
						widthBadge.className = 'markdown-editor__asset-width';
						widthBadge.textContent = `${width} px`;
						wrapper.appendChild(widthBadge);

						const toolbar = document.createElement('div');
						toolbar.className = 'markdown-editor__asset-toolbar';
						const copyButton = createIconButton('Copy image', copySvg);
						copyButton.addEventListener('click', () => void handleCopyAsset(assetId));
						const openButton = createIconButton('Open full screen', openSvg);
						openButton.addEventListener('click', () => handleOpenAsset(assetId));
						const chatButton = createIconButton(
							'Add image to chat',
							chatSvg,
							!onEmbedAddToChat ? 'is-disabled' : ''
						);
						chatButton.disabled = !onEmbedAddToChat;
						chatButton.addEventListener('click', () => void handleAddAssetToChat(assetId));
						const deleteButton = createIconButton('Delete embedded image', trashSvg, 'is-danger');
						deleteButton.addEventListener('click', () => void handleDeleteAsset(assetId));
						toolbar.append(copyButton, openButton, chatButton, deleteButton);
						wrapper.appendChild(toolbar);

						wrapper.appendChild(createResizeHandle('left'));
						wrapper.appendChild(createResizeHandle('right'));

						const leftCorner = document.createElement('div');
						leftCorner.className =
							'markdown-editor__asset-corner markdown-editor__asset-corner-left';
						const rightCorner = document.createElement('div');
						rightCorner.className =
							'markdown-editor__asset-corner markdown-editor__asset-corner-right';
						wrapper.append(leftCorner, rightCorner);
					};

					dom.addEventListener('mousedown', (event) => {
						if ((event.target as HTMLElement | null)?.closest('[data-kainbu-control]')) return;
						const position = props.getPos();
						if (typeof position !== 'number') return;
						const block = findTopLevelBlockAtPos(props.view.state.doc, position);
						const rect = dom.getBoundingClientRect();
						const relativeY = event.clientY - rect.top;
						const topZone = Math.min(28, rect.height * 0.22);
						const bottomZone = Math.max(rect.height - 28, rect.height * 0.78);

						if (block && editor && relativeY < topZone) {
							event.preventDefault();
							queueChange('command');
							focusWritableSurfaceBesideBlock(editor, block.index, 'above');
							return;
						}

						if (block && editor && relativeY > bottomZone) {
							event.preventDefault();
							queueChange('command');
							focusWritableSurfaceBesideBlock(editor, block.index, 'below');
							return;
						}

						event.preventDefault();
						props.view.dispatch(
							props.view.state.tr.setSelection(NodeSelection.create(props.view.state.doc, position))
						);
					});

					assetViewRenderers.add(render);
					render();

					return {
						dom,
						update(updatedNode) {
							if (updatedNode.type.name !== 'assetImage') return false;
							currentNode = updatedNode;
							render();
							return true;
						},
						selectNode() {
							selected = true;
							render();
						},
						deselectNode() {
							selected = false;
							clearResize();
							render();
						},
						stopEvent(event) {
							return Boolean(
								(event.target as HTMLElement | null)?.closest('[data-kainbu-control]')
							);
						},
						ignoreMutation() {
							return true;
						},
						destroy() {
							assetViewRenderers.delete(render);
							clearResize();
						}
					};
				};
			}
		});

	const createAssetImageKeyboardExtension = () =>
		Extension.create({
			name: 'assetImageKeyboard',
			addKeyboardShortcuts() {
				const focusBesideSelectedImage = (side: 'above' | 'below') => {
					const { selection } = this.editor.state;
					if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'assetImage') {
						return false;
					}
					const block = findTopLevelBlockAtPos(this.editor.state.doc, selection.from);
					if (!block) return false;
					queueChange('command');
					return focusWritableSurfaceBesideBlock(this.editor, block.index, side);
				};

				return {
					ArrowUp: () => focusBesideSelectedImage('above'),
					ArrowDown: () => focusBesideSelectedImage('below'),
					Enter: () => focusBesideSelectedImage('below')
				};
			}
		});

	const createSlashCommands = () =>
		Extension.create({
			name: 'slashCommands',
			addProseMirrorPlugins() {
				return [
					Suggestion<SlashCommandOption, SlashCommandOption>({
						editor: this.editor,
						pluginKey: SLASH_SUGGESTION_KEY,
						char: '/',
						startOfLine: true,
						items: ({ query }) =>
							slashCommands.filter((command) =>
								[command.label, command.description, ...command.queryTokens]
									.join(' ')
									.toLowerCase()
									.includes(query.toLowerCase())
							),
						command: ({ editor: targetEditor, range, props }) => {
							if (props.id === 'image') {
								queueChange('command');
								targetEditor.chain().focus().deleteRange(range).run();
								pendingImageInsertPos = targetEditor.state.selection.from;
								imageInput?.click();
								return;
							}

							applySlashCommandToEditor(targetEditor, range, props.id);
						},
						render: createSuggestionMenuRenderer<SlashCommandOption>({
							pluginKey: SLASH_SUGGESTION_KEY,
							getRoot: () => editorRoot,
							getTitle: () => 'Commands',
							getBadge: () => 'block'
						})
					})
				];
			}
		});

	const createBlockHandleExtension = () =>
		Extension.create({
			name: 'pageBlockHandle',
			addProseMirrorPlugins() {
				return [
					createBlockHandleObserverPlugin({
						onHoverBlockChange: (block) => {
							hoveredBlock = block;
							if (!draggingBlock) {
								void syncBlockHandlePosition();
							}
						},
						onFocusBlockChange: (block) => {
							focusedBlock = block;
							void syncBlockHandlePosition();
						}
					})
				];
			}
		});

	const createEditor = () => {
		if (!editorElement) return null;

		const initialMarkdown = preprocessMarkdownForEditor(value || '');
		const hasContent = initialMarkdown.trim().length > 0;

		return new Editor({
			element: editorElement,
			content: hasContent ? initialMarkdown : EMPTY_EDITOR_DOC,
			...(hasContent ? { contentType: 'markdown' as const } : {}),
			editable: !disabled,
			injectCSS: false,
			extensions: [
				StarterKit.configure({
					dropcursor: false,
					codeBlock: false
				}),
				CodeBlockLowlight.configure({
					lowlight
				}),
				Markdown.configure({
					markedOptions: {
						breaks: true,
						gfm: true
					}
				}),
				Placeholder.configure({
					placeholder: () => placeholder || (isPageBlockHandleMode ? TRAILING_BLOCK_HINT : ''),
					emptyEditorClass: 'is-editor-empty',
					showOnlyCurrent: true,
					showOnlyWhenEditable: true,
					includeChildren: false
				}),
				TaskList,
				TaskItem.configure({
					nested: true
				}),
				Table.configure({
					resizable: true,
					allowTableNodeSelection: true
				}),
				TableRow,
				TableHeader,
				TableCell,
				Link.configure({
					openOnClick: false
				}),
				Image,
				createReferenceNode(),
				createAssetNode(),
				createAssetImageKeyboardExtension(),
				createSlashCommands(),
				...(isPageBlockHandleMode ? [createBlockHandleExtension()] : [])
			],
			editorProps: {
				attributes: {
					class:
						'markdown-editor__prosemirror kainbu-prose task-editor-prose block-editor-prose text-sm'
				},
				handlePaste: (_view, event) => {
					const imageFiles = Array.from(event.clipboardData?.items || [])
						.filter((item) => item.type.startsWith('image/'))
						.map((item) => item.getAsFile())
						.filter((file): file is File => Boolean(file));

					if (!imageFiles.length || disabled) {
						return false;
					}

					event.preventDefault();
					void handleImageFiles(imageFiles, 'paste');
					return true;
				}
			},
			onCreate: ({ editor: nextEditor }) => {
				normalizeAssetImageEditingSurfaces(nextEditor, { emitChange: false });
				editorValue = serializeEditorMarkdown(nextEditor);
				void syncBlockHandlePosition();
			},
			onUpdate: () => {
				if (syncingFromValue) return;
				const nextPendingChange = pendingChange || { reason: 'typing' as const };
				pendingChange = null;
				flushEditorChange(nextPendingChange);
				void syncBlockHandlePosition();
				syncDropIndicator();
			},
			onBlur: () => {
				pendingChange = null;
				flushEditorChange(
					{
						immediate: true,
						reason: 'blur'
					},
					true
				);
			}
		});
	};

	onMount(() => {
		editor = createEditor();
		const handleLayoutChange = () => {
			void syncBlockHandlePosition();
			void syncBlockMenuPosition();
			syncDropIndicator();
		};
		const handlePointerDown = (event: PointerEvent) => {
			if (!blockMenuOpen) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest('.markdown-editor__block-menu')) return;
			if (target?.closest('.markdown-editor__block-handle-button')) return;
			closeBlockMenu();
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && blockMenuOpen) {
				event.preventDefault();
				closeBlockMenu();
				void syncBlockHandlePosition();
			}
		};
		window.addEventListener('resize', handleLayoutChange);
		window.addEventListener('scroll', handleLayoutChange, true);
		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			cleanupBlockDrag();
			window.removeEventListener('resize', handleLayoutChange);
			window.removeEventListener('scroll', handleLayoutChange, true);
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown);
			editor?.destroy();
			editor = null;
			assetViewRenderers.clear();
		};
	});

	onDestroy(() => {
		cleanupBlockDrag();
		editor?.destroy();
		editor = null;
		assetViewRenderers.clear();
	});

	$: if (editor && value !== editorValue) {
		syncingFromValue = true;
		editorValue = value;
		applyEditorContent(editor, value);
		syncingFromValue = false;
	}

	$: if (editor) {
		editor.setEditable(!disabled, false);
	}

	$: if (editor) {
		assetUrls;
		referenceOptions;
		onReferenceNavigate;
		onEmbedAddToChat;
		refreshEditorViews();
	}

	$: if (editor) {
		activeBlockIndex;
		disabled;
		isPageBlockHandleMode;
		void syncBlockHandlePosition();
	}

	$: if (blockMenuOpen) {
		blockMenuElement;
		blockMenuAnchor;
		void syncBlockMenuPosition();
	}

	$: if (!isPageBlockHandleMode || disabled) {
		closeBlockMenu();
		cleanupBlockDrag();
		draggingBlock = null;
		dropIndicatorTop = null;
	}

	const handleImageInputChange = (event: Event) => {
		const files = Array.from((event.currentTarget as HTMLInputElement).files || []);
		(event.currentTarget as HTMLInputElement).value = '';
		void handleImageFiles(files, 'command');
	};
</script>

<div
	class="relative"
	class:markdown-editor--page={isPageBlockHandleMode}
	data-markdown-editor-root
	bind:this={editorRoot}
>
	<div class="markdown-editor__surface" class:has-block-handle={isPageBlockHandleMode}>
		<div bind:this={editorElement}></div>
	</div>

	{#if isPageBlockHandleMode && blockHandleVisible && activeBlock}
		<div
			class="markdown-editor__block-handle"
			style={`top:${blockHandleTop}px;`}
			data-dragging={draggingBlock ? 'true' : undefined}
		>
			<button
				bind:this={blockHandleButton}
				type="button"
				class="markdown-editor__block-handle-button"
				aria-label={`Open block controls for ${getBlockTypeLabel(activeBlock)}`}
				title={getBlockTypeLabel(activeBlock)}
				on:pointerdown={startBlockDrag}
				on:click|stopPropagation={() => void openBlockMenu()}
			>
				<svg viewBox="0 0 10 16" aria-hidden="true" width="10" height="16">
					<circle cx="2.5" cy="3" r="1.2" />
					<circle cx="2.5" cy="8" r="1.2" />
					<circle cx="2.5" cy="13" r="1.2" />
					<circle cx="7.5" cy="3" r="1.2" />
					<circle cx="7.5" cy="8" r="1.2" />
					<circle cx="7.5" cy="13" r="1.2" />
				</svg>
			</button>
		</div>
	{/if}

	{#if isPageBlockHandleMode && draggingBlock && dropIndicatorTop !== null}
		<div class="markdown-editor__block-drop" style={`top:${dropIndicatorTop}px;`}></div>
	{/if}

	{#if isPageBlockHandleMode && blockMenuOpen && activeBlock}
		<div bind:this={blockMenuElement} class="markdown-editor__block-menu" style={blockMenuStyle}>
			<div class="markdown-editor__block-menu-panel">
				<div class="markdown-editor__block-menu-list">
					{#each visibleBlockEditActions as action (action.id)}
						<button
							type="button"
							class="markdown-editor__block-menu-item"
							class:is-danger={action.id === 'delete'}
							on:click={() => applyBlockMenuAction(action)}
						>
							{action.label}
						</button>
					{/each}
				</div>

				{#if visibleBlockTransformActions.length}
					<div class="markdown-editor__block-menu-divider"></div>
					<div class="markdown-editor__block-menu-list">
						<div class="markdown-editor__block-menu-heading">Turn into</div>
						{#each visibleBlockTransformActions as action (action.id)}
							<button
								type="button"
								class="markdown-editor__block-menu-item"
								on:click={() => applyBlockMenuAction(action)}
							>
								{action.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if refMenuOpen}
		<div
			class="fixed inset-0 z-[200]"
			role="presentation"
			on:mousedown={closeRefMenu}
			on:contextmenu|preventDefault={closeRefMenu}
		>
			<div
				class="markdown-editor__block-menu"
				style={`top:${refMenuOpen.y}px; left:${refMenuOpen.x}px;`}
				on:mousedown|stopPropagation
				on:click|stopPropagation
			>
				<div class="markdown-editor__block-menu-panel">
					<div class="markdown-editor__block-menu-list">
						<button
							type="button"
							class="markdown-editor__block-menu-item"
							on:click={() => {
								const reference = resolveRefMenuReference();
								if (reference) onReferenceNavigate?.(reference);
								closeRefMenu();
							}}
						>
							Open linked item
						</button>
						{#if onReferencePromote && refMenuOpen.kind === 'task'}
							<button
								type="button"
								class="markdown-editor__block-menu-item"
								on:click={() => {
									const reference = resolveRefMenuReference();
									if (reference) onReferencePromote?.(reference);
									closeRefMenu();
								}}
							>
								Link explicitly
							</button>
						{/if}
						{#if onReferenceRemove}
							<button
								type="button"
								class="markdown-editor__block-menu-item is-danger"
								on:click={() => {
									const reference = resolveRefMenuReference();
									if (reference) onReferenceRemove?.(reference);
									closeRefMenu();
								}}
							>
								Remove reference
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if editorNotice}
		<p class="mt-2 text-xs text-rose-300">{editorNotice}</p>
	{/if}

	<input
		bind:this={imageInput}
		type="file"
		accept="image/*"
		class="hidden"
		on:change={handleImageInputChange}
	/>
</div>
