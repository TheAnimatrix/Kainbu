import { buildBoardRefIndex, createId, listBoardTasksPaginated } from '@kainbu/core';
import { resolveCheckedMoveTargetColumnId } from '$lib/kainbu/boardPreferences';
import {
	addBidirectionalLink,
	purgeTaskLinks,
	removeBidirectionalLink
} from '$lib/kainbu/taskLinks';
import { hasLeadingCardCheckboxLine, syncLeadingCardCheckboxLine } from '$lib/kainbu/taskMarkdown';
import { clearTaskDueAt, getTaskDueAt, setTaskDueAt } from '$lib/kainbu/timing';
import type { Command } from 'commander';
import type { Column, KanbanData, Task } from '../../../../src/lib/kainbu/types.js';
import { printResult, printSuccess } from '../output.js';
import { ui } from '../color.js';
import { KainbuError } from '../errors.js';
import { readInput } from '../input.js';
import { booleanOption, integerOption } from '../invocation.js';
import { resolveContext } from '../context.js';
import { initRuntime } from '../runtime.js';
import {
	createTaskComment,
	deleteTaskComment,
	listTaskComments,
	moveTasksToBoard
} from '../writes.js';
import { registerAssetCommands } from './assets.js';
import { commitBoard, loadBoard, type BoardContext } from './board-context.js';
import { findColumnByRefOrTitle, findTaskByRefOrId } from './kanban-utils.js';
import { resolveByIdOrName, splitCsv } from './shared.js';
import {
	assertTaskRevision,
	buildTags,
	formatDue,
	insertAt,
	matchesDue,
	memberLabel,
	parseDue,
	parseDueFilter,
	parsePlacement,
	parseTagList,
	parseTone,
	removeTags,
	resolveMember,
	taskRevision,
	type Placement
} from './task-fields.js';

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

export type TaskFilterOptions = {
	checked?: boolean;
	tag?: string;
	assignee?: string;
	due?: string;
	search?: string;
};

/** Task predicates shared by `task list` and `task find`. Assignee `none` means unassigned. */
export const buildTaskFilter = async (
	project: BoardContext['project'] | BoardContext['project'][],
	options: TaskFilterOptions
) => {
	const tags = parseTagList(options.tag).map((tag) => tag.toLowerCase());
	const due = parseDueFilter(options.due);
	const search = options.search?.trim().toLowerCase();
	const assignee =
		options.assignee === undefined
			? undefined
			: options.assignee.trim().toLowerCase() === 'none'
				? null
				: (await resolveMember(project, options.assignee)).userId;
	return (task: Task) =>
		(options.checked === undefined || Boolean(task.checked) === options.checked) &&
		(!tags.length || task.tags.some((tag) => tags.includes(tag.label.toLowerCase()))) &&
		(assignee === undefined ||
			(assignee === null ? !task.assignedTo : task.assignedTo === assignee)) &&
		(!due || matchesDue(task, due)) &&
		(!search ||
			task.title.toLowerCase().includes(search) ||
			Boolean(task.description?.toLowerCase().includes(search)));
};

export const taskSummaryFields = (project: BoardContext['project'], task: Task) => {
	const due = getTaskDueAt(task);
	return {
		checked: Boolean(task.checked),
		hasCheckbox: Boolean(task.hasCheckbox),
		createdAt: task.createdAt,
		updatedAt: task.updatedAt,
		completedAt: task.completedAt,
		dueAt: due ?? undefined,
		countdownAt: task.countdownAt,
		assignedTo: task.assignedTo,
		assignee: memberLabel(project, task.assignedTo),
		tags: task.tags,
		color: task.color,
		linkedTaskIds: task.linkedTaskIds?.length ? task.linkedTaskIds : undefined
	};
};

/** One-line human summary: checkbox, title, tags, assignee, due date. */
export const taskLine = (project: BoardContext['project'], task: Task) => {
	const checkbox = task.hasCheckbox ? `${task.checked ? ui.active('[x]') : ui.meta('[ ]')} ` : '';
	const title = task.checked ? ui.meta(task.title) : task.title;
	const due = getTaskDueAt(task);
	const extras = [
		...task.tags.map((tag) => ui.meta(`#${tag.label}`)),
		task.assignedTo ? ui.name(memberLabel(project, task.assignedTo)!) : '',
		due ? ui.meta(`due ${formatDue(due)}`) : ''
	].filter(Boolean);
	return `${checkbox}${title}${extras.length ? '  ' + extras.join(' ') : ''}`;
};

