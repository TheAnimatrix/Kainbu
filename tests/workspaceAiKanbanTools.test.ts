import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
	addColumn,
	addTasks,
	buildBoardRefIndex,
	bulkUpdateTasks,
	deleteTasks,
	listBoardColumns,
	listBoardTasks,
	resolveColumnRef,
	resolveTaskRef,
	updateColumn,
	updateTask,
	validateToneColor
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
		expect(prompt).toContain('bulk_update_tasks');
		expect(prompt).toContain('tone:blue');
		expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
	});

	it('validateToneColor accepts tone values and rejects unknown', () => {
		expect(validateToneColor('tone:red').ok).toBe(true);
		expect(validateToneColor('purple').ok).toBe(false);
		expect(validateToneColor(null, { allowClear: true }).ok).toBe(true);
	});

	it('update_task sets checkbox and color', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await updateTask(workspace, 'T1', {
			hasCheckbox: true,
			checked: true,
			color: 'tone:blue'
		});
		expect(result.ok).toBe(true);
		const task = workspace.board.kanbanData[0].tasks.find((entry) => entry.id === 'task-1');
		expect(task?.hasCheckbox).toBe(true);
		expect(task?.checked).toBe(true);
		expect(task?.color).toBe('tone:blue');
	});

	it('bulk_update_tasks updates multiple tasks', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await bulkUpdateTasks(workspace, [
			{ taskRef: 'T1', hasCheckbox: true },
			{ taskRef: 'T2', color: 'tone:green' }
		]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.updatedCount).toBe(2);
		const t1 = workspace.board.kanbanData[0].tasks.find((entry) => entry.id === 'task-1');
		const t2 = workspace.board.kanbanData[0].tasks.find((entry) => entry.id === 'task-2');
		expect(t1?.hasCheckbox).toBe(true);
		expect(t2?.color).toBe('tone:green');
	});

	it('add_column appends and returns columnRef', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await addColumn(workspace, 'Review', { color: 'tone:indigo' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(workspace.board.kanbanData).toHaveLength(3);
		expect(workspace.board.kanbanData[2].title).toBe('Review');
		expect(workspace.board.kanbanData[2].color).toBe('tone:indigo');
		expect(result.columnRef).toBe('C3');
	});

	it('update_column changes title and clears color', async () => {
		const kanban: KanbanData = [
			{
				id: 'col-1',
				title: 'Old',
				width: 268,
				color: 'tone:red',
				tasks: []
			}
		];
		const workspace = await makeWorkspace(kanban);
		const result = await updateColumn(workspace, 'C1', { title: 'Renamed', color: null });
		expect(result.ok).toBe(true);
		expect(workspace.board.kanbanData[0].title).toBe('Renamed');
		expect(workspace.board.kanbanData[0].color).toBeUndefined();
	});

	it('add_tasks with tasks[] drafts sets metadata on create', async () => {
		const workspace = await makeWorkspace(sampleKanban);
		const result = await addTasks(workspace, 'C1', [], undefined, [
			{ title: 'Check me', hasCheckbox: true, color: 'tone:amber' },
			{ title: 'Plain' }
		]);
		expect(result.ok).toBe(true);
		const added = workspace.board.kanbanData[0].tasks.slice(-2);
		expect(added[0].title).toBe('Check me');
		expect(added[0].hasCheckbox).toBe(true);
		expect(added[0].color).toBe('tone:amber');
		expect(added[1].title).toBe('Plain');
	});

	it('list tools expose color and checkbox state', () => {
		const kanban: KanbanData = [
			{
				id: 'col-1',
				title: 'Todo',
				width: 268,
				color: 'tone:blue',
				tasks: [
					{
						id: 'task-1',
						title: 'One',
						description: 'Details',
						tags: [],
						hasCheckbox: true,
						checked: true,
						color: 'tone:red'
					}
				]
			}
		];
		const refs = buildBoardRefIndex(kanban, 'Main');
		const columns = listBoardColumns(kanban, refs);
		const tasks = listBoardTasks(kanban, refs, 'C1');
		expect(columns.ok).toBe(true);
		if (!columns.ok) return;
		expect(columns.columns?.[0]?.color).toBe('tone:blue');
		expect(tasks.ok).toBe(true);
		if (!tasks.ok) return;
		expect(tasks.tasks?.[0]?.color).toBe('tone:red');
		expect(tasks.tasks?.[0]?.hasCheckbox).toBe(true);
		expect(tasks.tasks?.[0]?.checked).toBe(true);
		expect(tasks.tasks?.[0]?.description).toBe('Details');
	});
});

const findTaskTitle = (kanban: KanbanData, taskId: string) => {
	for (const column of kanban) {
		const task = column.tasks.find((entry) => entry.id === taskId);
		if (task) return task.title;
	}
	return undefined;
};
