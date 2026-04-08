import type { Editor } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { SlashCommandId } from '$lib/kainbu/taskMarkdown';

export type BlockTransformId = Exclude<SlashCommandId, 'image'>;

export type TopLevelBlock = {
	index: number;
	from: number;
	to: number;
	node: ProseMirrorNode;
};

type BlockObserverCallbacks = {
	onHoverBlockChange: (block: TopLevelBlock | null) => void;
	onFocusBlockChange: (block: TopLevelBlock | null) => void;
};

export const BLOCK_HANDLE_PLUGIN_KEY = new PluginKey('kainbu-block-handle');

const findFirstTextblock = (node: ProseMirrorNode): ProseMirrorNode | null => {
	if (node.isTextblock) return node;
	for (let index = 0; index < node.childCount; index += 1) {
		const match = findFirstTextblock(node.child(index));
		if (match) return match;
	}
	return null;
};

const cloneNode = (node: ProseMirrorNode) => node.copy(node.content);

const createParagraphNode = (schema: Schema) =>
	schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();

const getInlineContentFromBlock = (block: TopLevelBlock) => {
	const textblock = findFirstTextblock(block.node);
	return textblock?.content.size ? textblock.content : null;
};

const buildParagraphLikeNode = (
	schema: Schema,
	type: 'paragraph' | 'heading',
	inlineContent: Fragment | null,
	attrs?: Record<string, unknown>
) => {
	const nodeType = schema.nodes[type];
	return nodeType.create(attrs ?? null, inlineContent && inlineContent.size ? inlineContent : undefined);
};

const buildListNode = (
	schema: Schema,
	type: 'bulletList' | 'taskList',
	inlineContent: Fragment | null
) => {
	const paragraph = schema.nodes.paragraph.create(
		null,
		inlineContent && inlineContent.size ? inlineContent : undefined
	);

	if (type === 'taskList') {
		return schema.nodes.taskList.create(null, [
			schema.nodes.taskItem.create({ checked: false }, [paragraph])
		]);
	}

	return schema.nodes.bulletList.create(null, [schema.nodes.listItem.create(null, [paragraph])]);
};

const buildCodeBlockNode = (schema: Schema, block: TopLevelBlock) => {
	const text = block.node.textContent;
	return schema.nodes.codeBlock.create(null, text ? schema.text(text) : undefined);
};

const buildBlockquoteNode = (schema: Schema, inlineContent: Fragment | null) =>
	schema.nodes.blockquote.create(null, [
		schema.nodes.paragraph.create(
			null,
			inlineContent && inlineContent.size ? inlineContent : undefined
		)
	]);

export const getTopLevelBlocks = (doc: ProseMirrorNode): TopLevelBlock[] => {
	const blocks: TopLevelBlock[] = [];
	doc.forEach((node, childOffset, index) => {
		blocks.push({
			index,
			from: childOffset,
			to: childOffset + node.nodeSize,
			node
		});
	});

	return blocks;
};

export const findTopLevelBlockAtPos = (doc: ProseMirrorNode, pos: number) => {
	const blocks = getTopLevelBlocks(doc);
	return (
		blocks.find(
			(block, index) =>
				pos >= block.from && (pos < block.to || (index === blocks.length - 1 && pos === block.to))
		) ?? null
	);
};

export const getTopLevelBlockByIndex = (doc: ProseMirrorNode, index: number) => {
	return getTopLevelBlocks(doc)[index] ?? null;
};

export const getTopLevelBlockDom = (view: EditorView, block: TopLevelBlock) => {
	const dom = view.nodeDOM(block.from);
	return dom instanceof HTMLElement ? dom : null;
};

export const createBlockHandleObserverPlugin = ({
	onHoverBlockChange,
	onFocusBlockChange
}: BlockObserverCallbacks) =>
	new Plugin({
		key: BLOCK_HANDLE_PLUGIN_KEY,
		view(view) {
			let hoveredBlock: TopLevelBlock | null = null;
			let focusedBlock: TopLevelBlock | null = findTopLevelBlockAtPos(
				view.state.doc,
				view.state.selection.from
			);

			onFocusBlockChange(focusedBlock);

			const updateHoveredBlock = (block: TopLevelBlock | null) => {
				if (
					hoveredBlock?.index === block?.index &&
					hoveredBlock?.from === block?.from &&
					hoveredBlock?.to === block?.to
				) {
					return;
				}
				hoveredBlock = block;
				onHoverBlockChange(block);
			};

			const updateFocusedBlock = () => {
				const nextFocusedBlock = findTopLevelBlockAtPos(view.state.doc, view.state.selection.from);
				if (
					focusedBlock?.index === nextFocusedBlock?.index &&
					focusedBlock?.from === nextFocusedBlock?.from &&
					focusedBlock?.to === nextFocusedBlock?.to
				) {
					return;
				}
				focusedBlock = nextFocusedBlock;
				onFocusBlockChange(nextFocusedBlock);
			};

			const resolveBlockFromTarget = (target: EventTarget | null) => {
				if (!(target instanceof Node) || !view.dom.contains(target)) return null;
				try {
					const position = view.posAtDOM(target, 0);
					return findTopLevelBlockAtPos(view.state.doc, position);
				} catch {
					return null;
				}
			};

			const handleMouseMove = (event: MouseEvent) => {
				updateHoveredBlock(resolveBlockFromTarget(event.target));
			};

			view.dom.addEventListener('mousemove', handleMouseMove);

			return {
				update() {
					updateFocusedBlock();
					if (hoveredBlock) {
						updateHoveredBlock(getTopLevelBlockByIndex(view.state.doc, hoveredBlock.index));
					}
				},
				destroy() {
					view.dom.removeEventListener('mousemove', handleMouseMove);
					onHoverBlockChange(null);
					onFocusBlockChange(null);
				}
			};
		}
	});

