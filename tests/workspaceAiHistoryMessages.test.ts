import { describe, expect, it } from 'vitest';
import {
	buildHistoryMessages,
	buildUserMessageContent,
	formatTextAttachments
} from '../server/workspace-ai/history-messages';
import type { ChatAttachment, ChatMessage } from '../src/lib/kainbu/types';

const imageDataUrl = 'data:image/png;base64,abc123';

describe('workspace AI history messages', () => {
	it('inlines text attachments into user message text', () => {
		const attachments: ChatAttachment[] = [
			{
				id: 'text-1',
				kind: 'text',
				name: 'notes.md',
				mimeType: 'text/markdown',
				content: 'Line one'
			}
		];

		expect(formatTextAttachments(attachments)).toContain('notes.md');
		expect(formatTextAttachments(attachments)).toContain('Line one');
		expect(buildUserMessageContent('Hello', attachments)).toBe(
			'Hello\n\nAttached file "notes.md":\n```\nLine one\n```'
		);
	});

	it('sends image attachments as multimodal image_url parts', () => {
		const attachments: ChatAttachment[] = [
			{
				id: 'img-1',
				kind: 'image',
				name: 'image.png',
				mimeType: 'image/png',
				content: imageDataUrl
			}
		];

		const content = buildUserMessageContent('Checklist screenshot', attachments);
		expect(Array.isArray(content)).toBe(true);
		expect(content).toEqual([
			{ type: 'text', text: 'Checklist screenshot' },
			{ type: 'image_url', image_url: { url: imageDataUrl } }
		]);
	});

	it('appends queued task cards only on the latest user turn', () => {
		const history: ChatMessage[] = [
			{
				id: 'u1',
				role: 'user',
				text: 'Earlier',
				timestamp: 1,
				attachments: [
					{
						id: 'img-old',
						kind: 'image',
						name: 'old.png',
						mimeType: 'image/png',
						content: imageDataUrl
					}
				]
			},
			{ id: 'a1', role: 'assistant', text: 'Done', timestamp: 2 },
			{ id: 'u2', role: 'user', text: 'Latest', timestamp: 3 }
		];

		const messages = buildHistoryMessages(history, {
			queuedCardsContext: 'The user attached these task cards:\n- One (column: Todo)'
		});

		expect(messages[0].content).toEqual([
			{ type: 'text', text: 'Earlier' },
			{ type: 'image_url', image_url: { url: imageDataUrl } }
		]);
		expect(messages[2].content).toBe(
			'Latest\n\nThe user attached these task cards:\n- One (column: Todo)'
		);
	});
});
