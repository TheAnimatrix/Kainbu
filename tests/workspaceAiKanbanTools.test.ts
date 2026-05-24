import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
	addTasks,
	buildBoardRefIndex,
	deleteTasks,
	listBoardTasks,
	resolveColumnRef,
	resolveTaskRef,
	updateTask
} from '../server/workspace-ai/kanban-ops';
import {
	buildStaticSystemPrompt,
	buildVariableSystemContext
} from '../server/workspace-ai/prompt';
import type { KanbanData } from '../src/lib/kainbu/types';
import type { MaterializedWorkspace } from '../server/workspace-ai/sync';

const sampleKanban: KanbanData = [
	{
		id: 'col-todo',
		title: 'Todo',
		width: 268,
		tasks: [
			{ id: 'task-1', title: 'Existing', description: '', tags: [] },
			{ id: 'task-2', title: 'Second', description: '', tags: [] }
		]
	},
	{ id: 'col-done', title: 'Done', width: 268, tasks: [] }
];

const makeWorkspace = async (kanbanData: KanbanData): Promise<MaterializedWorkspace> => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-test-'));
	const boardFilePath = path.join(tempDir, 'current-board.json');
	await fs.writeFile(boardFilePath, '[]', 'utf8');
	const kanban = structuredClone(kanbanData);

	return {
		tempDir,
		projectId: 'project-1',
		board: {
			id: 'board-1',
			name: 'Main',
			kanbanData: kanban,
			filePath: boardFilePath,
			originalContent: '',
			baseRevision: 0,
			baseFingerprint: '',
			editCallCount: 0,
			mutationCount: 0
		},
		page: {
			id: 'page-1',
			name: 'Notes',
			content: '',
			filePath: '/tmp/test/current-page.md',
			originalContent: '',
			baseRevision: 0,
			baseFingerprint: '',
			editCallCount: 0
		},
		boardRefs: buildBoardRefIndex(kanban, 'Main')
	};
};

