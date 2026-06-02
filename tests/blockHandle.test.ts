import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Node } from '@tiptap/core';
import {
	ensureWritableSurfacesAroundAssetImages,
	getTopLevelBlocks
} from '../src/lib/kainbu/blockHandle';

const AssetImage = Node.create({
	name: 'assetImage',
	group: 'block',
	atom: true,
	addAttributes() {
		return {
			assetId: { default: '' },
			alt: { default: '' },
			width: { default: 520 }
		};
	}
});

const createTestEditor = (content: Record<string, unknown>) =>
	new Editor({
		extensions: [StarterKit, AssetImage],
		content
	});

describe('blockHandle asset image surfaces', () => {
	it('wraps a lone image block with empty paragraphs above and below', () => {
		const editor = createTestEditor({
			type: 'doc',
			content: [
				{
					type: 'assetImage',
					attrs: { assetId: 'asset-1', alt: 'Screenshot', width: 520 }
				}
			]
		});

		expect(ensureWritableSurfacesAroundAssetImages(editor)).toBe(true);

		const blocks = getTopLevelBlocks(editor.state.doc);
		expect(blocks).toHaveLength(3);
		expect(blocks[0]?.node.type.name).toBe('paragraph');
		expect(blocks[1]?.node.type.name).toBe('assetImage');
		expect(blocks[2]?.node.type.name).toBe('paragraph');

		editor.destroy();
	});

	it('inserts a paragraph between stacked image blocks', () => {
		const editor = createTestEditor({
			type: 'doc',
			content: [
				{ type: 'assetImage', attrs: { assetId: 'asset-1', alt: 'One', width: 520 } },
				{ type: 'assetImage', attrs: { assetId: 'asset-2', alt: 'Two', width: 520 } }
			]
		});

		expect(ensureWritableSurfacesAroundAssetImages(editor)).toBe(true);

		const blocks = getTopLevelBlocks(editor.state.doc);
		expect(blocks.map((block) => block.node.type.name)).toEqual([
			'paragraph',
			'assetImage',
			'paragraph',
			'assetImage',
			'paragraph'
		]);

		editor.destroy();
	});
});
