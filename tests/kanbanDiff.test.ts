import { describe, expect, it } from 'vitest';
import { areKanbanTasksEqualForDiff, computeKanbanDiff } from '../src/lib/kainbu/diff';
import type { KanbanData, Task } from '../src/lib/kainbu/types';

const baseTask = (overrides: Partial<Task> = {}): Task => ({
	id: 'task-1',
	title: 'Example task',
	description: '',
	tags: [],
	...overrides
});

describe('areKanbanTasksEqualForDiff', () => {
	it('ignores linked task ids that AI previews do not round-trip', () => {
		const left = baseTask({ linkedTaskIds: ['task-2', 'task-3'] });
		const right = baseTask();

		expect(areKanbanTasksEqualForDiff(left, right)).toBe(true);
	});

	it('ignores tag ids when label and color match', () => {
		const left = baseTask({
			tags: [{ id: 'tag-a', label: 'Blocked', color: 'tone:red' }]
		});
		const right = baseTask({
			tags: [{ id: 'tag-b', label: 'Blocked', color: 'tone:red' }]
		});

		expect(areKanbanTasksEqualForDiff(left, right)).toBe(true);
	});

	it('treats unset due timestamps as equal', () => {
		const left = baseTask({ countdownAt: 0, alarmAt: 0 });
		const right = baseTask();

		expect(areKanbanTasksEqualForDiff(left, right)).toBe(true);
	});

	it('detects visible title changes', () => {
		const left = baseTask({ title: 'Before' });
		const right = baseTask({ title: 'After' });

		expect(areKanbanTasksEqualForDiff(left, right)).toBe(false);
	});
});

describe('computeKanbanDiff', () => {
	it('marks only actually changed cards as modified', () => {
		const original: KanbanData = [
			{
				id: 'todo',
				title: 'Todo',
				width: 268,
				tasks: [
					baseTask({
						id: 'task-1',
						title: 'Unchanged card',
						linkedTaskIds: ['task-2'],
						tags: [{ id: 'tag-a', label: 'Blocked', color: 'tone:red' }]
					}),
					baseTask({ id: 'task-2', title: 'Edited card' })
				]
			}
		];

		const proposed: KanbanData = [
			{
				id: 'todo',
				title: 'Todo',
				width: 268,
				tasks: [
					baseTask({
						id: 'task-1',
						title: 'Unchanged card',
						tags: [{ id: 'tag-b', label: 'Blocked', color: 'tone:red' }]
					}),
					baseTask({ id: 'task-2', title: 'Edited card (updated)' })
				]
			}
		];

		const diff = computeKanbanDiff(original, proposed);
		const tasks = diff[0]?.tasks || [];

		expect(tasks.find((task) => task.id === 'task-1')?._status).toBe('unchanged');
		expect(tasks.find((task) => task.id === 'task-2')?._status).toBe('modified');
	});

	it('finds original tasks across columns when comparing moved cards', () => {
		const original: KanbanData = [
			{
				id: 'todo',
				title: 'Todo',
				width: 268,
				tasks: [baseTask({ id: 'task-1', title: 'Move me' })]
			},
			{
				id: 'done',
				title: 'Done',
				width: 268,
				tasks: []
			}
		];

		const proposed: KanbanData = [
			{
				id: 'todo',
				title: 'Todo',
				width: 268,
				tasks: []
			},
			{
				id: 'done',
				title: 'Done',
				width: 268,
				tasks: [baseTask({ id: 'task-1', title: 'Move me' })]
			}
		];

		const diff = computeKanbanDiff(original, proposed);
		const todoTask = diff[0]?.tasks.find((task) => task.id === 'task-1');
		const doneTask = diff[1]?.tasks.find((task) => task.id === 'task-1');

		expect(todoTask?._status).toBe('removed');
		expect(doneTask?._status).toBe('unchanged');
	});
});
