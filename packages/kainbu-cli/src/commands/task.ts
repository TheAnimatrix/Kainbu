import { createId, listBoardTasksPaginated } from '@kainbu/core';
import { syncProjectBoard } from '../writes.js';
import type { Command } from 'commander';
import type { KanbanData, Task } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printResult, printSuccess } from '../output.js';
import { ui } from '../color.js';
import { KainbuError } from '../errors.js';
import { readInput } from '../input.js';
import { booleanOption, integerOption } from '../invocation.js';
import { revisionOf, assertRevision } from '../revision.js';
import { initRuntime } from '../runtime.js';
import {
	buildBoardRefIndex,
	findColumnByRefOrTitle,
	findTaskByRefOrId,
	moveTaskToColumn
} from './kanban-utils.js';

const splitCsv = (value?: string) =>
	(value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);

/** Parses `--sort` specs like `+date`, `-modified`, `title`. */
const parseSortSpec = (
	value?: string
): { field: 'created' | 'modified' | 'title'; dir: 'asc' | 'desc' } | undefined => {
	if (!value || !value.trim()) return undefined;
	let raw = value.trim();
	let dir: 'asc' | 'desc' = 'asc';
	if (raw.startsWith('+')) raw = raw.slice(1);
	else if (raw.startsWith('-')) {
		dir = 'desc';
		raw = raw.slice(1);
	}
	const key = raw.toLowerCase().replace(/[-_]/g, '');
	const field =
		key === 'created' || key === 'createdat' || key === 'date'
			? 'created'
			: key === 'modified' || key === 'modifiedat' || key === 'updated' || key === 'updatedat'
				? 'modified'
				: key === 'title' || key === 'name'
					? 'title'
					: null;
	if (!field) {
		throw new KainbuError(`Unknown sort field "${raw}".`, {
			code: 'invalid_arguments',
			exitCode: 2,
			hint: 'Use created, modified, or title — prefix + for ascending, - for descending.'
		});
	}
	return { field, dir };
};

/** Parses `--filter` predicates like `has_content`. */
const parseTaskFilters = (value?: string): { hasContent?: boolean } => {
	const result: { hasContent?: boolean } = {};
	for (const pred of splitCsv(value)) {
		const key = pred.toLowerCase().replace(/[-_]/g, '');
		if (key === 'hascontent' || key === 'content') result.hasContent = true;
		else {
			throw new KainbuError(`Unknown filter "${pred}".`, {
				code: 'invalid_arguments',
				exitCode: 2,
				hint: 'Supported filters: has_content'
			});
		}
	}
	return result;
};

