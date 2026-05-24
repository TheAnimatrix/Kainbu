import { describe, expect, it } from 'vitest';
import {
	addBidirectionalLink,
	buildLinkGroupLayout,
	buildTaskLinkGraph,
	createLinkedTask,
	getConnectedComponent,
	parseTaskReferenceIds,
	purgeTaskLinks,
	removeBidirectionalLink
} from '../src/lib/kainbu/taskLinks';
import type { KanbanData } from '../src/lib/kainbu/types';

const sampleBoard = (): KanbanData => [
	{
		id: 'col-a',
		title: 'To Do',
		width: 280,
		tasks: [
			{
				id: 'task-a',
				title: 'Alpha',
				description: 'See [Beta](ref:task:task-b)',
				tags: [],
				linkedTaskIds: ['task-c']
			},
			{ id: 'task-c', title: 'Charlie', tags: [], linkedTaskIds: ['task-a'] }
		]
	},
	{
		id: 'col-b',
		title: 'Done',
		width: 280,
		tasks: [{ id: 'task-b', title: 'Beta', tags: [] }]
	}
];

describe('taskLinks', () => {
	it('parses task reference ids from markdown', () => {
		expect(parseTaskReferenceIds('Hello [One](ref:task:abc) and [Two](ref:task:def)')).toEqual([
			'abc',
			'def'
		]);
	});

	it('adds and removes bidirectional explicit links', () => {
		const linked = addBidirectionalLink(sampleBoard(), 'task-b', 'task-a');
		const taskA = linked[0].tasks.find((task) => task.id === 'task-a');
		const taskB = linked[1].tasks.find((task) => task.id === 'task-b');
		expect(taskA?.linkedTaskIds).toContain('task-b');
		expect(taskB?.linkedTaskIds).toContain('task-a');

		const unlinked = removeBidirectionalLink(linked, 'task-b', 'task-a');
		expect(unlinked[0].tasks.find((task) => task.id === 'task-a')?.linkedTaskIds).not.toContain(
			'task-b'
		);
		expect(unlinked[1].tasks.find((task) => task.id === 'task-b')?.linkedTaskIds).not.toContain(
			'task-a'
		);
	});

	it('builds connected components across explicit and reference edges', () => {
		const graph = buildTaskLinkGraph(sampleBoard());
		const component = getConnectedComponent('task-a', graph);
		expect(component.sort()).toEqual(['task-a', 'task-b', 'task-c'].sort());
	});

	it('purges deleted task ids from explicit links', () => {
		const purged = purgeTaskLinks(sampleBoard(), 'task-c');
		expect(purged[0].tasks.find((task) => task.id === 'task-a')?.linkedTaskIds).toEqual([]);
	});

	it('creates a linked task with reciprocal explicit link and reference markdown', () => {
		const result = createLinkedTask(sampleBoard(), 'task-a', 'col-a', () => 'task-new');
		expect(result).not.toBeNull();
		const created = result!.data[0].tasks.find((task) => task.id === 'task-new');
		expect(created?.title).toBe('Linked: Alpha');
		expect(created?.description).toContain('ref:task:task-a');
		expect(created?.linkedTaskIds).toContain('task-a');
		expect(result!.data[0].tasks.find((task) => task.id === 'task-a')?.linkedTaskIds).toContain(
			'task-new'
		);
	});

	it('derives link group columns and residual singleton columns', () => {
		const { linkGroupColumns, residualColumns } = buildLinkGroupLayout(sampleBoard());
		expect(linkGroupColumns).toHaveLength(1);
		expect(linkGroupColumns[0]?.tasks).toHaveLength(3);
		expect(residualColumns).toHaveLength(0);
	});
});
