import { describe, expect, it } from 'vitest';
import { listBoardTasksPaginated } from '../src/lib/kainbu/boardList.js';
import type { KanbanData } from '../src/lib/kainbu/types.js';

const sampleKanban: KanbanData = [
	{
		id: 'col-1',
		title: 'Todo',
		tasks: [
			{ id: 't1', title: 'One', tags: [] },
			{ id: 't2', title: 'Two', tags: [] },
			{ id: 't3', title: 'Three', tags: [] }
		]
	},
	{
		id: 'col-2',
		title: 'Done',
		tasks: [{ id: 't4', title: 'Four', tags: [] }]
	}
];

describe('listBoardTasksPaginated', () => {
	it('paginates all tasks across columns', () => {
		const page = listBoardTasksPaginated(sampleKanban, 'Main', { offset: 1, limit: 2 });
		expect(page.tasks).toHaveLength(2);
		expect(page.hasMore).toBe(true);
		expect(page.nextOffset).toBe(3);
		expect(page.total).toBe(4);
	});

	it('paginates within a column ref', () => {
		const page = listBoardTasksPaginated(sampleKanban, 'Main', {
			columnRef: 'C1',
			offset: 1,
			limit: 1
		});
		expect(page.tasks[0]?.title).toBe('Two');
		expect(page.hasMore).toBe(true);
	});
});
