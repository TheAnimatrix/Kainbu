import { createId } from '@kainbu/core';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '$lib/kainbu/constants';
import type { Command } from 'commander';
import type { Column, KanbanData } from '../../../../src/lib/kainbu/types.js';
import { printSuccess, printResult } from '../output.js';
import { integerOption } from '../invocation.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { KainbuError } from '../errors.js';
import { commitBoard, loadBoard, type BoardContext } from './board-context.js';
import { findColumnByRefOrTitle } from './kanban-utils.js';
import { insertAt, parsePlacement, parseTone } from './task-fields.js';
import { taskLine } from './task.js';

type ColumnOptions = {
	project?: string;
	board?: string;
	title?: string;
	color?: string;
	width?: number;
	position?: string;
	dryRun?: boolean;
	force?: boolean;
	moveTasksTo?: string;
	json?: boolean;
};

const requireTitle = (title: string) => {
	if (!title.trim())
		throw new KainbuError('Column title cannot be empty.', {
			code: 'invalid_arguments',
			exitCode: 2
		});
	return title;
};

const widthOption = integerOption(MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
const target = (cmd: Command) =>
	cmd
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--dry-run', 'Validate and preview the change without writing');

const done = (
	ctx: BoardContext,
	next: KanbanData,
	id: string,
	options: ColumnOptions,
	message: string,
	extra: Record<string, unknown> = {}
) => {
	const column = next.find((entry) => entry.id === id);
	printSuccess(
		{
			id,
			projectId: ctx.project.id,
			boardId: ctx.board.id,
			...(column ? { title: column.title, color: column.color, width: column.width } : {}),
			...(options.dryRun ? { dryRun: true } : {}),
			...extra
		},
		(options.dryRun ? 'Preview: ' : '') + message
	);
};

const liveCount = (column: Column) => column.tasks.length;

export const registerColumnCommands = (program: Command) => {
	const column = program.command('column').alias('c').description('Manage board columns');

	column
		.command('list [board]')
		.description('List columns. [board] lists any board without making it active.')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(async (boardArg: string | undefined, options: ColumnOptions) => {
			await initRuntime();
			const { live, refs } = await loadBoard({ ...options, board: boardArg ?? options.board });
			const rows = live.map((entry) => ({
				ref: refs.columnIdToRef.get(entry.id) || entry.id,
				id: entry.id,
				title: entry.title,
				color: entry.color,
				width: entry.width,
				taskCount: liveCount(entry)
			}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.length
					? rows.map(
							(row) =>
								`${ui.ref(row.ref)}  ${ui.name(row.title)}  ${ui.meta(`(${row.taskCount} tasks)`)}  ${ui.id(row.id)}`
						)
					: [ui.meta('No columns.')]
			);
		});

	column
		.command('get <target>')
		.description('Show a column and its tasks')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(async (value: string, options: ColumnOptions) => {
			await initRuntime();
			const ctx = await loadBoard(options);
			const found = findColumnByRefOrTitle(ctx.live, ctx.refs, value);
			const ref = ctx.refs.columnIdToRef.get(found.id) || found.id;
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{
					ref,
					id: found.id,
					title: found.title,
					color: found.color,
					width: found.width,
					projectId: ctx.project.id,
					boardId: ctx.board.id,
					taskCount: liveCount(found),
					tasks: found.tasks.map((task) => ({
						ref: ctx.refs.taskIdToRef.get(task.id),
						id: task.id,
						title: task.title,
						checked: Boolean(task.checked)
					}))
				},
				[
					`${ui.ref(ref)}  ${ui.heading(found.title)}  ${ui.meta(`(${liveCount(found)} tasks)`)}  ${ui.id(found.id)}`,
					...(found.color ? [`${ui.meta('color')}  ${found.color.replace('tone:', '')}`] : []),
					...found.tasks.map(
						(task) =>
							`  ${ui.ref(ctx.refs.taskIdToRef.get(task.id) || task.id)}  ${taskLine(ctx.project, task)}`
					)
				]
			);
		});

	target(column.command('add <title>').description('Add a column'))
		.option('--color <tone>', 'Column color (red, blue, …) or none')
		.option('--width <px>', `Column width (${MIN_COLUMN_WIDTH}-${MAX_COLUMN_WIDTH})`, widthOption)
		.option('--position <where>', 'top (first), bottom (last, default), or a 1-based position')
		.action(async (title: string, options: ColumnOptions) => {
			await initRuntime();
			requireTitle(title);
			const ctx = await loadBoard(options, { exact: true });
			const created: Column = {
				id: createId(),
				title,
				...(options.color !== undefined ? { color: parseTone(options.color, 'column color') } : {}),
				...(options.width !== undefined ? { width: options.width } : {}),
				tasks: []
			};
			const next = insertAt(
				ctx.live,
				created,
				options.position ? parsePlacement(options.position) : 'bottom'
			);
			await commitBoard(ctx, next, options.dryRun);
			done(ctx, next, created.id, options, `${ui.success('Added column')} ${ui.name(title)}`);
		});

	target(column.command('update <target>').description('Change a column title, color, or width'))
		.option('--title <title>', 'New title')
		.option('--color <tone>', 'Column color (red, blue, …) or none')
		.option('--width <px>', `Column width (${MIN_COLUMN_WIDTH}-${MAX_COLUMN_WIDTH})`, widthOption)
		.action(async (value: string, options: ColumnOptions) => {
			await initRuntime();
			if ([options.title, options.color, options.width].every((field) => field === undefined))
				throw new KainbuError('Provide --title, --color, or --width.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			if (options.title !== undefined) requireTitle(options.title);
			const ctx = await loadBoard(options, { exact: true });
			const found = findColumnByRefOrTitle(ctx.live, ctx.refs, value, { exact: true });
			const next = ctx.live.map((entry) =>
				entry.id === found.id
					? {
							...entry,
							title: options.title ?? entry.title,
							color:
								options.color !== undefined
									? parseTone(options.color, 'column color')
									: entry.color,
							width: options.width ?? entry.width
						}
					: entry
			);
			await commitBoard(ctx, next, options.dryRun);
			done(
				ctx,
				next,
				found.id,
				options,
				`${ui.success('Updated column')} ${ui.name(options.title ?? found.title)}`
			);
		});

	target(column.command('move <target>').description('Reorder a column on its board'))
		.requiredOption('--position <where>', 'top (first), bottom (last), or a 1-based position')
		.action(async (value: string, options: ColumnOptions) => {
			await initRuntime();
			const ctx = await loadBoard(options, { exact: true });
			const found = findColumnByRefOrTitle(ctx.live, ctx.refs, value, { exact: true });
			const next = insertAt(
				ctx.live.filter((entry) => entry.id !== found.id),
				found,
				parsePlacement(options.position!)
			);
			if (JSON.stringify(next) !== JSON.stringify(ctx.live))
				await commitBoard(ctx, next, options.dryRun);
			done(
				ctx,
				next,
				found.id,
				options,
				`${ui.success('Moved column')} ${ui.name(found.title)} ${ui.meta(`to position ${next.findIndex((entry) => entry.id === found.id) + 1}`)}`
			);
		});

	target(column.command('delete <target>').description('Delete a column'))
		.option('--move-tasks-to <column>', 'Move its tasks to this column first')
		.option('--force', 'Delete its tasks too, with their comments and attachments (permanent)')
		.action(async (value: string, options: ColumnOptions) => {
			await initRuntime();
			const ctx = await loadBoard(options, { exact: true });
			const found = findColumnByRefOrTitle(ctx.live, ctx.refs, value, { exact: true });
			let next = ctx.live;
			const count = liveCount(found);
			if (options.moveTasksTo !== undefined) {
				const destination = findColumnByRefOrTitle(ctx.live, ctx.refs, options.moveTasksTo, {
					exact: true
				});
				if (destination.id === found.id)
					throw new KainbuError('--move-tasks-to must name a different column.', {
						code: 'invalid_arguments',
						exitCode: 2
					});
				next = next.map((entry) =>
					entry.id === destination.id
						? { ...entry, tasks: [...entry.tasks, ...found.tasks] }
						: entry
				);
			} else if (count && !options.force)
				throw new KainbuError(
					`Column "${found.title}" has ${count} task${count === 1 ? '' : 's'}.`,
					{
						code: 'invalid_arguments',
						exitCode: 2,
						hint: 'Pass --move-tasks-to <column> to keep them, or --force to delete them permanently.'
					}
				);
			next = next.filter((entry) => entry.id !== found.id);
			await commitBoard(ctx, next, options.dryRun);
			done(
				ctx,
				next,
				found.id,
				options,
				`${ui.removed('Deleted column')} ${ui.name(found.title)}${
					options.moveTasksTo !== undefined && count ? ui.meta(` (moved ${count} tasks)`) : ''
				}`,
				{ deleted: true, ...(options.moveTasksTo === undefined ? { deletedTasks: count } : {}) }
			);
		});
};
