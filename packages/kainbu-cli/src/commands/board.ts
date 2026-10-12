import {
	createProjectBoard,
	deleteProjectBoard,
	renameProjectBoard,
	reorderProjectChildren,
	updateBoardPreferences,
	updateBoardShare
} from '../writes.js';
import { normalizeBoardPreferences } from '$lib/kainbu/boardPreferences';
import type { Command } from 'commander';
import type { BoardPreferences, ProjectBoard } from '../../../../src/lib/kainbu/types.js';
import { resolveContext, setActiveBoard, setActiveProject } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { booleanOption } from '../invocation.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';
import { KainbuError } from '../errors.js';
import { loadBoard } from './board-context.js';
import { findColumnByRefOrTitle } from './kanban-utils.js';
import { insertAt, parsePlacement } from './task-fields.js';

const liveTaskCount = (board: ProjectBoard) =>
	board.kanbanData.reduce(
		(sum, column) => sum + column.tasks.filter((task) => !task.deletedAt).length,
		0
	);

const describePreferences = (preferences: BoardPreferences, board: ProjectBoard) => {
	const target = preferences.checkedTaskTargetColumnId
		? board.kanbanData.find((column) => column.id === preferences.checkedTaskTargetColumnId)?.title
		: 'Done (by title)';
	return [
		`${ui.meta('new tasks have a checkbox')}  ${preferences.defaultShowCheckbox ? 'yes' : 'no'}`,
		`${ui.meta('move checked tasks to')}     ${preferences.moveCheckedTasks ? ui.name(target || 'missing column') : 'off'}`
	];
};

