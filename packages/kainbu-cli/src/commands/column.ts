import { buildBoardRefIndex, createId, resolveColumnRef } from '@kainbu/core';
import { syncProjectBoard } from '../writes.js';
import type { Command } from 'commander';
import type { KanbanData } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printResult } from '../output.js';
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
		const refs = buildBoardRefIndex(kanban, ctx.board.name);
		return { ...ctx, kanban, refs };
	};

	column
		.command('list [board]')
		.description('List columns. [board] lists any board without making it active.')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(async (boardArg: string | undefined, options: { project?: string; board?: string; json?: boolean }) => {
			await initRuntime();
			const { kanban, refs } = await withContext({ ...options, board: boardArg ?? options.board });
			const rows = kanban.map((entry) => ({
				ref: refs.columnIdToRef.get(entry.id) || entry.id,
				id: entry.id,
				title: entry.title,
				taskCount: entry.tasks.length
			}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map(
					(row) =>
						`${ui.ref(row.ref)}  ${ui.name(row.title)}  ${ui.meta(`(${row.taskCount} tasks)`)}  ${ui.id(row.id)}`
				)
			);
		});

	column
		.command('add <title>')
		.description('Add a column')
		.option('--color <color>', 'Column color')
		.option('--width <width>', 'Column width', (value) => Number(value))
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
				console.log(`${ui.success('Added column')} ${ui.name(title)}`);
			}
		);

	column
		.command('update <target>')
		.description('Update a column')
		.requiredOption('--title <title>', 'New title')
		.option('--color <color>', 'Column color')
		.option('--width <width>', 'Column width', (value) => Number(value))
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
				const columnId =
					resolveColumnRef(refs, target) ||
					findColumnByRefOrTitle(kanban, refs, target)?.id ||
					target;
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
				console.log(`${ui.success('Updated column')} ${ui.name(options.title)}`);
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
			const columnId =
				resolveColumnRef(refs, target) ||
				findColumnByRefOrTitle(kanban, refs, target)?.id ||
				target;
			const next = kanban.filter((entry) => entry.id !== columnId);
			if (next.length === kanban.length) {
				throw new Error(`Column not found: ${target}`);
			}
			await syncProjectBoard(project.id, board.id, kanban, next);
			console.log(ui.removed('Deleted column'));
		});
};
