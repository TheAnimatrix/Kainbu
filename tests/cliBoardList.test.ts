import { describe, expect, it } from 'vitest';
import { listBoardTasksPaginated } from '../src/lib/kainbu/boardList.js';
import type { KanbanData } from '../src/lib/kainbu/types.js';

const sampleKanban: KanbanData = [
	{
		id: 'col-1',
		title: 'Todo',
		tasks: [
			{ id: 't1', title: 'One', tags: [], createdAt: 30, description: 'has body' },
			{ id: 't2', title: 'Two', tags: [], createdAt: 10 },
			{ id: 't3', title: 'Three', tags: [], createdAt: 20, description: '   ' }
		]
	},
	{
		id: 'col-2',
		title: 'Done',
		tasks: [{ id: 't4', title: 'Four', tags: [], createdAt: 5 }]
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

	it('includes only the requested columns by title', () => {
		const page = listBoardTasksPaginated(sampleKanban, 'Main', { includeColumns: ['Done'] });
		expect(page.tasks.map((t) => t.id)).toEqual(['t4']);
	});

	it('excludes columns', () => {
		const page = listBoardTasksPaginated(sampleKanban, 'Main', { excludeColumns: ['Todo'] });
		expect(page.tasks.map((t) => t.columnTitle)).toEqual(['Done']);
	});

	it('filters to tasks with a non-empty description', () => {
		const page = listBoardTasksPaginated(sampleKanban, 'Main', { hasContent: true });
		// t3 has a whitespace-only description and must be excluded.
		expect(page.tasks.map((t) => t.id)).toEqual(['t1']);
	});

	it('sorts within a column by created date', () => {
		const asc = listBoardTasksPaginated(sampleKanban, 'Main', {
			includeColumns: ['Todo'],
			sort: { field: 'created', dir: 'asc' }
		});
		expect(asc.tasks.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
		const desc = listBoardTasksPaginated(sampleKanban, 'Main', {
			includeColumns: ['Todo'],
			sort: { field: 'created', dir: 'desc' }
		});
		expect(desc.tasks.map((t) => t.id)).toEqual(['t1', 't3', 't2']);
	});

	it('reports an error for an unknown column', () => {
		const page = listBoardTasksPaginated(sampleKanban, 'Main', { includeColumns: ['Nope'] });
		expect(page.error).toMatch(/Unknown column/);
		expect(page.tasks).toHaveLength(0);
	});
});
