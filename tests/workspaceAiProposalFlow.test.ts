import { describe, expect, it } from 'vitest';
import { deriveKanbanOps } from '../server/workspace-ai/sync';
import { getScratchpadFingerprint } from '../src/lib/kainbu/fingerprint';
import { pageToScratchpadData } from '../src/lib/kainbu/projectStructure';
import type { KanbanData } from '../src/lib/kainbu/types';

describe('workspace AI proposal flow helpers', () => {
	it('keeps page-backed scratchpad ids stable for diff and apply flows', () => {
		const page = {
			id: 'page-1',
			name: 'Notes',
			content: '# Hello\n\nWorld'
		};

		const first = pageToScratchpadData(page);
		const second = pageToScratchpadData(page);

		expect(first.activePadId).toBe('page-1');
		expect(first.pads[0]?.id).toBe('page-1');
		expect(getScratchpadFingerprint(first)).toBe(getScratchpadFingerprint(second));
	});

	it('derives structured kanban ops from staged board changes', () => {
		const original: KanbanData = [
			{
				id: 'todo',
				title: 'Todo',
				width: 268,
				tasks: [
					{
						id: 'task-1',
						title: 'Write summary',
						description: '',
						tags: []
					}
				]
			}
		];

		const next: KanbanData = [
			{
				id: 'todo',
				title: 'Todo',
				width: 268,
				tasks: [
					{
						id: 'task-1',
						title: 'Write final summary',
						description: '',
						tags: []
					},
					{
						id: 'task-2',
						title: 'Review proposal card',
						description: 'Check staged changes',
						tags: []
					}
				]
			}
		];

		const ops = deriveKanbanOps(original, next);

		expect(ops).toEqual(
			expect.arrayContaining([
				{
					type: 'update_task',
					taskId: 'task-1',
					fields: {
						title: 'Write final summary'
					}
				},
				{
					type: 'add_task',
					columnId: 'todo',
					task: {
						id: 'task-2',
						title: 'Review proposal card',
						description: 'Check staged changes'
					},
					index: 1
				}
			])
		);
	});
});