const normalizeNodes = (schema: Schema, nodes: ProseMirrorNode[]) =>
	nodes.length ? nodes : [createParagraphNode(schema)];

export const replaceTopLevelNodes = (
	editor: Editor,
	nodes: ProseMirrorNode[],
	focusIndex: number
) => {
	const nextNodes = normalizeNodes(editor.state.schema, nodes);
	let transaction = editor.state.tr.replaceWith(
		0,
		editor.state.doc.content.size,
		Fragment.fromArray(nextNodes)
	);
	const selection = getSelectionForTopLevelBlock(transaction.doc, focusIndex);
	transaction = transaction.setSelection(selection).scrollIntoView();
	editor.view.dispatch(transaction);
};

export const moveTopLevelNode = (
	editor: Editor,
	sourceIndex: number,
	dropIndex: number
) => {
	const blocks = getTopLevelBlocks(editor.state.doc);
	if (sourceIndex < 0 || sourceIndex >= blocks.length) return false;

	const nodes = blocks.map((block) => cloneNode(block.node));
	const [moved] = nodes.splice(sourceIndex, 1);
	if (!moved) return false;

	const nextIndex = dropIndex > sourceIndex ? dropIndex - 1 : dropIndex;
	if (nextIndex === sourceIndex) return false;
	nodes.splice(Math.max(0, Math.min(nodes.length, nextIndex)), 0, moved);
	replaceTopLevelNodes(editor, nodes, nextIndex);
	return true;
};

export const duplicateTopLevelNode = (editor: Editor, blockIndex: number) => {
	const blocks = getTopLevelBlocks(editor.state.doc);
	if (blockIndex < 0 || blockIndex >= blocks.length) return false;

	const nodes = blocks.map((block) => cloneNode(block.node));
	nodes.splice(blockIndex + 1, 0, cloneNode(blocks[blockIndex].node));
	replaceTopLevelNodes(editor, nodes, blockIndex + 1);
	return true;
};

export const deleteTopLevelNode = (editor: Editor, blockIndex: number) => {
	const blocks = getTopLevelBlocks(editor.state.doc);
	if (blockIndex < 0 || blockIndex >= blocks.length) return false;

	const nodes = blocks.map((block) => cloneNode(block.node));
	nodes.splice(blockIndex, 1);
	replaceTopLevelNodes(editor, nodes, Math.max(0, Math.min(blockIndex, nodes.length - 1)));
	return true;
};

export const insertParagraphNearTopLevelNode = (
	editor: Editor,
	blockIndex: number,
	side: 'above' | 'below'
) => {
	const blocks = getTopLevelBlocks(editor.state.doc);
	const insertIndex = side === 'above' ? blockIndex : blockIndex + 1;
	const nodes = blocks.map((block) => cloneNode(block.node));
	nodes.splice(Math.max(0, Math.min(nodes.length, insertIndex)), 0, createParagraphNode(editor.state.schema));
	replaceTopLevelNodes(editor, nodes, insertIndex);
	return true;
};

export const transformTopLevelNode = (
	editor: Editor,
	blockIndex: number,
	transformId: BlockTransformId
) => {
	const blocks = getTopLevelBlocks(editor.state.doc);
	const targetBlock = blocks[blockIndex];
	if (!targetBlock) return false;
	if (targetBlock.node.type.name === 'assetImage') return false;

	const schema = editor.state.schema;
	const inlineContent = getInlineContentFromBlock(targetBlock);
	let replacementNodes: ProseMirrorNode[];

	switch (transformId) {
		case 'paragraph':
			replacementNodes = [buildParagraphLikeNode(schema, 'paragraph', inlineContent)];
			break;
		case 'page':
		case 'heading-1':
			replacementNodes = [buildParagraphLikeNode(schema, 'heading', inlineContent, { level: 1 })];
			break;
		case 'heading-2':
			replacementNodes = [buildParagraphLikeNode(schema, 'heading', inlineContent, { level: 2 })];
			break;
		case 'heading-3':
			replacementNodes = [buildParagraphLikeNode(schema, 'heading', inlineContent, { level: 3 })];
			break;
		case 'bullet-list':
			replacementNodes = [buildListNode(schema, 'bulletList', inlineContent)];
			break;
		case 'checklist':
			replacementNodes = [buildListNode(schema, 'taskList', inlineContent)];
			break;
		case 'quote':
			replacementNodes = [buildBlockquoteNode(schema, inlineContent)];
			break;
		case 'code-block':
			replacementNodes = [buildCodeBlockNode(schema, targetBlock)];
			break;
		case 'divider':
			replacementNodes = [schema.nodes.horizontalRule.create(), createParagraphNode(schema)];
			break;
		default:
			return false;
	}

	const nodes = blocks.map((block) => cloneNode(block.node));
	nodes.splice(blockIndex, 1, ...replacementNodes);
	replaceTopLevelNodes(editor, nodes, blockIndex);
	return true;
};

export const getSelectionForTopLevelBlock = (doc: ProseMirrorNode, index: number) => {
	const blocks = getTopLevelBlocks(doc);
	const targetBlock =
		blocks[Math.max(0, Math.min(index, Math.max(0, blocks.length - 1)))] ?? null;

	if (!targetBlock) {
		return Selection.atStart(doc);
	}

	if (targetBlock.node.isLeaf || targetBlock.node.isAtom) {
		return NodeSelection.create(doc, targetBlock.from);
	}

	const focusPos = Math.max(
		0,
		Math.min(targetBlock.to - 1, Math.max(targetBlock.from + 1, targetBlock.from))
	);
	return Selection.near(doc.resolve(focusPos), 1);
};
