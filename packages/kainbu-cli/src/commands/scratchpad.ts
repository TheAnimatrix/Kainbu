import { createId, fetchProjectScratchpadMeta, updateProjectScratchpad } from '@kainbu/core';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { ScratchpadData } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { printResult } from '../output.js';
import { initRuntime } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';

const resolvePad = (scratchpad: ScratchpadData, target?: string) => {
	if (!target) {
		return scratchpad.pads.find((pad) => pad.id === scratchpad.activePadId) || scratchpad.pads[0];
	}

	return (
		scratchpad.pads.find((pad) => pad.id === target) ||
		scratchpad.pads.find((pad) => pad.name.toLowerCase() === target.toLowerCase()) ||
		null
	);
};

export const registerScratchpadCommands = (program: Command) => {
	const scratchpad = program.command('scratchpad').alias('sp').description('Manage scratchpad');

	scratchpad
		.command('show')
		.description('Show scratchpad content')
		.option('--pad <id|name>', 'Pad to show')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { pad?: string; project?: string; json?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const meta = await fetchProjectScratchpadMeta(project.id);
			const pad = resolvePad(meta.scratchpadData, options.pad);
			if (!pad) throw new Error('Scratchpad pad not found.');

			if (options.json) {
				printResult({ json: true, quiet: false }, { pad, revision: meta.scratchpadRev });
				return;
			}

			console.log(pad.content);
		});

	scratchpad
		.command('set')
		.description('Replace scratchpad content')
		.requiredOption('--file <path>', 'Content file (- for stdin)')
		.option('--pad <id|name>', 'Pad to update')
		.option('--project <id|name>', 'Project override')
		.action(async (options: { file: string; pad?: string; project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const meta = await fetchProjectScratchpadMeta(project.id);
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

			const pad = resolvePad(meta.scratchpadData, options.pad);
			if (!pad) throw new Error('Scratchpad pad not found.');

			const nextPads = meta.scratchpadData.pads.map((entry) =>
				entry.id === pad.id ? { ...entry, content } : entry
			);
			const nextData: ScratchpadData = {
				activePadId: pad.id,
				pads: nextPads
			};

			try {
				const result = await updateProjectScratchpad(
					project.id,
					nextData,
					meta.scratchpadRev
				);
				console.log(`Scratchpad updated (rev ${result.scratchpadRev}).`);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Scratchpad update failed.';
				const status =
					error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
				if (status === 409 || /revision|conflict/i.test(message)) {
					throw new Error(
						'Scratchpad revision conflict. Run scratchpad show and retry with the latest revision.'
					);
				}
				throw error;
			}
		});

	const pad = scratchpad.command('pad').description('Manage scratchpad pads');

	pad
		.command('list')
		.description('List scratchpad pads')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const meta = await fetchProjectScratchpadMeta(project.id);
			const rows = meta.scratchpadData.pads.map((entry) => ({
				id: entry.id,
				name: entry.name,
				active: entry.id === meta.scratchpadData.activePadId,
				length: entry.content.length
			}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map((row) => `${row.active ? '*' : ' '} ${row.id}  ${row.name}`)
			);
		});

	pad
		.command('create <name>')
		.description('Create a scratchpad pad')
		.option('--project <id|name>', 'Project override')
		.action(async (name: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const meta = await fetchProjectScratchpadMeta(project.id);
			const nextPad = { id: createId(), name, content: '' };
			const nextData: ScratchpadData = {
				activePadId: nextPad.id,
				pads: [...meta.scratchpadData.pads, nextPad]
			};
			await updateProjectScratchpad(project.id, nextData, meta.scratchpadRev);
			console.log(`Created pad ${name} (${nextPad.id})`);
		});

	pad
		.command('rename <target> <newName>')
		.description('Rename a scratchpad pad')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, newName: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const meta = await fetchProjectScratchpadMeta(project.id);
			const selected = resolvePad(meta.scratchpadData, target);
			if (!selected) throw new Error('Pad not found.');

			const nextData: ScratchpadData = {
				...meta.scratchpadData,
				pads: meta.scratchpadData.pads.map((entry) =>
					entry.id === selected.id ? { ...entry, name: newName } : entry
				)
			};
			await updateProjectScratchpad(project.id, nextData, meta.scratchpadRev);
			console.log(`Renamed pad to ${newName}`);
		});

	pad
		.command('delete <target>')
		.description('Delete a scratchpad pad')
		.option('--project <id|name>', 'Project override')
		.action(async (target: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const meta = await fetchProjectScratchpadMeta(project.id);
			const selected = resolvePad(meta.scratchpadData, target);
			if (!selected) throw new Error('Pad not found.');
			if (meta.scratchpadData.pads.length <= 1) {
				throw new Error('Cannot delete the only scratchpad pad.');
			}

			const remaining = meta.scratchpadData.pads.filter((entry) => entry.id !== selected.id);
			const nextData: ScratchpadData = {
				activePadId:
					meta.scratchpadData.activePadId === selected.id
						? remaining[0]!.id
						: meta.scratchpadData.activePadId,
				pads: remaining
			};
			await updateProjectScratchpad(project.id, nextData, meta.scratchpadRev);
			console.log('Deleted pad');
		});
};
