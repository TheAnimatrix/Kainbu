import { createId, listBoardTasksPaginated } from '@kainbu/core';
import { syncProjectBoard } from '../writes.js';
import type { Command } from 'commander';
import type { KanbanData, Task } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printResult, type OutputMode } from '../output.js';
import { ui } from '../color.js';
import { KainbuError } from '../errors.js';
import { initRuntime } from '../runtime.js';
import {
	buildBoardRefIndex,
	findColumnByRefOrTitle,
	findTaskByRefOrId,
	moveTaskToColumn,
	resolveColumnRef
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
			throw new KainbuError(`Unknown filter "${pred}".`, { hint: 'Supported filters: has_content' });
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
		const refs = buildBoardRefIndex(kanban, ctx.board.name);
		return { ...ctx, kanban, refs };
	};

	task
		.command('list [board]')
		.description('List tasks (paginated). [board] lists any board without making it active.')
		.option('--column <ref>', 'Filter by column ref, id, or title')
		.option('--with <columns>', 'Only these columns (comma-separated ref/id/title)')
		.option('--without <columns>', 'Hide these columns (comma-separated ref/id/title)')
		.option('--sort <field>', 'Sort within columns: created|modified|title (prefix + asc, - desc)')
		.option('--filter <preds>', 'Filter tasks (comma-separated). Supported: has_content')
		.option('--offset <n>', 'Offset', (value) => Number(value), 0)
		.option('--limit <n>', 'Page size', (value) => Number(value))
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
					offset?: number;
					limit?: number;
					project?: string;
					board?: string;
					json?: boolean;
				}
			) => {
				await initRuntime();
				const { board, kanban, refs } = await withBoard({
					...options,
					board: boardArg ?? options.board
				});
				const sort = parseSortSpec(options.sort);
				const { hasContent } = parseTaskFilters(options.filter);
				// Default to listing every task — the CLI works off an in-memory
				// snapshot, so a 15-row default page would silently hide tasks.
				// `--limit`/`--offset` opt back into pagination.
				const paginated = options.limit !== undefined || (options.offset ?? 0) > 0;
				const result = listBoardTasksPaginated(kanban, board.name, {
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
					throw new Error(result.error);
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
						lines.push(
							`${ui.ref(entry.columnRef)} ${ui.heading(ui.name(entry.columnTitle))}`
						);
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
						ui.meta(`… ${result.total - shown} more — use --offset ${result.nextOffset} (or --limit)`)
					);
				}

				printResult({ json: Boolean(options.json), quiet: false }, result, lines);
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
								// Prepend so the new task lands at the top of the column.
								tasks: [
									{
										id: createId(),
										title,
										description: options.description,
										tags: [],
										createdAt: Date.now(),
										updatedAt: Date.now()
									},
									...entry.tasks
								]
							}
						: entry
				);

				await syncProjectBoard(project.id, board.id, kanban, next);
				console.log(
					`${ui.success('Added task')} ${ui.name(title)} ${ui.meta('to column')} ${ui.name(column.title)} ${ui.meta('of board')} ${ui.name(board.name)}`
				);
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