export const registerBoardCommands = (program: Command) => {
	const board = program.command('board').alias('b').description('Manage boards (taskboards)');

	board
		.command('list')
		.description('List boards in the active project')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project, config } = await resolveContext({
				project: options.project,
				requireBoard: false
			});
			const rows = project.boards.map((entry) => ({
				id: entry.id,
				name: entry.name,
				position: entry.position,
				columnCount: entry.kanbanData.length,
				taskCount: liveTaskCount(entry),
				active: config.activeProjectId === project.id && config.activeBoardId === entry.id
			}));

			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.length
					? rows.map(
							(row) =>
								`${row.active ? ui.active('*') : ' '} ${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.columnCount} columns, ${row.taskCount} tasks)`)}`
						)
					: [ui.meta('No boards. Run: kainbu board create <name>')]
			);
		});

	board
		.command('get [board]')
		.description('Show a board: columns, task counts, settings, and sharing')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (
				boardArg: string | undefined,
				options: { project?: string; board?: string; json?: boolean }
			) => {
				await initRuntime();
				const ctx = await loadBoard({ ...options, board: boardArg ?? options.board });
				const columns = ctx.live.map((column) => ({
					ref: ctx.refs.columnIdToRef.get(column.id) || column.id,
					id: column.id,
					title: column.title,
					taskCount: column.tasks.length
				}));
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{
						id: ctx.board.id,
						name: ctx.board.name,
						projectId: ctx.project.id,
						position: ctx.board.position,
						preferences: ctx.preferences,
						sharePublic: ctx.board.sharePublic,
						shareSlug: ctx.board.shareSlug ?? null,
						columns,
						taskCount: liveTaskCount(ctx.board),
						trashedCount: ctx.kanban.reduce(
							(sum, column) => sum + column.tasks.filter((task) => task.deletedAt).length,
							0
						)
					},
					[
						`${ui.heading(ctx.board.name)}  ${ui.meta(ctx.project.name)}  ${ui.id(ctx.board.id)}`,
						...columns.map(
							(column) =>
								`  ${ui.ref(column.ref)}  ${ui.name(column.title)}  ${ui.meta(`(${column.taskCount})`)}`
						),
						...describePreferences(ctx.preferences, ctx.board),
						`${ui.meta('public link')}               ${ctx.board.sharePublic ? 'on' : 'off'}`
					]
				);
			}
		);

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
			if (!name.trim())
				throw new KainbuError('Board name cannot be empty.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const position = project.boards.length;
			const created = await createProjectBoard(project.id, name, position);
			if (options.use !== false) {
				await setActiveProject(project.id);
				await setActiveBoard(created.id);
			}
			printSuccess(
				{ id: created.id, name: created.name, projectId: project.id },
				`${ui.success('Created board')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`
			);
		});

	board
		.command('rename <name>')
		.description('Rename the active board (or --board)')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.action(async (name: string, options: { project?: string; board?: string }) => {
			await initRuntime();
			if (!name.trim())
				throw new KainbuError('Board name cannot be empty.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const { project, board: active } = await resolveContext({ ...options, exact: true });
			await renameProjectBoard(project.id, active.id, name);
			printSuccess(
				{ id: active.id, projectId: project.id, name },
				`${ui.success('Renamed board')} ${ui.name(active.name)} ${ui.success('to')} ${ui.name(name)}`
			);
		});

	board
		.command('move <target>')
		.description('Reorder a board within its project')
		.requiredOption('--position <where>', 'top (first), bottom (last), or a 1-based position')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string; position: string }) => {
			await initRuntime();
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const selected = resolveByIdOrName(project.boards, target, 'board', { exact: true });
			const order = insertAt(
				project.boards.filter((entry) => entry.id !== selected.id),
				selected,
				parsePlacement(options.position)
			).map((entry) => entry.id);
			await reorderProjectChildren('boards', project.id, order);
			printSuccess(
				{ id: selected.id, projectId: project.id, position: order.indexOf(selected.id), order },
				`${ui.success('Moved board')} ${ui.name(selected.name)} ${ui.meta(`to position ${order.indexOf(selected.id) + 1}`)}`
			);
		});

	board
		.command('settings [board]')
		.description('Show or change board settings')
		.option('--show-checkbox <boolean>', 'New tasks get a checkbox', booleanOption)
		.option('--move-checked <boolean>', 'Move tasks to a column when checked', booleanOption)
		.option('--checked-column <column>', 'Column for checked tasks, or auto (a column titled Done)')
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (
				boardArg: string | undefined,
				options: {
					showCheckbox?: boolean;
					moveChecked?: boolean;
					checkedColumn?: string;
					project?: string;
					board?: string;
					json?: boolean;
				}
			) => {
				await initRuntime();
				const writing = [options.showCheckbox, options.moveChecked, options.checkedColumn].some(
					(value) => value !== undefined
				);
				const ctx = await loadBoard(
					{ ...options, board: boardArg ?? options.board },
					{ exact: writing }
				);
				let preferences = normalizeBoardPreferences(ctx.board.preferences);
				if (writing) {
					const patch: Partial<BoardPreferences> = {};
					if (options.showCheckbox !== undefined) patch.defaultShowCheckbox = options.showCheckbox;
					if (options.moveChecked !== undefined) patch.moveCheckedTasks = options.moveChecked;
					if (options.checkedColumn !== undefined)
						patch.checkedTaskTargetColumnId =
							options.checkedColumn.trim().toLowerCase() === 'auto'
								? ''
								: findColumnByRefOrTitle(ctx.live, ctx.refs, options.checkedColumn, {
										exact: true
									}).id;
					preferences = (await updateBoardPreferences(ctx.project.id, ctx.board.id, patch))
						.preferences;
				}
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{
						...(writing ? { ok: true } : {}),
						id: ctx.board.id,
						projectId: ctx.project.id,
						preferences
					},
					[
						`${writing ? ui.success('Updated settings for') : ui.heading('Settings for')} ${ui.name(ctx.board.name)}`,
						...describePreferences(preferences, ctx.board)
					]
				);
			}
		);

	board
		.command('share [board]')
		.description('Show or change the board share link (project owners only)')
		.option(
			'--public <boolean>',
			'Make the link publicly readable (true) or private (false)',
			booleanOption
		)
		.option('--project <id|name>', 'Project override')
		.option('--board <id|name>', 'Board override')
		.option('--json', 'Print JSON')
		.action(
			async (
				boardArg: string | undefined,
				options: { public?: boolean; project?: string; board?: string; json?: boolean }
			) => {
				await initRuntime();
				const { project, board: selected } = await resolveContext({
					project: options.project,
					board: boardArg ?? options.board,
					exact: options.public !== undefined
				});
				const share = await updateBoardShare(project.id, selected.id, options.public);
				printResult(
					{ json: Boolean(options.json), quiet: false },
					{ id: selected.id, projectId: project.id, ...share },
					[
						`${ui.name(selected.name)}  ${share.sharePublic ? ui.active('public') : ui.meta('private (members only)')}`,
						share.shareUrl
					]
				);
			}
		);

	board
		.command('delete <target>')
		.description('Delete a board')
		.option('--force', 'Delete even if it has tasks (permanent, with comments and attachments)')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string; force?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const selected = resolveByIdOrName(project.boards, target, 'board', { exact: true });
			if (project.boards.length <= 1) {
				throw new KainbuError('Cannot delete the only board on a project.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			}
			const count = liveTaskCount(selected);
			if (count && !options.force)
				throw new KainbuError(
					`Board "${selected.name}" has ${count} task${count === 1 ? '' : 's'}.`,
					{
						code: 'invalid_arguments',
						exitCode: 2,
						hint: 'Move them with kainbu task move --to-board, or pass --force to delete them permanently.'
					}
				);
			await deleteProjectBoard(project.id, selected.id);
			printSuccess(
				{ id: selected.id, projectId: project.id, deleted: true, deletedTasks: count },
				`${ui.removed('Deleted board')} ${ui.name(selected.name)}`
			);
		});
};
