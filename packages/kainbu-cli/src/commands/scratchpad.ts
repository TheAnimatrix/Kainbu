import { createId, updateProjectScratchpad } from '@kainbu/core';
import { fetchProjectScratchpadMeta } from '../writes.js';
import { getInvocation, integerOption } from '../invocation.js';
import { KainbuError } from '../errors.js';
import type { Command } from 'commander';
import type { ScratchpadData } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';
import { appendText, contentFrom } from './page.js';

type ScratchpadMeta = Awaited<ReturnType<typeof fetchProjectScratchpadMeta>>;

const conflict = () =>
	new KainbuError('The scratchpad changed since it was read; nothing was saved.', {
		code: 'conflict',
		exitCode: 5,
		hint: 'Run kainbu scratchpad show, review the changes, and retry with the latest revision.'
	});

const resolvePad = (scratchpad: ScratchpadData, target: string | undefined, exact: boolean) => {
	if (!target) {
		const active =
			scratchpad.pads.find((pad) => pad.id === scratchpad.activePadId) || scratchpad.pads[0];
		if (!active)
			throw new KainbuError('Scratchpad has no pads.', { code: 'not_found', exitCode: 4 });
		return active;
	}
	return resolveByIdOrName(scratchpad.pads, target, 'pad', { exact });
};

const load = async (options: { project?: string }, exact: boolean) => {
	await initRuntime();
	const { project } = await resolveContext({
		project: options.project,
		requireBoard: false,
		exact
	});
	return { project, meta: await fetchProjectScratchpadMeta(project.id) };
};

/**
 * Saves the whole scratchpad against the revision it was read at. The server
 * answers a stale revision with `ok: false` (not an HTTP error), so that is
 * checked here: a rejected write must never be reported as saved.
 */
const save = async (projectId: string, meta: ScratchpadMeta, next: ScratchpadData) => {
	let result;
	try {
		result = await updateProjectScratchpad(projectId, next, meta.scratchpadRev);
	} catch (error) {
		const status =
			error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
		if (status === 409) throw conflict();
		throw error;
	}
	if (!result.ok) throw conflict();
	return result.scratchpadRev;
};

const revisionOption = (cmd: Command) =>
	cmd
		.option(
			'--if-revision <n>',
			'Require the revision returned by scratchpad show',
			integerOption(0)
		)
		.option('--if-match <n>', 'Same as --if-revision', integerOption(0));

const checkRevision = (
	meta: ScratchpadMeta,
	options: { ifRevision?: number; ifMatch?: number }
) => {
	const expected = options.ifRevision ?? options.ifMatch;
	if (expected !== undefined && expected !== meta.scratchpadRev) throw conflict();
};