const mapTasks = (kanban: KanbanData, taskId: string, update: (task: Task) => Task) =>
	kanban.map((column) => ({
		...column,
		tasks: column.tasks.map((task) => (task.id === taskId ? update(task) : task))
	}));

const locate = (kanban: KanbanData, taskId: string) => {
	for (const column of kanban) {
		const task = column.tasks.find((entry) => entry.id === taskId);
		if (task) return { column, task };
	}
	return null;
};

/** Moves a task to `columnId` at `placement`, removing it from its current column. */
const placeTask = (
	kanban: KanbanData,
	taskId: string,
	columnId: string,
	placement: Placement
): KanbanData => {
	const found = locate(kanban, taskId)!;
	return kanban
		.map((column) => ({
			...column,
			tasks: column.tasks.filter((task) => task.id !== taskId)
		}))
		.map((column) =>
			column.id === columnId
				? { ...column, tasks: insertAt(column.tasks, found.task, placement) }
				: column
		);
};

/** Completion state as the board sets it, including the checkbox line in a title. */
const withCompletion = (task: Task, checked: boolean): Task =>
	Boolean(task.checked) === checked && task.hasCheckbox
		? task
		: {
				...task,
				title:
					task.hasCheckbox && hasLeadingCardCheckboxLine(task.title || '')
						? syncLeadingCardCheckboxLine(task.title || '', checked)
						: task.title,
				hasCheckbox: true,
				checked,
				completedAt: checked ? Date.now() : undefined
			};

const describeTargets = (ctx: BoardContext, targets: string[]) => {
	const seen = new Set<string>();
	return targets.map((target) => {
		const found = findTaskByRefOrId(ctx.live, ctx.refs, target);
		if (!found)
			throw new KainbuError(`Task not found: ${target}`, {
				code: 'not_found',
				exitCode: 4,
				hint: 'Run: kainbu task list (trashed tasks: kainbu task list --deleted)'
			});
		if (seen.has(found.task.id))
			throw new KainbuError(`Task listed twice: ${target}`, {
				code: 'invalid_arguments',
				exitCode: 2
			});
		seen.add(found.task.id);
		return found;
	});
};

type WriteOptions = {
	project?: string;
	board?: string;
	column?: string;
	position?: string;
	title?: string;
	description?: string;
	descriptionFile?: string;
	checked?: boolean;
	checkbox?: boolean;
	tag?: string;
	addTag?: string;
	removeTag?: string;
	tagColor?: string;
	assign?: string;
	due?: string;
	color?: string;
	link?: string;
	unlink?: string;
	ifMatch?: string;
	dryRun?: boolean;
	toBoard?: string;
};

const writeOptions = (cmd: Command) =>
	cmd
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--dry-run', 'Validate and preview the change without writing');

const fieldOptions = (cmd: Command) =>
	cmd
		.option('--description <text>', 'Task description (markdown)')
		.option('--description-file <path>', 'Description file (- for stdin)')
		.option('--column <ref>', 'Column ref, id, or exact title')
		.option('--position <where>', 'top, bottom, or a 1-based position in the column')
		.option('--checked <boolean>', 'Set completion explicitly: true or false', booleanOption)
		.option('--checkbox <boolean>', 'Show or hide the checkbox', booleanOption)
		.option('--assign <user>', 'Assign to a project member: me, @username, email, id, or none')
		.option('--due <when>', 'Due date: YYYY-MM-DD, ISO time, today, tomorrow, 3d, 12h, or none')
		.option('--color <tone>', 'Card color (red, blue, …) or none')
		.option('--tag <labels>', 'Set tags (comma-separated); replaces existing tags on update')
		.option('--tag-color <tone>', 'Color for newly created tags (default: reuse the board color)')
		.option('--link <tasks>', 'Link to tasks on this board (comma-separated refs or ids)');

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