describe('workspace AI kanban tools', () => {
	it('resolves C1/T1 aliases and raw UUIDs', () => {
		const refs = buildBoardRefIndex(sampleKanban, 'Main');
		expect(resolveColumnRef(refs, 'C1')).toBe('col-todo');
		expect(resolveColumnRef(refs, 'col-todo')).toBe('col-todo');
		expect(resolveTaskRef(refs, 'T1')).toBe('task-1');
		expect(resolveTaskRef(refs, 'task-2')).toBe('task-2');
	});

	it('add_tasks only adds new tasks via columnRef', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await addTasks(workspace, 'C1', ['New one', 'New two']);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.taskRefs).toHaveLength(2);
		expect(workspace.board.kanbanData[0].tasks).toHaveLength(4);
		expect(workspace.board.kanbanData[0].tasks[0].title).toBe('Existing');
	});

	it('rejects unknown columnRef with valid refs', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await addTasks(workspace, 'C9', ['A']);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.columnRefs).toEqual(['C1', 'C2']);
	});

	it('delete_tasks removes tasks by taskRef', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await deleteTasks(workspace, ['T1', 'T2']);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(workspace.board.kanbanData[0].tasks).toHaveLength(0);
		expect(findTaskTitle(workspace.board.kanbanData, 'task-1')).toBeUndefined();
	});

	it('rejects delete outside bound task scope', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await deleteTasks(workspace, ['T2'], {
			currentTab: 'kanban',
			selectedTaskIds: ['task-1'],
			selectedColumnIds: [],
			activePadId: 'page-1',
			queuedTaskCards: [],
			revisions: { kanban: 0, scratchpad: 0 },
			workspaceSummary: {
				columnCount: 1,
				taskCount: 2,
				padCount: 1,
				memberCount: 1,
				kanbanFullAllowed: true,
				scratchpadAllAllowed: true
			},
			boundTarget: {
				kind: 'task',
				id: 'task-1',
				source: 'open_task',
				locked: true
			}
		});

		expect(result.ok).toBe(false);
		expect(workspace.board.kanbanData[0].tasks).toHaveLength(2);
	});

	it('update_task changes one task via taskRef', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await updateTask(workspace, 'T1', { title: 'One updated' });
		expect(result.ok).toBe(true);
		expect(findTaskTitle(workspace.board.kanbanData, 'task-1')).toBe('One updated');
		expect(findTaskTitle(workspace.board.kanbanData, 'task-2')).toBe('Second');
	});

	it('rejects update outside bound task scope', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await updateTask(
			workspace,
			'T2',
			{ title: 'Nope' },
			{
				currentTab: 'kanban',
				selectedTaskIds: ['task-1'],
				selectedColumnIds: [],
				activePadId: 'page-1',
				queuedTaskCards: [],
				revisions: { kanban: 0, scratchpad: 0 },
				workspaceSummary: {
					columnCount: 1,
					taskCount: 2,
					padCount: 1,
					memberCount: 1,
					kanbanFullAllowed: true,
					scratchpadAllAllowed: true
				},
				boundTarget: {
					kind: 'task',
					id: 'task-1',
					source: 'open_task',
					locked: true
				}
			}
		);

		expect(result.ok).toBe(false);
	});

	it('paginates board_list_tasks', () => {
		const manyTasks: KanbanData = [
			{
				id: 'col-1',
				title: 'Backlog',
				width: 268,
				tasks: Array.from({ length: 20 }, (_, index) => ({
					id: `task-${index}`,
					title: `Task ${index}`,
					description: '',
					tags: []
				}))
			}
		];
		const refs = buildBoardRefIndex(manyTasks, 'Big');
		const page1 = listBoardTasks(manyTasks, refs, 'C1', 0, 5);
		const page2 = listBoardTasks(manyTasks, refs, 'C1', 5, 5);

		expect(page1.ok).toBe(true);
		if (!page1.ok) return;
		expect(page1.tasks).toHaveLength(5);
		expect(page1.hasMore).toBe(true);
		expect(page1.nextOffset).toBe(5);

		expect(page2.ok).toBe(true);
		if (!page2.ok) return;
		expect(page2.tasks?.[0]?.title).toBe('Task 5');
	});

	it('variable prompt omits UUIDs and uses titles for bound target', () => {
		const refs = buildBoardRefIndex(sampleKanban, 'Main');
		const context = buildVariableSystemContext(
			{
				currentTab: 'kanban',
				selectedTaskIds: ['task-1'],
				selectedColumnIds: [],
				activePadId: 'page-1',
				queuedTaskCards: [
					{
						id: 'card-1',
						taskId: 'task-1',
						columnId: 'col-todo',
						title: 'Existing',
						columnTitle: 'Todo',
						tags: []
					}
				],
				revisions: { kanban: 0, scratchpad: 0 },
				workspaceSummary: {
					columnCount: 2,
					taskCount: 2,
					padCount: 1,
					memberCount: 1,
					kanbanFullAllowed: false,
					scratchpadAllAllowed: true
				},
				boundTarget: {
					kind: 'task',
					id: 'task-1',
					source: 'open_task',
					locked: true
				},
				activeViewContent: {
					kind: 'board',
					name: 'Main',
					content: '[Todo] Existing, Second\n[Done] (empty)'
				}
			},
			{
				boardIndexText: refs.indexText,
				kanbanFullAllowed: false,
				kanban: sampleKanban
			}
		);

		expect(context).not.toMatch(/col-todo|task-1|task-2/);
		expect(context).toContain('board_list_columns');
		expect(context).toContain('Existing');
		expect(context).toContain('Only change the task "Existing"');
	});

	it('static prompt is stable and mentions privacy rules', () => {
		const prompt = buildStaticSystemPrompt();
		expect(prompt).toContain('Never show refs or UUIDs');
		expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
	});
});

const findTaskTitle = (kanban: KanbanData, taskId: string) => {
	for (const column of kanban) {
		const task = column.tasks.find((entry) => entry.id === taskId);
		if (task) return task.title;
	}
	return undefined;
};
