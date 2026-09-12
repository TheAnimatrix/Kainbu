import { createProjectBoard, deleteProjectBoard, renameProjectBoard } from '../writes.js';
import type { Command } from 'commander';
import { resolveContext, setActiveBoard, setActiveProject } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';

export const registerBoardCommands = (program: Command) => {
	const board = program.command('board').alias('b').description('Manage boards (taskboards)');

	board
		.command('list')
		.description('List boards in the active project')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean; use?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const rows = project.boards.map((entry) => ({
				id: entry.id,
				name: entry.name,
				position: entry.position,
				columnCount: entry.kanbanData.length
			}));

			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map(
					(row) =>
						`${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.columnCount} columns)`)}`
				)
			);
		});

	board
		.command('use <target>')
		.description('Set the active board')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.boards, target, 'board');
			await setActiveProject(project.id);
			await setActiveBoard(selected.id);
			printSuccess(
				{ projectId: project.id, boardId: selected.id, name: selected.name },
				`${ui.active('Active board:')} ${ui.name(selected.name)} ${ui.id(`(${selected.id})`)}`
			);
		});

	board
		.command('create <name>')
		.description('Create a board')
		.option('--no-use', 'Do not change the saved active board/project')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (name: string, options: { project?: string; json?: boolean; use?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const position = project.boards.length;
			const created = await createProjectBoard(project.id, name, position);
			if (options.use !== false) {
				await setActiveProject(project.id);
				await setActiveBoard(created.id);
			}
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ id: created.id, name: created.name, projectId: project.id },
				[`${ui.success('Created board')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`]
			);
		});

	board
		.command('rename <name>')
		.description('Rename the active board')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(async (name: string, options: { project?: string; board?: string }) => {
			await initRuntime();
			const { project, board: active } = await resolveContext(options);
			await renameProjectBoard(project.id, active.id, name);
			printSuccess(
				{ id: active.id, projectId: project.id, name },
				`${ui.success('Renamed board to')} ${ui.name(name)}`
			);
		});

	board
		.command('delete <target>')
		.description('Delete a board')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			if (project.boards.length <= 1) {
				throw new Error('Cannot delete the only board on a project.');
			}
			const selected = resolveByIdOrName(project.boards, target, 'board');
			await deleteProjectBoard(project.id, selected.id);
			printSuccess(
				{ id: selected.id, projectId: project.id, deleted: true },
				`${ui.removed('Deleted board')} ${ui.name(selected.name)}`
			);
		});
};