/** Field edits shared by add and update; returns the edited task. */
const applyFields = async (
	ctx: BoardContext,
	task: Task,
	options: WriteOptions,
	description: string | undefined
): Promise<Task> => {
	let next: Task = { ...task };
	if (options.title !== undefined) next.title = options.title;
	if (description !== undefined) next.description = description;
	if (options.color !== undefined) next.color = parseTone(options.color);
	if (options.checkbox !== undefined) {
		next.hasCheckbox = options.checkbox;
		if (!options.checkbox) next = { ...next, checked: false, completedAt: undefined };
	}
	if (options.checked !== undefined) next = withCompletion(next, options.checked);
	if (options.assign !== undefined)
		next.assignedTo =
			options.assign.trim().toLowerCase() === 'none'
				? undefined
				: (await resolveMember(ctx.project, options.assign)).userId;
	if (options.due !== undefined) {
		const due = parseDue(options.due);
		next = due === null ? clearTaskDueAt(next) : setTaskDueAt(next, due);
	}
	const tagColor =
		options.tagColor !== undefined ? parseTone(options.tagColor, 'tag color') : undefined;
	const boardTags = ctx.live.flatMap((column) => column.tasks.flatMap((entry) => entry.tags));
	if (options.tag !== undefined)
		next.tags = buildTags(
			parseTagList(options.tag),
			next.tags.filter((tag) =>
				parseTagList(options.tag).some((label) => label.toLowerCase() === tag.label.toLowerCase())
			),
			boardTags,
			tagColor
		);
	if (options.addTag !== undefined)
		next.tags = buildTags(parseTagList(options.addTag), next.tags, boardTags, tagColor);
	if (options.removeTag !== undefined)
		next.tags = removeTags(next.tags, parseTagList(options.removeTag));
	return next;
};

const applyLinks = (
	ctx: BoardContext,
	kanban: KanbanData,
	taskId: string,
	options: WriteOptions
) => {
	let next = kanban;
	for (const [value, link] of [
		[options.link, true],
		[options.unlink, false]
	] as const) {
		for (const target of splitCsv(value)) {
			const other = findTaskByRefOrId(ctx.live, ctx.refs, target);
			if (!other)
				throw new KainbuError(`Task to link not found on this board: ${target}`, {
					code: 'not_found',
					exitCode: 4
				});
			next = link
				? addBidirectionalLink(next, taskId, other.task.id)
				: removeBidirectionalLink(next, taskId, other.task.id);
		}
	}
	return next;
};

/** Stamps `updatedAt` on tasks whose content changed, for local output only. */
const stampChanged = (before: KanbanData, after: KanbanData) => {
	const previous = new Map(
		before.flatMap((column) => column.tasks.map((task) => [task.id, { task, column: column.id }]))
	);
	const now = Date.now();
	return after.map((column) => ({
		...column,
		tasks: column.tasks.map((task) => {
			const old = previous.get(task.id);
			return old && taskRevision(old.task, old.column) === taskRevision(task, column.id)
				? task
				: { ...task, updatedAt: now };
		})
	}));
};

const resultFor = (ctx: BoardContext, kanban: KanbanData, ids: string[]) =>
	ids.map((id) => {
		const found = locate(kanban, id);
		return found
			? {
					id,
					task: found.task,
					columnId: found.column.id,
					revision: taskRevision(found.task, found.column.id)
				}
			: { id, deleted: true };
	});

const report = (
	ctx: BoardContext,
	nextLive: KanbanData,
	ids: string[],
	options: WriteOptions,
	message: string,
	extra: Record<string, unknown> = {}
) => {
	const results = resultFor(ctx, nextLive, ids);
	printSuccess(
		{
			...(ids.length === 1 ? results[0] : { ids, tasks: results }),
			projectId: ctx.project.id,
			boardId: ctx.board.id,
			...(options.dryRun ? { dryRun: true } : {}),
			...extra
		},
		(options.dryRun ? 'Preview: ' : '') + message
	);
};

const unchanged = (ctx: BoardContext, ids: string[], options: WriteOptions) =>
	report(ctx, ctx.live, ids, options, 'Task already has the requested values.', {
		unchanged: true
	});