export const registerScratchpadCommands = (program: Command) => {
	// The app's notes tab shows project pages. These pads are the older
	// project-level scratchpad, which the app only shows for a project without
	// pages; the commands remain for reading and migrating that content.
	const scratchpad = program
		.command('scratchpad')
		.alias('sp')
		.description('Legacy project scratchpad, not shown in the app (use page for notes)');
	scratchpad.hook('preAction', () => {
		if (!getInvocation().json)
			process.stderr.write(
				`${ui.warn('Note:')} the app shows pages, not this legacy scratchpad. Use kainbu page for notes.
`
			);
	});

	scratchpad
		.command('show')
		.description('Show scratchpad content (the active pad unless --pad)')
		.option('--pad <id|name>', 'Pad to show')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { pad?: string; project?: string; json?: boolean }) => {
			const { project, meta } = await load(options, false);
			const pad = resolvePad(meta.scratchpadData, options.pad, false);
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ pad, projectId: project.id, revision: meta.scratchpadRev },
				[pad.content]
			);
		});

	for (const mode of ['set', 'append'] as const)
		revisionOption(
			scratchpad
				.command(mode)
				.description(mode === 'set' ? 'Replace a pad’s content' : 'Add content to the end of a pad')
				.option('--file <path>', 'Content file (- for stdin)')
				.option('--text <text>', 'Content text')
				.option('--pad <id|name>', 'Pad to change (default: the active pad)')
				.option('--project <id|name>', 'Project override')
		).action(
			async (options: {
				file?: string;
				text?: string;
				pad?: string;
				project?: string;
				ifRevision?: number;
				ifMatch?: number;
			}) => {
				const input = (await contentFrom(options, true))!;
				const { project, meta } = await load(options, true);
				checkRevision(meta, options);
				const pad = resolvePad(meta.scratchpadData, options.pad, true);
				const content = mode === 'set' ? input : appendText(pad.content, input);
				const revision = await save(project.id, meta, {
					...meta.scratchpadData,
					pads: meta.scratchpadData.pads.map((entry) =>
						entry.id === pad.id ? { ...entry, content } : entry
					)
				});
				printSuccess(
					{ id: pad.id, projectId: project.id, revision, contentLength: content.length },
					`${ui.success(mode === 'set' ? 'Updated pad' : 'Appended to pad')} ${ui.name(pad.name)} ${ui.meta(`(rev ${revision})`)}`
				);
			}
		);

	const pad = scratchpad.command('pad').description('Manage scratchpad pads');

	pad
		.command('list')
		.description('List scratchpad pads')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean }) => {
			const { meta } = await load(options, false);
			const rows = meta.scratchpadData.pads.map((entry) => ({
				id: entry.id,
				name: entry.name,
				active: entry.id === meta.scratchpadData.activePadId,
				length: entry.content.length
			}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map(
					(row) =>
						`${row.active ? ui.active('*') : ' '} ${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.length} chars)`)}`
				)
			);
		});

	revisionOption(
		pad
			.command('create <name>')
			.description('Create a scratchpad pad')
			.option('--file <path>', 'Initial content file (- for stdin)')
			.option('--text <text>', 'Initial content')
			.option('--use', 'Make it the active pad')
			.option('--project <id|name>', 'Project override')
	).action(
		async (
			name: string,
			options: {
				file?: string;
				text?: string;
				use?: boolean;
				project?: string;
				ifRevision?: number;
				ifMatch?: number;
			}
		) => {
			if (!name.trim())
				throw new KainbuError('Pad name cannot be empty.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const content = (await contentFrom(options, false)) ?? '';
			const { project, meta } = await load(options, true);
			checkRevision(meta, options);
			const created = { id: createId(), name, content };
			const revision = await save(project.id, meta, {
				activePadId: options.use ? created.id : meta.scratchpadData.activePadId,
				pads: [...meta.scratchpadData.pads, created]
			});
			printSuccess(
				{ id: created.id, projectId: project.id, name, revision, active: Boolean(options.use) },
				`${ui.success('Created pad')} ${ui.name(name)} ${ui.id(`(${created.id})`)}`
			);
		}
	);

	pad
		.command('use <target>')
		.description('Make a pad the active one (shown first in the app)')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string }) => {
			const { project, meta } = await load(options, true);
			const selected = resolvePad(meta.scratchpadData, target, true);
			const revision =
				meta.scratchpadData.activePadId === selected.id
					? meta.scratchpadRev
					: await save(project.id, meta, { ...meta.scratchpadData, activePadId: selected.id });
			printSuccess(
				{ id: selected.id, projectId: project.id, revision },
				`${ui.active('Active pad:')} ${ui.name(selected.name)}`
			);
		});

	revisionOption(
		pad
			.command('rename <target> <newName>')
			.description('Rename a scratchpad pad')
			.option('--project <id|name>', 'Project override')
	).action(
		async (
			target: string,
			newName: string,
			options: { project?: string; ifRevision?: number; ifMatch?: number }
		) => {
			if (!newName.trim())
				throw new KainbuError('Pad name cannot be empty.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			const { project, meta } = await load(options, true);
			checkRevision(meta, options);
			const selected = resolvePad(meta.scratchpadData, target, true);
			const revision = await save(project.id, meta, {
				...meta.scratchpadData,
				pads: meta.scratchpadData.pads.map((entry) =>
					entry.id === selected.id ? { ...entry, name: newName } : entry
				)
			});
			printSuccess(
				{ id: selected.id, projectId: project.id, name: newName, revision },
				`${ui.success('Renamed pad')} ${ui.name(selected.name)} ${ui.success('to')} ${ui.name(newName)}`
			);
		}
	);

	revisionOption(
		pad
			.command('delete <target>')
			.description('Delete a scratchpad pad')
			.option('--project <id|name>', 'Project override')
	).action(
		async (
			target: string,
			options: { project?: string; ifRevision?: number; ifMatch?: number }
		) => {
			const { project, meta } = await load(options, true);
			checkRevision(meta, options);
			const selected = resolvePad(meta.scratchpadData, target, true);
			if (meta.scratchpadData.pads.length <= 1) {
				throw new KainbuError('Cannot delete the only scratchpad pad.', {
					code: 'invalid_arguments',
					exitCode: 2
				});
			}
			const remaining = meta.scratchpadData.pads.filter((entry) => entry.id !== selected.id);
			const revision = await save(project.id, meta, {
				activePadId:
					meta.scratchpadData.activePadId === selected.id
						? remaining[0]!.id
						: meta.scratchpadData.activePadId,
				pads: remaining
			});
			printSuccess(
				{ id: selected.id, projectId: project.id, deleted: true, revision },
				`${ui.removed('Deleted pad')} ${ui.name(selected.name)}`
			);
		}
	);
};
