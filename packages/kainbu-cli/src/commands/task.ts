import {
	createId,
	fetchProjectBoardKanban,
	listBoardTasksPaginated,
	syncProjectBoard
} from '@kainbu/core';
import type { Command } from 'commander';
import type { KanbanData } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printResult, type OutputMode } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import {
	buildBoardRefIndex,
	findColumnByRefOrTitle,
	findTaskByRefOrId,
	moveTaskToColumn,
	resolveColumnRef
} from './kanban-utils.js';

export const registerTaskCommands = (program: Command) => {
	const task = program.command('task').alias('t').description('Manage tasks');

	const withBoard = async (options: { project?: string; board?: string }) => {
		const ctx = await resolveContext({ ...options, requireBoard: true });
		const kanban = await fetchProjectBoardKanban(ctx.project.id, ctx.board.id);
		const refs = buildBoardRefIndex(kanban, ctx.board.name);
		return { ...ctx, kanban, refs };
	};

	task
		.command('list')
		.description('List tasks (paginated)')
		.option('--column <ref>', 'Filter by column ref, id, or title')
		.option('--offset <n>', 'Offset', (value) => Number(value), 0)
		.option('--limit <n>', 'Page size', (value) => Number(value))
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (options: {
				column?: string;
				offset?: number;
				limit?: number;
				project?: string;
				board?: string;
				json?: boolean;
			}) => {
				await initRuntime();
				const { board, kanban, refs } = await withBoard(options);
				const result = listBoardTasksPaginated(kanban, board.name, {
					columnRef: options.column,
					offset: options.offset,
					limit: options.limit,
					refs
				});

				if (result.error) {
					throw new Error(result.error);
				}

				printResult(
					{ json: Boolean(options.json), quiet: false },
					result,
					result.tasks.map(
						(entry) =>
							`${ui.ref(entry.ref)}  ${entry.title}  ${ui.meta(`[${entry.columnRef} ${entry.columnTitle}]`)}  ${ui.id(entry.id)}`
					)
				);
			}
		);

	task
		.command('get <target>')
		.description('Show one task')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(async (target: string, options: { project?: string; board?: string; json?: boolean }) => {
			await initRuntime();
			const { kanban, refs } = await withBoard(options);
			const found = findTaskByRefOrId(kanban, refs, target);
			if (!found) throw new Error(`Task not found: ${target}`);
			const ref = refs.taskIdToRef.get(found.task.id) || found.task.id;
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ ref, ...found.task, columnId: found.column.id, columnTitle: found.column.title },
				[
					`${ui.ref(ref)}  ${ui.heading(found.task.title)}`,
					found.task.description ? found.task.description : '',
					`${ui.meta('column:')} ${ui.name(found.column.title)} ${ui.id(`(${found.column.id})`)}`,
					`${ui.meta('id:')} ${ui.id(found.task.id)}`
				].filter(Boolean)
			);
		});

	task
		.command('add <title>')
		.description('Add a task')
		.option('--column <ref>', 'Column ref, id, or title')
		.option('--description <text>', 'Task description')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(
			async (
				title: string,
				options: { column?: string; description?: string; project?: string; board?: string }
			) => {
				await initRuntime();
				const { project, board, kanban, refs } = await withBoard(options);
				const column =
					(options.column && findColumnByRefOrTitle(kanban, refs, options.column)) || kanban[0];
				if (!column) throw new Error('No columns on this board.');

				const next: KanbanData = kanban.map((entry) =>
					entry.id === column.id
						? {
								...entry,
								tasks: [
									...entry.tasks,
									{
										id: createId(),
										title,
										description: options.description,
										tags: [],
										createdAt: Date.now(),
										updatedAt: Date.now()
									}
								]
							}
						: entry
				);

				await syncProjectBoard(project.id, board.id, kanban, next);
				console.log(`${ui.success('Added task')} ${ui.name(title)}`);
			}
		);

	task
		.command('update <target>')
		.description('Update a task')
		.option('--title <title>', 'New title')
		.option('--description <text>', 'New description')
		.option('--column <ref>', 'Move to column ref, id, or title')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(
			async (
				target: string,
				options: {
					title?: string;
					description?: string;
					column?: string;
					project?: string;
					board?: string;
				}
			) => {
				await initRuntime();
				const { project, board, kanban, refs } = await withBoard(options);
				const found = findTaskByRefOrId(kanban, refs, target);
				if (!found) throw new Error(`Task not found: ${target}`);

				let next: KanbanData = kanban.map((entry) => ({
					...entry,
					tasks: entry.tasks.map((task) =>
						task.id === found.task.id
							? {
									...task,
									title: options.title ?? task.title,
									description: options.description ?? task.description,
									updatedAt: Date.now()
								}
							: task
					)
				}));

				if (options.column) {
					const destination =
						findColumnByRefOrTitle(next, refs, options.column) ||
						next.find((entry) => entry.id === options.column);
					if (!destination) throw new Error(`Column not found: ${options.column}`);
					next = moveTaskToColumn(next, found.task.id, destination.id);
				}

				await syncProjectBoard(project.id, board.id, kanban, next);
				console.log(ui.success('Updated task'));
			}
		);

	task
		.command('delete <target>')
		.description('Delete a task')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(async (target: string, options: { project?: string; board?: string }) => {
			await initRuntime();
			const { project, board, kanban, refs } = await withBoard(options);
			const found = findTaskByRefOrId(kanban, refs, target);
			if (!found) throw new Error(`Task not found: ${target}`);

			const next = kanban.map((column) => ({
				...column,
				tasks: column.tasks.filter((task) => task.id !== found.task.id)
			}));

			await syncProjectBoard(project.id, board.id, kanban, next);
			console.log(ui.removed('Deleted task'));
		});

	task
		.command('check <target>')
		.description('Toggle task checkbox')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(async (target: string, options: { project?: string; board?: string }) => {
			await initRuntime();
			const { project, board, kanban, refs } = await withBoard(options);
			const found = findTaskByRefOrId(kanban, refs, target);
			if (!found) throw new Error(`Task not found: ${target}`);

			const next = kanban.map((column) => ({
				...column,
				tasks: column.tasks.map((task) =>
					task.id === found.task.id
						? {
								...task,
								hasCheckbox: true,
								checked: !task.checked,
								completedAt: !task.checked ? Date.now() : undefined,
								updatedAt: Date.now()
							}
						: task
				)
			}));

			await syncProjectBoard(project.id, board.id, kanban, next);
			console.log(ui.success('Toggled task checkbox'));
		});
};
