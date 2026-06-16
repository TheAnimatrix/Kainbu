import {
	createProjectPage,
	deleteProjectPage,
	renameProjectPage,
	updateProjectPageContent
} from '../writes.js';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { resolveContext } from '../context.js';
import { printResult } from '../output.js';
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
					(row) => `${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.contentLength} chars)`)}`
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
			if (options.json) {
				printResult({ json: true, quiet: false }, selected);
				return;
			}
			console.log(selected.content);
		});

	page
		.command('create <name>')
		.description('Create a page')
		.option('--project <id|name>', 'Project override')
		.action(async (name: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const created = await createProjectPage(project.id, name, project.pages.length);
			console.log(`${ui.success('Created page')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`);
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
			console.log(`${ui.success('Renamed page to')} ${ui.name(newName)}`);
		});

	page
		.command('set <target>')
		.description('Set page content from a file or stdin')
		.requiredOption('--file <path>', 'Markdown file path (use - for stdin)')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { file: string; project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.pages, target, 'page');
			const content =
				options.file === '-'
					? await new Promise<string>((resolve, reject) => {
							let buffer = '';
							process.stdin.setEncoding('utf8');
							process.stdin.on('data', (chunk) => {
								buffer += chunk;
							});
							process.stdin.on('end', () => resolve(buffer));
							process.stdin.on('error', reject);
						})
					: await readFile(options.file, 'utf8');
			await updateProjectPageContent(project.id, selected.id, content);
			console.log(`${ui.success('Updated page')} ${ui.name(selected.name)}`);
		});

	page
		.command('delete <target>')
		.description('Delete a page')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.pages, target, 'page');
			await deleteProjectPage(project.id, selected.id);
			console.log(`${ui.removed('Deleted page')} ${ui.name(selected.name)}`);
		});
};