export const registerTaskCommands = (program: Command) => {
	const task = program.command('task').alias('t').description('Manage tasks');

	// The workspace snapshot already carries each board's full kanbanData
	// (columns + tasks), so reads come straight from it — no extra round trip
	// and no direct PocketBase dependency (which API-key auth doesn't have).
	const withBoard = async (options: { project?: string; board?: string }) => {
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

	const registerList = (parent: Command, name: string) =>
		parent
			.command(name)
			.description('List tasks (paginated). [board] lists any board without making it active.')
			.option('--column <ref>', 'Filter by column ref, id, or title')
			.option('--with <columns>', 'Only these columns (comma-separated ref/id/title)')
			.option('--without <columns>', 'Hide these columns (comma-separated ref/id/title)')
			.option(
				'--sort <field>',
				'Sort within columns: created|modified|title (prefix + asc, - desc)'
			)
			.option('--filter <preds>', 'Filter tasks (comma-separated). Supported: has_content')
			.option('--checked <boolean>', 'Filter completed (true) or open (false) tasks', booleanOption)
			.option('--offset <n>', 'Offset', integerOption(0), 0)
			.option('--limit <n>', 'Page size (maximum 50)', integerOption(1, 50))
			.option('--project <id|name>', 'Project override')
			.option('--board <id|name>', 'Board override')
			.option('--json', 'Print JSON')
			.action(
				async (
					boardArg: string | undefined,
					options: {
						column?: string;
						with?: string;
						without?: string;
						sort?: string;
						filter?: string;
						checked?: boolean;
						offset?: number;
						limit?: number;
						project?: string;
						board?: string;
						json?: boolean;
					}
				) => {
					await initRuntime();
					const { project, board, kanban, refs } = await withBoard({
						...options,
						board: boardArg ?? options.board
					});
					const sort = parseSortSpec(options.sort);
					const { hasContent } = parseTaskFilters(options.filter);
					// Default to listing every task — the CLI works off an in-memory
					// snapshot, so a 15-row default page would silently hide tasks.
					// `--limit`/`--offset` opt back into pagination.
					const paginated = options.limit !== undefined || (options.offset ?? 0) > 0;
					const visible = kanban.map((column) => ({
						...column,
						tasks: column.tasks.filter(
							(task) =>
								!task.deletedAt &&
								(options.checked === undefined || Boolean(task.checked) === options.checked)
						)
					}));
					const result = listBoardTasksPaginated(visible, board.name, {
						columnRef: options.column,
						includeColumns: splitCsv(options.with),
						excludeColumns: splitCsv(options.without),
						hasContent,
						sort,
						offset: options.offset,
						limit: options.limit,
						unbounded: !paginated,
						refs
					});

					if (result.error) {
						throw new KainbuError(result.error, { code: 'invalid_arguments', exitCode: 2 });
					}

					// Human output groups tasks under a tone-colored column header and
					// renders the checkbox for checkable tasks. Checkbox/checked state
					// isn't on the paginated row, so look it up from the full kanban.
					const taskById = new Map<string, Task>();
					for (const column of kanban) {
						for (const t of column.tasks) taskById.set(t.id, t);
					}

					const lines: string[] = [];
					let currentColumnRef: string | null = null;
					for (const entry of result.tasks) {
						if (entry.columnRef !== currentColumnRef) {
							currentColumnRef = entry.columnRef;
							lines.push(`${ui.ref(entry.columnRef)} ${ui.heading(ui.name(entry.columnTitle))}`);
						}
						const task = taskById.get(entry.id);
						const checkbox = task?.hasCheckbox
							? `${task.checked ? ui.active('[x]') : ui.meta('[ ]')} `
							: '';
						const title = task?.checked ? ui.meta(entry.title) : entry.title;
						lines.push(`  ${ui.ref(entry.ref)}  ${checkbox}${title}  ${ui.id(entry.id)}`);
					}

					if (!result.tasks.length) {
						lines.push(ui.meta('No tasks.'));
					}
					if (result.hasMore) {
						const shown = (options.offset ?? 0) + result.tasks.length;
						lines.push(
							ui.meta(
								`… ${result.total - shown} more — use --offset ${result.nextOffset} (or --limit)`
							)
						);
					}

					const payload = {
						...result,
						projectId: project.id,
						boardId: board.id,
						tasks: result.tasks.map((entry) => {
							const task = taskById.get(entry.id)!;
							const columnId = kanban.find((column) =>
								column.tasks.some((task) => task.id === entry.id)
							)!.id;
							return {
								...entry,
								columnId,
								checked: Boolean(task.checked),
								hasCheckbox: Boolean(task.hasCheckbox),
								createdAt: task.createdAt,
								updatedAt: task.updatedAt,
								completedAt: task.completedAt,
								countdownAt: task.countdownAt,
								assignedTo: task.assignedTo,
								tags: task.tags,
								revision: revisionOf({ task, columnId })
							};
						})
					};
					printResult({ json: Boolean(options.json), quiet: false }, payload, lines);
				}
			);

	registerList(task, 'list [board]');
	registerList(program, 'ls [board]');

	task
		.command('get <target>')
		.description('Show one task')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (target: string, options: { project?: string; board?: string; json?: boolean }) => {
				await initRuntime();
				const { project, board, kanban, refs } = await withBoard(options);
				const found = findTaskByRefOrId(kanban, refs, target);
				if (!found)
					throw new KainbuError(`Task not found: ${target}`, { code: 'not_found', exitCode: 4 });
				const ref = refs.taskIdToRef.get(found.task.id) || found.task.id;
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{
						ref,
						...found.task,
						projectId: project.id,
						boardId: board.id,
						columnId: found.column.id,
						columnTitle: found.column.title,
						revision: revisionOf({ task: found.task, columnId: found.column.id })
					},
					[
						`${ui.ref(ref)}  ${ui.heading(found.task.title)}`,
						found.task.description ? found.task.description : '',
						`${ui.meta('column:')} ${ui.name(found.column.title)} ${ui.id(`(${found.column.id})`)}`,
						`${ui.meta('id:')} ${ui.id(found.task.id)}`
					].filter(Boolean)
				);
			}
		);

	type WriteOptions = {
		project?: string;
		board?: string;
		column?: string;
		title?: string;
		description?: string;
		descriptionFile?: string;
		checked?: boolean;
		ifMatch?: string;
		dryRun?: boolean;
	};
	const writeOptions = (cmd: Command) =>
		cmd
			.option('--project <id|name>', 'Project override')
			.option('--board <id|name>', 'Board override')
			.option('--dry-run', 'Validate and preview the proposed task change without writing');
	const contentOptions = (cmd: Command) =>
		cmd
			.option('--description <text>', 'Task description')
			.option('--description-file <path>', 'Description file (- for stdin)')
			.option('--column <ref>', 'Column ref, id, or unique title')
			.option('--checked <boolean>', 'Set completion explicitly: true or false', booleanOption);
	const descriptionFrom = async (options: WriteOptions) => {
		if (options.description !== undefined && options.descriptionFile !== undefined)
			throw new KainbuError('Use only one of --description and --description-file.', {
				code: 'invalid_arguments',
				exitCode: 2
			});
		return options.descriptionFile !== undefined
			? readInput(options.descriptionFile)
			: options.description;
	};
	const checkedPatch = (task: Task, checked: boolean | undefined) =>
		checked === undefined || (task.hasCheckbox && Boolean(task.checked) === checked)
			? {}
			: { hasCheckbox: true, checked, completedAt: checked ? Date.now() : undefined };
	const commit = async (
		ctx: Awaited<ReturnType<typeof withBoard>>,
		next: KanbanData,
		id: string,
		options: WriteOptions,
		message: string
	) => {
		if (!options.dryRun) await syncProjectBoard(ctx.project.id, ctx.board.id, ctx.kanban, next);
		const found = findTaskByRefOrId(next, ctx.refs, id);
		printSuccess(
			{
				id,
				projectId: ctx.project.id,
				boardId: ctx.board.id,
				...(options.dryRun ? { dryRun: true } : {}),
				...(found ? { task: found.task, columnId: found.column.id } : { deleted: true })
			},
			options.dryRun ? 'Preview: ' + message : message
		);
	};

	contentOptions(
		writeOptions(task.command('add <title>').description('Add a task and return its stable ID'))
	).action(async (title: string, options: WriteOptions) => {
		if (!title.trim())
			throw new KainbuError('Title cannot be empty.', { code: 'invalid_arguments', exitCode: 2 });
		const description = await descriptionFrom(options);
		const ctx = await withBoard(options);
		const column =
			options.column !== undefined
				? findColumnByRefOrTitle(ctx.kanban, ctx.refs, options.column)
				: ctx.kanban[0];
		if (!column)
			throw new KainbuError('No columns on this board.', { code: 'not_found', exitCode: 4 });
		const created: Task = {
			id: createId(),
			title,
			description,
			tags: [],
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		Object.assign(created, checkedPatch(created, options.checked));
		const next = ctx.kanban.map((entry) =>
			entry.id === column.id ? { ...entry, tasks: [created, ...entry.tasks] } : entry
		);
		await commit(ctx, next, created.id, options, 'Added task ' + title);
	});

	for (const operation of ['update', 'delete', 'check'] as const) {
		const cmd = writeOptions(
			task
				.command(operation + ' <target>')
				.description(
					operation === 'check'
						? 'Toggle checkbox; use --checked true|false for repeatable writes'
						: operation + ' a task'
				)
		).option('--if-match <revision>', 'Require the revision returned by task get/list');
		if (operation === 'update') contentOptions(cmd.option('--title <title>', 'New title'));
		if (operation === 'check')
			cmd.option(
				'--checked <boolean>',
				'Set completion explicitly instead of toggling',
				booleanOption
			);
		cmd.action(async (target: string, options: WriteOptions) => {
			const description = await descriptionFrom(options);
			if (options.title !== undefined && !options.title.trim())
				throw new KainbuError('Title cannot be empty.', { code: 'invalid_arguments', exitCode: 2 });
			if (
				operation === 'update' &&
				[options.title, description, options.column, options.checked].every((v) => v === undefined)
			)
				throw new KainbuError('Provide a field to update.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const ctx = await withBoard(options);
			const found = findTaskByRefOrId(ctx.kanban, ctx.refs, target);
			if (!found)
				throw new KainbuError('Task not found: ' + target, { code: 'not_found', exitCode: 4 });
			assertRevision(options.ifMatch, { task: found.task, columnId: found.column.id });
			let next: KanbanData;
			if (operation === 'delete')
				next = ctx.kanban.map((column) => ({
					...column,
					tasks: column.tasks.filter((task) => task.id !== found.task.id)
				}));
			else {
				const checked =
					operation === 'check' ? (options.checked ?? !found.task.checked) : options.checked;
				const updated = {
					...found.task,
					title: options.title ?? found.task.title,
					description: description ?? found.task.description,
					...checkedPatch(found.task, checked)
				};
				const destination =
					options.column !== undefined
						? findColumnByRefOrTitle(ctx.kanban, ctx.refs, options.column)
						: found.column;
				const changed =
					revisionOf(updated) !== revisionOf(found.task) || destination.id !== found.column.id;
				if (changed) updated.updatedAt = Date.now();
				next = ctx.kanban.map((column) => ({
					...column,
					tasks: column.tasks.map((task) => (task.id === found.task.id ? updated : task))
				}));
				if (destination.id !== found.column.id)
					next = moveTaskToColumn(next, found.task.id, destination.id);
				if (!changed) {
					printSuccess(
						{
							id: found.task.id,
							projectId: ctx.project.id,
							boardId: ctx.board.id,
							unchanged: true,
							...(options.dryRun ? { dryRun: true } : {}),
							task: found.task,
							columnId: found.column.id
						},
						'Task already has the requested values.'
					);
					return;
				}
			}
			await commit(
				ctx,
				next,
				found.task.id,
				options,
				operation === 'delete' ? 'Deleted task' : 'Updated task'
			);
		});
	}
};
