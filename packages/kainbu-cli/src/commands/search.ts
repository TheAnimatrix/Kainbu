import type { Command } from 'commander';
import { getTaskDueAt } from '$lib/kainbu/timing';
import type { Project, Task } from '../../../../src/lib/kainbu/types.js';
import { printResult } from '../output.js';
import { ui } from '../color.js';
import { KainbuError } from '../errors.js';
import { booleanOption, integerOption } from '../invocation.js';
import { initRuntime } from '../runtime.js';
import { loadWorkspace } from '../workspace.js';
import { findBoardInWorkspace } from '../context.js';
import { resolveByIdOrName, splitCsv } from './shared.js';
import { buildTaskFilter, taskLine, taskSummaryFields, type TaskFilterOptions } from './task.js';
import { taskRevision } from './task-fields.js';

type Scope = { project?: string; board?: string };

/** Projects (and optionally one board) to search; everything by default. */
const scopeProjects = async (options: Scope) => {
	const workspace = await loadWorkspace();
	let projects = workspace.projects;
	if (options.project) projects = [resolveByIdOrName(projects, options.project, 'project')];
	let boardId: string | undefined;
	if (options.board) {
		const matches = findBoardInWorkspace(projects, options.board);
		if (matches.length !== 1)
			throw new KainbuError(
				matches.length
					? `Multiple boards match "${options.board}".`
					: `Board not found: ${options.board}`,
				{
					code: matches.length ? 'ambiguous_target' : 'not_found',
					exitCode: matches.length ? 2 : 4,
					hint: 'Use the board id, or pass --project.'
				}
			);
		projects = [matches[0].project];
		boardId = matches[0].board.id;
	}
	return { projects, boardId };
};

type Hit = {
	project: Project;
	boardId: string;
	boardName: string;
	columnId: string;
	columnTitle: string;
	task: Task;
};

const collectTasks = (projects: Project[], boardId?: string): Hit[] =>
	projects.flatMap((project) =>
		project.boards
			.filter((board) => !boardId || board.id === boardId)
			.flatMap((board) =>
				board.kanbanData.flatMap((column) =>
					column.tasks
						.filter((task) => !task.deletedAt)
						.map((task) => ({
							project,
							boardId: board.id,
							boardName: board.name,
							columnId: column.id,
							columnTitle: column.title,
							task
						}))
				)
			)
	);

