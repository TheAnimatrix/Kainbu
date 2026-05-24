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
});