export const registerTaskCommands = (program: Command) => {
	const task = program.command('task').alias('t').description('Manage tasks');

	const registerList = (parent: Command, name: string) =>
		parent
			.command(name)
			.description('List tasks. [board] lists any board without making it active.')
			.option('--column <ref>', 'Filter by column ref, id, or title')
			.option('--with <columns>', 'Only these columns (comma-separated ref/id/title)')
			.option('--without <columns>', 'Hide these columns (comma-separated ref/id/title)')
			.option(
				'--sort <field>',
				'Sort within columns: created|modified|title (prefix + asc, - desc)'
			)
			.option('--filter <preds>', 'Filter tasks (comma-separated). Supported: has_content')
			.option('--checked <boolean>', 'Filter completed (true) or open (false) tasks', booleanOption)
			.option('--tag <labels>', 'Tasks with any of these tags (comma-separated)')
			.option('--assignee <user>', 'Tasks assigned to me, @username, email, id, or none')
			.option('--due <when>', 'Due filter: overdue, today, week, none, or any')
			.option('--search <text>', 'Text in the title or description')
			.option('--deleted', 'List trashed tasks instead (restore with task restore)')
			.option('--offset <n>', 'Skip this many tasks', integerOption(0), 0)
			.option('--limit <n>', 'Page size (maximum 50)', integerOption(1, 50))
			.option('--project <id|name>', 'Project override')
			.option('--board <id|name>', 'Board override')
			.option('--json', 'Print JSON')
			.action(
				async (
					boardArg: string | undefined,
					options: TaskFilterOptions & {
						column?: string;
						with?: string;
						without?: string;
						sort?: string;
						filter?: string;
						deleted?: boolean;
						offset?: number;
						limit?: number;
						project?: string;
						board?: string;
						json?: boolean;
					}
				) => {
					await initRuntime();
					const ctx = await loadBoard({ ...options, board: boardArg ?? options.board });
					const { project, board, kanban, refs } = ctx;
					const sort = parseSortSpec(options.sort);
					const { hasContent } = parseTaskFilters(options.filter);
					const keep = await buildTaskFilter(project, options);
					// The CLI lists an in-memory snapshot, so it shows every task unless
					// --limit asks for a page; --offset alone skips without capping.
					const visible = kanban.map((column) => ({
						...column,
						tasks: column.tasks.filter(
							(entry) => Boolean(entry.deletedAt) === Boolean(options.deleted) && keep(entry)
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
						unbounded: options.limit === undefined,
						refs
					});

					if (result.error) {
						throw new KainbuError(result.error, { code: 'invalid_arguments', exitCode: 2 });
					}

					const located = new Map<string, { task: Task; column: Column }>();
					for (const column of kanban)
						for (const entry of column.tasks) located.set(entry.id, { task: entry, column });

					const lines: string[] = [ui.meta(`${project.name} / ${board.name}`)];
					let currentColumnRef: string | null = null;
					for (const entry of result.tasks) {
						if (entry.columnRef !== currentColumnRef) {
							currentColumnRef = entry.columnRef;
							lines.push(`${ui.ref(entry.columnRef)} ${ui.heading(ui.name(entry.columnTitle))}`);
						}
						const { task: found } = located.get(entry.id)!;
						// Trashed tasks have no T-ref; show their id instead.
						const ref = options.deleted ? '' : `${ui.ref(entry.ref)}  `;
						lines.push(`  ${ref}${taskLine(project, found)}  ${ui.id(entry.id)}`);
					}

					if (!result.tasks.length) lines.push(ui.meta('No tasks.'));
					if (result.hasMore) {
						const shown = (options.offset ?? 0) + result.tasks.length;
						lines.push(
							ui.meta(
								`… ${result.total - shown} more — use --offset ${result.nextOffset} (or --limit)`
							)
						);
					}

					printResult(
						{ json: Boolean(options.json), quiet: false },
						{
							...result,
							projectId: project.id,
							boardId: board.id,
							tasks: result.tasks.map((entry) => {
								const { task: found, column } = located.get(entry.id)!;
								return {
									...entry,
									...(options.deleted ? { ref: undefined, deletedAt: found.deletedAt } : {}),
									columnId: column.id,
									...taskSummaryFields(project, found),
									revision: taskRevision(found, column.id)
								};
							})
						},
						lines
					);
				}
			);

	registerList(task, 'list [board]');
	registerList(program, 'ls [board]');

	task
		.command('get <target>')
		.description('Show one task with its fields and links')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (target: string, options: { project?: string; board?: string; json?: boolean }) => {
				await initRuntime();
				const ctx = await loadBoard(options);
				const found = findTaskByRefOrId(ctx.live, ctx.refs, target);
				if (!found)
					throw new KainbuError(`Task not found: ${target}`, { code: 'not_found', exitCode: 4 });
				const { task: entry, column } = found;
				const ref = ctx.refs.taskIdToRef.get(entry.id) || entry.id;
				const due = getTaskDueAt(entry);
				const links = (entry.linkedTaskIds || []).map((id) => {
					const linked = locate(ctx.live, id);
					return linked
						? `${ui.ref(ctx.refs.taskIdToRef.get(id) || id)} ${linked.task.title}`
						: ui.meta(`${id} (not on this board)`);
				});
				const field = (label: string, value?: string) =>
					value ? `${ui.meta(label.padEnd(9))} ${value}` : '';
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{
						ref,
						...entry,
						projectId: ctx.project.id,
						boardId: ctx.board.id,
						columnId: column.id,
						columnTitle: column.title,
						dueAt: due ?? undefined,
						assignee: memberLabel(ctx.project, entry.assignedTo),
						revision: taskRevision(entry, column.id)
					},
					[
						`${ui.ref(ref)}  ${ui.heading(entry.title)}`,
						field('column', `${ui.name(column.title)} ${ui.id(`(${column.id})`)}`),
						field(
							'status',
							entry.hasCheckbox ? (entry.checked ? ui.active('done') : 'open') : undefined
						),
						field('tags', entry.tags.map((tag) => `#${tag.label}`).join(' ')),
						field('assignee', memberLabel(ctx.project, entry.assignedTo)),
						field('due', due ? formatDue(due) : undefined),
						field('color', entry.color?.replace('tone:', '')),
						...links.map((line, index) => field(index ? '' : 'links', line)),
						field('id', ui.id(entry.id)),
						entry.description ? `\n${entry.description}` : ''
					].filter(Boolean)
				);
			}
		);

	fieldOptions(
		writeOptions(task.command('add <title>').description('Add a task and return its stable ID'))
	).action(async (title: string, options: WriteOptions) => {
		await initRuntime();
		if (!title.trim())
			throw new KainbuError('Title cannot be empty.', { code: 'invalid_arguments', exitCode: 2 });
		const description = await descriptionFrom(options);
		const ctx = await loadBoard(options, { exact: true });
		const column =
			options.column !== undefined
				? findColumnByRefOrTitle(ctx.live, ctx.refs, options.column, { exact: true })
				: ctx.live[0];
		if (!column)
			throw new KainbuError('No columns on this board.', {
				code: 'not_found',
				exitCode: 4,
				hint: 'Run: kainbu column add <title>'
			});
		const now = Date.now();
		const base: Task = {
			id: createId(),
			title,
			description: description ?? '',
			tags: [],
			hasCheckbox: ctx.preferences.defaultShowCheckbox,
			checked: false,
			createdAt: now,
			updatedAt: now
		};
		const created = await applyFields(ctx, base, { ...options, title: undefined }, undefined);
		const placement = options.position ? parsePlacement(options.position) : 'top';
		let next = ctx.live.map((entry) =>
			entry.id === column.id
				? { ...entry, tasks: insertAt(entry.tasks, created, placement) }
				: entry
		);
		next = applyLinks(ctx, next, created.id, options);
		await commitBoard(ctx, next, options.dryRun);
		report(ctx, next, [created.id], options, `Added task ${title}`);
	});

	const update = fieldOptions(
		writeOptions(
			task
				.command('update <targets...>')
				.description('Change one or more tasks (refs or ids); applies to all in one write')
		)
	)
		.option('--title <title>', 'New title (single task only)')
		.option('--add-tag <labels>', 'Add tags (comma-separated)')
		.option('--remove-tag <labels>', 'Remove tags (comma-separated)')
		.option('--unlink <tasks>', 'Remove links to tasks (comma-separated refs or ids)')
		.option(
			'--if-match <revision>',
			'Require the revision returned by task get/list (single task)'
		);
	update.action(async (targets: string[], options: WriteOptions) => {
		await initRuntime();
		const description = await descriptionFrom(options);
		if (options.title !== undefined && !options.title.trim())
			throw new KainbuError('Title cannot be empty.', { code: 'invalid_arguments', exitCode: 2 });
		const fields: (keyof WriteOptions)[] = [
			'title',
			'column',
			'position',
			'checked',
			'checkbox',
			'tag',
			'addTag',
			'removeTag',
			'assign',
			'due',
			'color',
			'link',
			'unlink'
		];
		if (description === undefined && fields.every((key) => options[key] === undefined))
			throw new KainbuError('Provide a field to update.', {
				code: 'invalid_arguments',
				exitCode: 2,
				hint: 'Run: kainbu task update --help'
			});
		if (targets.length > 1 && (options.title !== undefined || options.ifMatch !== undefined))
			throw new KainbuError('--title and --if-match apply to a single task.', {
				code: 'invalid_arguments',
				exitCode: 2
			});
		const ctx = await loadBoard(options, { exact: true });
		const found = describeTargets(ctx, targets);
		if (found.length === 1) assertTaskRevision(options.ifMatch, found[0].task, found[0].column.id);
		const destination =
			options.column !== undefined
				? findColumnByRefOrTitle(ctx.live, ctx.refs, options.column, { exact: true })
				: undefined;
		const placement = options.position ? parsePlacement(options.position) : undefined;
		let next = ctx.live;
		for (const { task: original, column } of found) {
			const edited = await applyFields(ctx, original, options, description);
			next = mapTasks(next, original.id, () => edited);
			next = moveForCompletion(ctx, next, original, edited, column, destination, placement);
			next = applyLinks(ctx, next, original.id, options);
		}
		if (JSON.stringify(next) === JSON.stringify(ctx.live))
			return unchanged(
				ctx,
				found.map((entry) => entry.task.id),
				options
			);
		next = stampChanged(ctx.live, next);
		await commitBoard(ctx, next, options.dryRun);
		report(
			ctx,
			next,
			found.map((entry) => entry.task.id),
			options,
			`Updated ${countTasks(found.length)}`
		);
	});

	writeOptions(
		task
			.command('check <targets...>')
			.description('Toggle completion; use --checked true|false for repeatable writes')
	)
		.option('--checked <boolean>', 'Set completion explicitly instead of toggling', booleanOption)
		.option('--if-match <revision>', 'Require the revision returned by task get/list (single task)')
		.action(async (targets: string[], options: WriteOptions) => {
			await initRuntime();
			const ctx = await loadBoard(options, { exact: true });
			const found = describeTargets(ctx, targets);
			if (targets.length > 1 && options.ifMatch !== undefined)
				throw new KainbuError('--if-match applies to a single task.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			if (found.length === 1)
				assertTaskRevision(options.ifMatch, found[0].task, found[0].column.id);
			let next = ctx.live;
			for (const { task: original, column } of found) {
				const edited = withCompletion(original, options.checked ?? !original.checked);
				next = mapTasks(next, original.id, () => edited);
				next = moveForCompletion(ctx, next, original, edited, column, undefined, undefined);
			}
			if (JSON.stringify(next) === JSON.stringify(ctx.live))
				return unchanged(
					ctx,
					found.map((entry) => entry.task.id),
					options
				);
			next = stampChanged(ctx.live, next);
			await commitBoard(ctx, next, options.dryRun);
			report(
				ctx,
				next,
				found.map((entry) => entry.task.id),
				options,
				`Updated ${countTasks(found.length)}`
			);
		});

	writeOptions(
		task
			.command('delete <targets...>')
			.description('Move tasks to the trash (restore with task restore)')
	)
		.option('--if-match <revision>', 'Require the revision returned by task get/list (single task)')
		.action(async (targets: string[], options: WriteOptions) => {
			await initRuntime();
			const ctx = await loadBoard(options, { exact: true });
			const found = describeTargets(ctx, targets);
			if (targets.length > 1 && options.ifMatch !== undefined)
				throw new KainbuError('--if-match applies to a single task.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			if (found.length === 1)
				assertTaskRevision(options.ifMatch, found[0].task, found[0].column.id);
			let next = ctx.live;
			for (const { task: removed } of found) {
				next = next.map((column) => ({
					...column,
					tasks: column.tasks.filter((entry) => entry.id !== removed.id)
				}));
				next = purgeTaskLinks(next, removed.id);
			}
			await commitBoard(ctx, next, options.dryRun);
			report(
				ctx,
				next,
				found.map((entry) => entry.task.id),
				options,
				`Deleted ${countTasks(found.length)}`
			);
		});

	writeOptions(
		task
			.command('restore <ids...>')
			.description('Restore trashed tasks by id (see task list --deleted)')
	).action(async (ids: string[], options: WriteOptions) => {
		await initRuntime();
		const ctx = await loadBoard(options, { exact: true });
		const restore = new Set<string>();
		for (const id of ids) {
			const trashed = ctx.kanban
				.flatMap((column) => column.tasks)
				.find((entry) => entry.id === id.trim() && entry.deletedAt);
			if (!trashed)
				throw new KainbuError(`No trashed task with id ${id} on this board.`, {
					code: 'not_found',
					exitCode: 4,
					hint: 'Run: kainbu task list --deleted'
				});
			restore.add(trashed.id);
		}
		// Restored tasks return to their stored place among the live tasks.
		const next = ctx.kanban.map((column) => ({
			...column,
			tasks: column.tasks
				.filter((entry) => !entry.deletedAt || restore.has(entry.id))
				.map((entry) =>
					restore.has(entry.id) ? { ...entry, deletedAt: undefined, updatedAt: Date.now() } : entry
				)
		}));
		await commitBoard(ctx, next, options.dryRun);
		report(ctx, next, [...restore], options, `Restored ${countTasks(restore.size)}`);
	});

	writeOptions(
		task
			.command('move <targets...>')
			.description('Move tasks to another column or another board in the same project')
	)
		.option('--to-board <id|name>', 'Destination board (same project)')
		.option('--column <ref>', 'Destination column (default: first column)')
		.option('--position <where>', 'top, bottom, or a 1-based position (default: bottom)')
		.action(async (targets: string[], options: WriteOptions) => {
			await initRuntime();
			const ctx = await loadBoard(options, { exact: true });
			const found = describeTargets(ctx, targets);
			const placement = options.position ? parsePlacement(options.position) : 'bottom';
			const toBoard = options.toBoard
				? resolveByIdOrName(ctx.project.boards, options.toBoard, 'board', { exact: true })
				: ctx.board;
			if (toBoard.id === ctx.board.id) {
				if (options.column === undefined)
					throw new KainbuError('Provide --column or --to-board.', {
						code: 'invalid_arguments',
						exitCode: 2
					});
				const column = findColumnByRefOrTitle(ctx.live, ctx.refs, options.column, { exact: true });
				let next = ctx.live;
				// Insert in reverse for top/fixed positions so the given order is kept.
				const ordered = placement === 'bottom' ? found : [...found].reverse();
				for (const { task: moving } of ordered)
					next = placeTask(next, moving.id, column.id, placement);
				if (JSON.stringify(next) === JSON.stringify(ctx.live))
					return unchanged(
						ctx,
						found.map((entry) => entry.task.id),
						options
					);
				await commitBoard(ctx, next, options.dryRun);
				return report(
					ctx,
					next,
					found.map((entry) => entry.task.id),
					options,
					`Moved ${countTasks(found.length)}`
				);
			}

			const destination = toBoard.kanbanData;
			const destinationColumn =
				options.column !== undefined
					? findColumnByRefOrTitle(
							destination,
							buildBoardRefIndex(destination, toBoard.name, Infinity),
							options.column,
							{ exact: true }
						)
					: destination[0];
			if (!destinationColumn)
				throw new KainbuError(`Board "${toBoard.name}" has no columns.`, {
					code: 'not_found',
					exitCode: 4
				});
			const ids = found.map((entry) => entry.task.id);
			const summary = {
				ids,
				projectId: ctx.project.id,
				fromBoardId: ctx.board.id,
				toBoardId: toBoard.id,
				columnId: destinationColumn.id
			};
			if (options.dryRun) {
				printSuccess(
					{ ...summary, dryRun: true },
					`Preview: move ${countTasks(ids.length)} to ${toBoard.name} / ${destinationColumn.title}`
				);
				return;
			}
			await moveTasksToBoard({
				projectId: ctx.project.id,
				fromBoardId: ctx.board.id,
				toBoardId: toBoard.id,
				columnId: destinationColumn.id,
				taskIds: ids
			});
			// The server appends to the column; other positions need a second write.
			if (placement !== 'bottom') {
				const moved = await loadBoard({ project: ctx.project.id, board: toBoard.id });
				let next = moved.live;
				for (const id of [...ids].reverse())
					next = placeTask(next, id, destinationColumn.id, placement);
				await commitBoard(moved, next);
			}
			printSuccess(
				summary,
				`Moved ${countTasks(ids.length)} to ${ui.name(toBoard.name)} / ${ui.name(destinationColumn.title)}`
			);
		});

	const comment = task.command('comment').description('Read and write task comments');
	const commentTarget = (cmd: Command) =>
		cmd
			.option('--project <id|name>', 'Project override')
			.option('--board <id|name>', 'Board override');
	commentTarget(comment.command('list <task>').description('List comments on a task'))
		.option('--json', 'Print JSON')
		.action(
			async (target: string, options: { project?: string; board?: string; json?: boolean }) => {
				await initRuntime();
				const ctx = await loadBoard(options);
				const found = describeTargets(ctx, [target])[0];
				const { comments } = await listTaskComments(ctx.project.id, found.task.id);
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{ taskId: found.task.id, projectId: ctx.project.id, comments },
					comments.length
						? comments.flatMap((entry) => [
								`${ui.name(entry.authorUsername ? '@' + entry.authorUsername : entry.authorUserId)} ${ui.meta(new Date(entry.createdAt).toLocaleString())} ${ui.id(entry.id)}`,
								...entry.body.split('\n').map((line) => `  ${line}`)
							])
						: [ui.meta('No comments.')]
				);
			}
		);
	commentTarget(comment.command('add <task> [text]').description('Comment on a task'))
		.option('--file <path>', 'Comment body from a file (- for stdin)')
		.action(
			async (
				target: string,
				text: string | undefined,
				options: { project?: string; board?: string; file?: string }
			) => {
				await initRuntime();
				if ((text === undefined) === (options.file === undefined))
					throw new KainbuError('Provide the comment text or --file, not both.', {
						code: 'invalid_arguments',
						exitCode: 2
					});
				const body = text ?? (await readInput(options.file!));
				if (!body.trim())
					throw new KainbuError('Comment cannot be empty.', {
						code: 'invalid_arguments',
						exitCode: 2
					});
				const ctx = await loadBoard(options, { exact: true });
				const found = describeTargets(ctx, [target])[0];
				const result = await createTaskComment(ctx.project.id, found.task.id, body);
				printSuccess(
					{
						id: result.comment.id,
						taskId: found.task.id,
						projectId: ctx.project.id,
						comment: result.comment
					},
					`${ui.success('Commented on')} ${ui.name(found.task.title)} ${ui.id(`(${result.comment.id})`)}`
				);
			}
		);
	comment
		.command('delete <commentId>')
		.description('Delete one of your comments')
		.option('--project <id|name>', 'Project override')
		.action(async (commentId: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			await deleteTaskComment(project.id, commentId);
			printSuccess(
				{ id: commentId, projectId: project.id, deleted: true },
				ui.removed('Deleted comment')
			);
		});

	registerAssetCommands(task, {
		target: 'task',
		label: 'task',
		boardScoped: true,
		resolve: async (options, value, write) => {
			const ctx = await loadBoard(options, { exact: write });
			const found = describeTargets(ctx, [value])[0];
			return { projectId: ctx.project.id, targetId: found.task.id, name: found.task.title };
		}
	});
};

const countTasks = (count: number) => (count === 1 ? 'task' : `${count} tasks`);

/**
 * Column placement after an edit. An explicit --column wins; otherwise
 * completing a task follows the board's "move checked tasks" setting, landing
 * on top of the target column like a check on the board does.
 */
function moveForCompletion(
	ctx: BoardContext,
	kanban: KanbanData,
	original: Task,
	edited: Task,
	column: Column,
	destination: Column | undefined,
	placement: Placement | undefined
) {
	if (destination)
		return destination.id === column.id && placement === undefined
			? kanban
			: placeTask(kanban, original.id, destination.id, placement ?? 'bottom');
	const completed = edited.checked && !original.checked;
	const target = completed ? resolveCheckedMoveTargetColumnId(ctx.live, ctx.preferences) : null;
	if (target && target !== column.id)
		return placeTask(kanban, original.id, target, placement ?? 'top');
	return placement === undefined ? kanban : placeTask(kanban, original.id, column.id, placement);
}
