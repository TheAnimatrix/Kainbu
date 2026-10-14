import {
	createProjectPage,
	deleteProjectPage,
	renameProjectPage,
	reorderProjectChildren,
	updateProjectPageContent
} from '../writes.js';
import { readInput } from '../input.js';
import { revisionOf, assertRevision } from '../revision.js';
import type { Command } from 'commander';
import { resolveContext } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { KainbuError } from '../errors.js';
import { resolveByIdOrName } from './shared.js';
import { registerAssetCommands } from './assets.js';
import { insertAt, parsePlacement } from './task-fields.js';

type ContentOptions = { file?: string; text?: string };

/** Content from exactly one of --file (path or - for stdin) and --text. */
export const contentFrom = async (options: ContentOptions, required: boolean) => {
	if (options.file !== undefined && options.text !== undefined)
		throw new KainbuError('Use only one of --file and --text.', {
			code: 'invalid_arguments',
			exitCode: 2
		});
	const content =
		options.file !== undefined ? await readInput(options.file) : (options.text ?? undefined);
	if (content === undefined && required)
		throw new KainbuError('Provide --file <path|-> or --text <text>.', {
			code: 'invalid_arguments',
			exitCode: 2
		});
	return content;
};

/** Appended text starts on its own line. */
export const appendText = (current: string, addition: string) =>
	!current || current.endsWith('\n') ? current + addition : `${current}\n${addition}`;

const formatDate = (timestamp: number) =>
	timestamp ? new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16) : '';

export const registerPageCommands = (program: Command) => {
	const page = program.command('page').alias('pg').description('Manage project pages');
	const project = (cmd: Command) => cmd.option('--project <id|name>', 'Project override');

	project(page.command('list').description('List pages'))
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const rows = project.pages.map((entry) => ({
				id: entry.id,
				name: entry.name,
				position: entry.position,
				contentLength: entry.content.length,
				createdAt: entry.createdAt,
				updatedAt: entry.updatedAt
			}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.length
					? rows.map(
							(row) =>
								`${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.contentLength} chars, updated ${formatDate(row.updatedAt)})`)}`
						)
					: [ui.meta('No pages. Run: kainbu page create <name>')]
			);
		});

	project(page.command('get <target>').description('Show page content'))
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

	project(page.command('create <name>').description('Create a page, optionally with content'))
		.option('--file <path>', 'Initial markdown from a file (- for stdin)')
		.option('--text <text>', 'Initial markdown')
		.action(async (name: string, options: ContentOptions & { project?: string }) => {
			await initRuntime();
			if (!name.trim())
				throw new KainbuError('Page name cannot be empty.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const content = await contentFrom(options, false);
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const created = await createProjectPage(project.id, name, project.pages.length, content);
			printSuccess(
				{
					id: created.id,
					projectId: project.id,
					name: created.name,
					revision: revisionOf(content ?? '')
				},
				`${ui.success('Created page')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`
			);
		});

	project(page.command('rename <target> <newName>').description('Rename a page')).action(
		async (target: string, newName: string, options: { project?: string }) => {
			await initRuntime();
			if (!newName.trim())
				throw new KainbuError('Page name cannot be empty.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const selected = resolveByIdOrName(project.pages, target, 'page', { exact: true });
			await renameProjectPage(project.id, selected.id, newName);
			printSuccess(
				{ id: selected.id, projectId: project.id, name: newName },
				`${ui.success('Renamed page')} ${ui.name(selected.name)} ${ui.success('to')} ${ui.name(newName)}`
			);
		}
	);

	for (const mode of ['set', 'append'] as const)
		project(
			page
				.command(`${mode} <target>`)
				.description(
					mode === 'set'
						? 'Replace page content from --file or --text'
						: 'Add content to the end of a page from --file or --text'
				)
		)
			.option('--file <path>', 'Markdown file path (- for stdin)')
			.option('--text <text>', 'Markdown text')
			.option('--if-match <revision>', 'Require the revision returned by page get')
			.action(
				async (
					target: string,
					options: ContentOptions & { project?: string; ifMatch?: string }
				) => {
					await initRuntime();
					const input = (await contentFrom(options, true))!;
					const { project } = await resolveContext({
						project: options.project,
						requireBoard: false,
						exact: true
					});
					const selected = resolveByIdOrName(project.pages, target, 'page', { exact: true });
					assertRevision(options.ifMatch, selected.content);
					const content = mode === 'set' ? input : appendText(selected.content, input);
					// The server rejects the write if the page changed since this read.
					await updateProjectPageContent(project.id, selected.id, content, selected.content);
					printSuccess(
						{
							id: selected.id,
							projectId: project.id,
							name: selected.name,
							revision: revisionOf(content),
							contentLength: content.length
						},
						`${ui.success(mode === 'set' ? 'Updated page' : 'Appended to page')} ${ui.name(selected.name)}`
					);
				}
			);

	project(page.command('move <target>').description('Reorder a page'))
		.requiredOption('--position <where>', 'top (first), bottom (last), or a 1-based position')
		.action(async (target: string, options: { project?: string; position: string }) => {
			await initRuntime();
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const selected = resolveByIdOrName(project.pages, target, 'page', { exact: true });
			const order = insertAt(
				project.pages.filter((entry) => entry.id !== selected.id),
				selected,
				parsePlacement(options.position)
			).map((entry) => entry.id);
			await reorderProjectChildren('pages', project.id, order);
			printSuccess(
				{ id: selected.id, projectId: project.id, position: order.indexOf(selected.id), order },
				`${ui.success('Moved page')} ${ui.name(selected.name)} ${ui.meta(`to position ${order.indexOf(selected.id) + 1}`)}`
			);
		});

	project(page.command('delete <target>').description('Delete a page')).action(
		async (target: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const selected = resolveByIdOrName(project.pages, target, 'page', { exact: true });
			if (project.pages.length <= 1)
				throw new KainbuError('Cannot delete the only page in a project.', {
					code: 'invalid_arguments',
					exitCode: 2,
					hint: 'Create another page first, or clear this one with page set --text "".'
				});
			await deleteProjectPage(project.id, selected.id);
			printSuccess(
				{ id: selected.id, projectId: project.id, deleted: true },
				`${ui.removed('Deleted page')} ${ui.name(selected.name)}`
			);
		}
	);

	registerAssetCommands(page, {
		target: 'page',
		label: 'page',
		boardScoped: false,
		resolve: async (options, value, write) => {
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: write
			});
			const selected = resolveByIdOrName(project.pages, value, 'page', { exact: write });
			return { projectId: project.id, targetId: selected.id, name: selected.name };
		}
	});
};
