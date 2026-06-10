import { describe, expect, it } from 'vitest';
import {
	filterColumnsForBoardSearch,
	normalizeBoardSearchQuery,
	taskMatchesBoardSearch
} from '../src/lib/kainbu/boardSearch';
import type { KanbanData } from '../src/lib/kainbu/types';

const sampleBoard = (): KanbanData => [
	{
		id: 'col-a',
		title: 'To Do',
		width: 280,
		tasks: [
			{ id: 'task-a', title: 'Alpha launch', tags: [] },
			{ id: 'task-b', title: '- [ ] Beta checklist', hasCheckbox: true, tags: [] }
		]
	},
	{
		id: 'col-b',
		title: 'Done',
		width: 280,
		tasks: [{ id: 'task-c', title: 'Gamma', tags: [] }]
	}
];

describe('boardSearch', () => {
	it('normalizes queries', () => {
		expect(normalizeBoardSearchQuery('  Hello ')).toBe('hello');
	});

	it('matches card titles case-insensitively', () => {
		expect(taskMatchesBoardSearch({ id: '1', title: 'Alpha launch', tags: [] }, 'ALPHA')).toBe(
			true
		);
		expect(taskMatchesBoardSearch({ id: '1', title: 'Alpha launch', tags: [] }, 'launch')).toBe(
			true
		);
		expect(taskMatchesBoardSearch({ id: '1', title: 'Alpha launch', tags: [] }, 'gamma')).toBe(
			false
		);
	});

	it('searches checkbox titles without the markdown prefix', () => {
		expect(
			taskMatchesBoardSearch(
				{ id: '1', title: '- [ ] Beta checklist', hasCheckbox: true, tags: [] },
				'beta'
			)
		).toBe(true);
	});

	it('matches card descriptions case-insensitively', () => {
		expect(
			taskMatchesBoardSearch(
				{
					id: '1',
					title: 'Launch',
					description: 'Ship the **Beta** release notes',
					tags: []
				},
				'beta'
			)
		).toBe(true);
		expect(
			taskMatchesBoardSearch(
				{
					id: '1',
					title: 'Launch',
					description: 'Ship the **Beta** release notes',
					tags: []
				},
				'release notes'
			)
		).toBe(true);
		expect(
			taskMatchesBoardSearch(
				{ id: '1', title: 'Launch', description: 'Ship the beta release', tags: [] },
				'gamma'
			)
		).toBe(false);
	});

	it('matches tag labels case-insensitively', () => {
		expect(
			taskMatchesBoardSearch(
				{
					id: '1',
					title: 'Untitled',
					tags: [{ id: 'tag-1', label: 'High Priority', color: 'red' }]
				},
				'priority'
			)
		).toBe(true);
		expect(
			taskMatchesBoardSearch(
				{
					id: '1',
					title: 'Untitled',
					tags: [{ id: 'tag-1', label: 'High Priority', color: 'red' }]
				},
				'launch'
			)
		).toBe(false);
	});

	it('filters columns and hides empty ones', () => {
		expect(filterColumnsForBoardSearch(sampleBoard(), 'beta')).toEqual([
			{
				id: 'col-a',
				title: 'To Do',
				width: 280,
				tasks: [
					{ id: 'task-b', title: '- [ ] Beta checklist', hasCheckbox: true, tags: [] }
				]
			}
		]);
	});

	it('filters by description and tags across columns', () => {
		const board: KanbanData = [
			{
				id: 'col-a',
				title: 'To Do',
				width: 280,
				tasks: [
					{
						id: 'task-a',
						title: 'Card A',
						description: 'Needs design review',
						tags: []
					}
				]
			},
			{
				id: 'col-b',
				title: 'Done',
				width: 280,
				tasks: [
					{
						id: 'task-b',
						title: 'Card B',
						tags: [{ id: 'tag-1', label: 'Blocked', color: 'red' }]
					}
				]
			}
		];

		expect(filterColumnsForBoardSearch(board, 'design')).toEqual([board[0]]);
		expect(filterColumnsForBoardSearch(board, 'blocked')).toEqual([board[1]]);
	});
});
