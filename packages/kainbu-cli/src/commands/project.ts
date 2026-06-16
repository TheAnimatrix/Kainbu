import { fetchWorkspace } from '@kainbu/core';
import { createProject, renameProject } from '../writes.js';
import type { Command } from 'commander';
import { resolveContext, setActiveProject } from '../context.js';
import { printResult, type OutputMode } from '../output.js';
import { ui } from '../color.js';
import { initRuntime, requireUser } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';

export const registerProjectCommands = (program: Command) => {
	const project = program.command('project').alias('p').description('Manage projects');

	const globalOpts = (cmd: Command) =>
		cmd
			.option('--project <id|name>', 'Project override')
			.option('--json', 'Print JSON')
			.option('-q, --quiet', 'Errors only');

	project
		.command('list')
		.description('List accessible projects')
		.option('--json', 'Print JSON')
		.action(async (options: { json?: boolean }) => {
			await initRuntime();
			const user = await requireUser();
			const workspace = await fetchWorkspace(user.id);
			const rows = workspace.projects.map((entry) => ({
				id: entry.id,
				name: entry.name,
				boardCount: entry.boards.length
			}));

			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map(
					(row) => `${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.boardCount} boards)`)}`
				)
			);
		});

	project
		.command('use <target>')
		.description('Set the active project')
		.action(async (target: string) => {
			await initRuntime();
			const user = await requireUser();
			const workspace = await fetchWorkspace(user.id);
			const selected = resolveByIdOrName(workspace.projects, target, 'project');
			await setActiveProject(selected.id);
			console.log(`${ui.active('Active project:')} ${ui.name(selected.name)} ${ui.id(`(${selected.id})`)}`);
		});

	project
		.command('create <name>')
		.description('Create a project')
		.option('--json', 'Print JSON')
		.action(async (name: string, options: { json?: boolean }) => {
			await initRuntime();
			await requireUser();
			const created = await createProject(name);
			await setActiveProject(created.id);
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ id: created.id, name: created.name },
				[`${ui.success('Created project')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`]
			);
		});

	globalOpts(project)
		.command('rename <name>')
		.description('Rename the active project')
		.action(async (name: string, options: { project?: string; json?: boolean; quiet?: boolean }) => {
			const mode: OutputMode = { json: Boolean(options.json), quiet: Boolean(options.quiet) };
			const { project: active } = await resolveContext({ project: options.project, requireBoard: false });
			await renameProject(active.id, name);
			printResult(mode, { id: active.id, name }, [`${ui.success('Renamed project to')} ${ui.name(name)}`]);
		});
};
