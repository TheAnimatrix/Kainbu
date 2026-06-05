import { describe, expect, it } from 'vitest';
import {
	buildHistoryMessages,
	buildUserMessageContent,
	formatTextAttachments
} from '../server/workspace-ai/history-messages';
import {
	SESSION_CONTEXT_OPEN,
	assembleWorkspaceMessages
} from '../server/workspace-ai/prompt';
import { WORKSPACE_AI_CACHE_BREAKPOINT_KEY } from '../server/workspace-ai/constants';
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

	it('maps history verbatim without mutating the latest user turn', () => {
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

		const messages = buildHistoryMessages(history);

		expect(messages[0].content).toEqual([
			{ type: 'text', text: 'Earlier' },
			{ type: 'image_url', image_url: { url: imageDataUrl } }
		]);
		expect(messages[2].content).toBe('Latest');
	});

	it('places volatile context in a session_context block before the latest user message', () => {
		const history = buildHistoryMessages([
			{ id: 'u1', role: 'user', text: 'Earlier', timestamp: 1 },
			{ id: 'a1', role: 'assistant', text: 'Done', timestamp: 2 },
			{ id: 'u2', role: 'user', text: 'Latest', timestamp: 3 }
		]);

		const assembled = assembleWorkspaceMessages(history, 'Board overview: 3 tasks.');

		// session_context sits immediately before the trailing user message.
		const last = assembled[assembled.length - 1];
		const beforeLast = assembled[assembled.length - 2];
		expect(last).toEqual({ role: 'user', content: 'Latest' });
		expect(beforeLast.role).toBe('user');
		expect(String(beforeLast.content)).toContain(SESSION_CONTEXT_OPEN);
		expect(String(beforeLast.content)).toContain('Board overview: 3 tasks.');

		// The end of the stable history prefix is tagged for a cache breakpoint.
		const tagged = assembled.filter((m) => m[WORKSPACE_AI_CACHE_BREAKPOINT_KEY]);
		expect(tagged).toHaveLength(1);
		expect(tagged[0].content).toBe('Done');
	});

	it('prepends a conversation summary and instruction refresh when provided', () => {
		const history = buildHistoryMessages([
			{ id: 'u1', role: 'user', text: 'Only message', timestamp: 1 }
		]);

		const assembled = assembleWorkspaceMessages(history, 'ctx', {
			summary: { userGoal: 'plan a trip' },
			instructionRefresh: '<instruction_refresh>contract</instruction_refresh>'
		});

		const serialized = assembled.map((m) => String(m.content));
		expect(serialized.some((c) => c.includes('conversation_summary'))).toBe(true);
		expect(serialized.some((c) => c.includes('plan a trip'))).toBe(true);
		expect(serialized.some((c) => c.includes('instruction_refresh'))).toBe(true);
	});
});
