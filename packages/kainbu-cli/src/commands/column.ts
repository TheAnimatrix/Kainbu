import { buildBoardRefIndex, createId } from '@kainbu/core';
import { syncProjectBoard } from '../writes.js';
import type { Command } from 'commander';
import type { KanbanData } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { integerOption } from '../invocation.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { findColumnByRefOrTitle } from './kanban-utils.js';

export const registerColumnCommands = (program: Command) => {
	const column = program.command('column').alias('c').description('Manage board columns');

	// Reads use the board's kanbanData from the workspace snapshot (no direct
	// PocketBase dependency); writes still sync through the persistence layer.
	const withContext = async (options: { project?: string; board?: string }) => {
		const ctx = await resolveContext({ ...options, requireBoard: true });
		const kanban = ctx.board.kanbanData;
		const refs = buildBoardRefIndex(
			kanban.map((column) => ({
				...column,
				tasks: column.tasks.filter((task) => !task.deletedAt)
			})),
			ctx.board.name,
			Infinity
		);
		return { ...ctx, kanban, refs };
	};

	column
		.command('list [board]')
		.description('List columns. [board] lists any board without making it active.')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (
				boardArg: string | undefined,
				options: { project?: string; board?: string; json?: boolean }
			) => {
				await initRuntime();
				const { kanban, refs } = await withContext({
					...options,
					board: boardArg ?? options.board
				});
				const rows = kanban.map((entry) => ({
					ref: refs.columnIdToRef.get(entry.id) || entry.id,
					id: entry.id,
					title: entry.title,
					taskCount: entry.tasks.filter((task) => !task.deletedAt).length
				}));
				printResult(
					{ json: Boolean(options.json), quiet: false },
					rows,
					rows.map(
						(row) =>
							`${ui.ref(row.ref)}  ${ui.name(row.title)}  ${ui.meta(`(${row.taskCount} tasks)`)}  ${ui.id(row.id)}`
					)
				);
			}
		);

	column
		.command('add <title>')
		.description('Add a column')
		.option('--color <color>', 'Column color')
		.option('--width <width>', 'Column width', integerOption(1))
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(
			async (
				title: string,
				options: { color?: string; width?: number; project?: string; board?: string }
			) => {
				await initRuntime();
				const { project, board, kanban } = await withContext(options);
				const next: KanbanData = [
					...kanban,
					{
						id: createId(),
						title,
						color: options.color,
						width: options.width,
						tasks: []
					}
				];
				await syncProjectBoard(project.id, board.id, kanban, next);
				printSuccess(
					{ id: next[next.length - 1].id, projectId: project.id, boardId: board.id, title },
					`${ui.success('Added column')} ${ui.name(title)}`
				);
			}
		);

	column
		.command('update <target>')
		.description('Update a column')
		.requiredOption('--title <title>', 'New title')
		.option('--color <color>', 'Column color')
		.option('--width <width>', 'Column width', integerOption(1))
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(
			async (
				target: string,
				options: {
					title: string;
					color?: string;
					width?: number;
					project?: string;
					board?: string;
				}
			) => {
				await initRuntime();
				const { project, board, kanban, refs } = await withContext(options);
				const columnId = findColumnByRefOrTitle(kanban, refs, target).id;
				const next = kanban.map((entry) =>
					entry.id === columnId
						? {
								...entry,
								title: options.title,
								color: options.color ?? entry.color,
								width: options.width ?? entry.width
							}
						: entry
				);
				await syncProjectBoard(project.id, board.id, kanban, next);
				printSuccess(
					{ id: columnId, projectId: project.id, boardId: board.id, title: options.title },
					`${ui.success('Updated column')} ${ui.name(options.title)}`
				);
			}
		);

	column
		.command('delete <target>')
		.description('Delete a column')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(async (target: string, options: { project?: string; board?: string }) => {
			await initRuntime();
			const { project, board, kanban, refs } = await withContext(options);
			const columnId = findColumnByRefOrTitle(kanban, refs, target).id;
			const next = kanban.filter((entry) => entry.id !== columnId);
			if (next.length === kanban.length) {
				throw new Error(`Column not found: ${target}`);
			}
			await syncProjectBoard(project.id, board.id, kanban, next);
			printSuccess(
				{ id: columnId, projectId: project.id, boardId: board.id, deleted: true },
				ui.removed('Deleted column')
			);
		});
};
