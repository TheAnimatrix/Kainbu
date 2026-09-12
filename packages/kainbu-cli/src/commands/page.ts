import {
	createProjectPage,
	deleteProjectPage,
	renameProjectPage,
	updateProjectPageContent
} from '../writes.js';
import { readInput } from '../input.js';
import { revisionOf, assertRevision } from '../revision.js';
import type { Command } from 'commander';
import { resolveContext } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';

export const registerPageCommands = (program: Command) => {
	const page = program.command('page').alias('pg').description('Manage project pages');

	page
		.command('list')
		.description('List pages')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const rows = project.pages.map((entry) => ({
				id: entry.id,
				name: entry.name,
				contentLength: entry.content.length
			}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map(
					(row) =>
						`${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.contentLength} chars)`)}`
				)
			);
		});

	page
		.command('get <target>')
		.description('Show page content')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (target: string, options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.pages, target, 'page');
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ ...selected, projectId: project.id, revision: revisionOf(selected.content) },
				[selected.content]
			);
		});

	page
		.command('create <name>')
		.description('Create a page')
		.option('--project <id|name>', 'Project override')
		.action(async (name: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const created = await createProjectPage(project.id, name, project.pages.length);
			printSuccess(
				{ id: created.id, projectId: project.id, name: created.name },
				`${ui.success('Created page')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`
			);
		});

	page
		.command('rename <target> <newName>')
		.description('Rename a page')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, newName: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.pages, target, 'page');
			await renameProjectPage(project.id, selected.id, newName);
			printSuccess(
				{ id: selected.id, projectId: project.id, name: newName },
				`${ui.success('Renamed page to')} ${ui.name(newName)}`
			);
		});

	page
		.command('set <target>')
		.description('Set page content from a file or stdin')
		.option('--if-match <revision>', 'Require the revision returned by page get')
		.requiredOption('--file <path>', 'Markdown file path (use - for stdin)')
		.option('--project <id|name>', 'Project override')
		.action(
			async (target: string, options: { file: string; project?: string; ifMatch?: string }) => {
				await initRuntime();
				const { project } = await resolveContext({ project: options.project, requireBoard: false });
				const selected = resolveByIdOrName(project.pages, target, 'page');
				const content = await readInput(options.file);
				assertRevision(options.ifMatch, selected.content);
				await updateProjectPageContent(project.id, selected.id, content, selected.content);
				printSuccess(
					{ id: selected.id, projectId: project.id, name: selected.name },
					`${ui.success('Updated page')} ${ui.name(selected.name)}`
				);
			}
		);

	page
		.command('delete <target>')
		.description('Delete a page')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.pages, target, 'page');
			await deleteProjectPage(project.id, selected.id);
			printSuccess(
				{ id: selected.id, projectId: project.id, deleted: true },
				`${ui.removed('Deleted page')} ${ui.name(selected.name)}`
			);
		});
};