const snippet = (text: string, query: string) => {
	const index = text.toLowerCase().indexOf(query.toLowerCase());
	if (index < 0) return '';
	const start = Math.max(0, index - 40);
	const end = Math.min(text.length, index + query.length + 40);
	return `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
};

const hitPayload = (hit: Hit) => ({
	projectId: hit.project.id,
	projectName: hit.project.name,
	boardId: hit.boardId,
	boardName: hit.boardName,
	columnId: hit.columnId,
	columnTitle: hit.columnTitle,
	id: hit.task.id,
	title: hit.task.title,
	...taskSummaryFields(hit.project, hit.task),
	revision: taskRevision(hit.task, hit.columnId)
});

/** Groups lines under `project / board` headings in result order. */
const groupedLines = (hits: Hit[]) => {
	const lines: string[] = [];
	let heading = '';
	for (const hit of hits) {
		const next = `${hit.project.name} / ${hit.boardName}`;
		if (next !== heading) {
			heading = next;
			lines.push(ui.heading(ui.name(next)));
		}
		lines.push(
			`  ${taskLine(hit.project, hit.task)}  ${ui.meta(hit.columnTitle)}  ${ui.id(hit.task.id)}`
		);
	}
	return lines;
};

const runFind = async (
	query: string | undefined,
	options: Scope & TaskFilterOptions & { limit?: number; json?: boolean }
) => {
	await initRuntime();
	const { projects, boardId } = await scopeProjects(options);
	const keep = await buildTaskFilter(projects, { ...options, search: query ?? options.search });
	let hits = collectTasks(projects, boardId).filter((hit) => keep(hit.task));
	// With a due filter the soonest task matters most; otherwise keep board order.
	if (options.due)
		hits = [...hits].sort(
			(left, right) =>
				(getTaskDueAt(left.task) ?? Infinity) - (getTaskDueAt(right.task) ?? Infinity)
		);
	const total = hits.length;
	if (options.limit !== undefined) hits = hits.slice(0, options.limit);
	printResult(
		{ json: Boolean(options.json), quiet: false },
		{ total, hasMore: hits.length < total, tasks: hits.map(hitPayload) },
		[
			...(hits.length ? groupedLines(hits) : [ui.meta('No matching tasks.')]),
			...(hits.length < total ? [ui.meta(`… ${total - hits.length} more (raise --limit)`)] : [])
		]
	);
};

const findOptions = (cmd: Command) =>
	cmd
		.option('--tag <labels>', 'Tasks with any of these tags (comma-separated)')
		.option('--assignee <user>', 'Assigned to me, @username, email, id, or none')
		.option('--due <when>', 'Due filter: overdue, today, week, none, or any')
		.option('--checked <boolean>', 'Completed (true) or open (false) tasks', booleanOption)
		.option('--project <id|name>', 'Only this project')
		.option('--board <id|name>', 'Only this board')
		.option('--limit <n>', 'Show at most this many tasks', integerOption(1))
		.option('--json', 'Print JSON');

export const registerSearchCommands = (program: Command) => {
	const task = program.commands.find((command) => command.name() === 'task')!;

	findOptions(
		task
			.command('find [query]')
			.description('Find tasks across all boards and projects (query matches title or description)')
	).action(runFind);

	findOptions(
		program
			.command('mine')
			.description('Open tasks assigned to you across all projects (same filters as task find)')
	).action(async (options: Scope & TaskFilterOptions & { limit?: number; json?: boolean }) =>
		runFind(undefined, { checked: false, ...options, assignee: options.assignee ?? 'me' })
	);

	program
		.command('search <query>')
		.description('Search task and page text across the workspace')
		.option('--type <types>', 'Limit to: tasks, pages (comma-separated)')
		.option('--project <id|name>', 'Only this project')
		.option('--limit <n>', 'At most this many results per type', integerOption(1))
		.option('--json', 'Print JSON')
		.action(
			async (
				query: string,
				options: { type?: string; project?: string; limit?: number; json?: boolean }
			) => {
				await initRuntime();
				if (!query.trim())
					throw new KainbuError('Search text cannot be empty.', {
						code: 'invalid_arguments',
						exitCode: 2
					});
				const types = splitCsv(options.type).map((type) => type.toLowerCase());
				for (const type of types)
					if (!['tasks', 'pages'].includes(type))
						throw new KainbuError(`Unknown type "${type}".`, {
							code: 'invalid_arguments',
							exitCode: 2,
							hint: 'Use tasks and/or pages.'
						});
				const want = (type: string) => !types.length || types.includes(type);
				const { projects } = await scopeProjects({ project: options.project });
				const needle = query.trim().toLowerCase();
				const limit = (items: unknown[]) =>
					options.limit === undefined ? items : items.slice(0, options.limit);

				const taskHits = want('tasks')
					? collectTasks(projects).filter(
							(hit) =>
								hit.task.title.toLowerCase().includes(needle) ||
								Boolean(hit.task.description?.toLowerCase().includes(needle))
						)
					: [];
				const pageHits = want('pages')
					? projects.flatMap((project) =>
							project.pages
								.filter(
									(page) =>
										page.name.toLowerCase().includes(needle) ||
										page.content.toLowerCase().includes(needle)
								)
								.map((page) => ({ project, page }))
						)
					: [];

				const shownTasks = limit(taskHits) as Hit[];
				const shownPages = limit(pageHits) as typeof pageHits;
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{
						query,
						tasks: shownTasks.map((hit) => ({
							...hitPayload(hit),
							snippet: snippet(hit.task.description || '', query) || undefined
						})),
						pages: shownPages.map(({ project, page }) => ({
							projectId: project.id,
							projectName: project.name,
							id: page.id,
							name: page.name,
							snippet: snippet(page.content, query) || undefined
						})),
						totals: { tasks: taskHits.length, pages: pageHits.length }
					},
					[
						...(want('tasks')
							? [
									ui.heading(`Tasks (${taskHits.length})`),
									...shownTasks.flatMap((hit) => {
										const context = snippet(hit.task.description || '', query);
										return [
											`  ${hit.task.title}  ${ui.meta(`${hit.project.name} / ${hit.boardName} / ${hit.columnTitle}`)}  ${ui.id(hit.task.id)}`,
											...(context ? [`    ${ui.meta(context)}`] : [])
										];
									})
								]
							: []),
						...(want('pages')
							? [
									ui.heading(`Pages (${pageHits.length})`),
									...shownPages.flatMap(({ project, page }) => {
										const context = snippet(page.content, query);
										return [
											`  ${ui.name(page.name)}  ${ui.meta(project.name)}  ${ui.id(page.id)}`,
											...(context ? [`    ${ui.meta(context)}`] : [])
										];
									})
								]
							: [])
					]
				);
			}
		);
};
