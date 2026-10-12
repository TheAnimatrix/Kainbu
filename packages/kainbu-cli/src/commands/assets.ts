import { createWriteStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Command } from 'commander';
import { resolveContext } from '../context.js';
import { KainbuError } from '../errors.js';
import { printResult, printSuccess } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import {
	deleteAsset,
	downloadAsset,
	listAssets,
	uploadAsset,
	type AssetTarget
} from '../writes.js';

const MAX_ASSET_BYTES = 20 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
	'.csv': 'text/csv',
	'.json': 'application/json',
	'.html': 'text/html',
	'.zip': 'application/zip',
	'.mp4': 'video/mp4',
	'.mp3': 'audio/mpeg'
};

const formatSize = (bytes: number) =>
	bytes < 1024
		? `${bytes} B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(1)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** `filename*=UTF-8''…` from the download response. */
const dispositionName = (header: string | null) => {
	const match = header?.match(/filename\*=UTF-8''([^;]+)/i);
	return match ? decodeURIComponent(match[1]) : undefined;
};

type TargetOptions = { project?: string; board?: string };

export type AssetHost = {
	target: AssetTarget;
	label: string;
	/** Task targets are refs on a board; page targets are project-level. */
	boardScoped: boolean;
	resolve: (
		options: TargetOptions,
		value: string,
		write: boolean
	) => Promise<{ projectId: string; targetId: string; name: string }>;
};

export const registerAssetCommands = (parent: Command, host: AssetHost) => {
	const group = parent
		.command('attachment')
		.alias('attachments')
		.description(`Manage ${host.label} attachments (up to 20 MB each)`);
	const scope = (cmd: Command) => {
		cmd.option('--project <id|name>', 'Project override');
		if (host.boardScoped) cmd.option('--board <id|name>', 'Board override');
		return cmd;
	};

	scope(group.command(`list <${host.label}>`).description(`List attachments on a ${host.label}`))
		.option('--json', 'Print JSON')
		.action(async (value: string, options: TargetOptions & { json?: boolean }) => {
			await initRuntime();
			const target = await host.resolve(options, value, false);
			const { assets } = await listAssets(target.projectId, host.target, target.targetId);
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ projectId: target.projectId, [`${host.target}Id`]: target.targetId, assets },
				assets.length
					? assets.map(
							(asset) =>
								`${ui.id(asset.id)}  ${ui.name(asset.name)}  ${ui.meta(`${formatSize(asset.sizeBytes)} · ${asset.mimeType}${asset.kind === 'embed' ? ' · embedded' : ''}`)}`
						)
					: [ui.meta('No attachments.')]
			);
		});

	scope(
		group
			.command(`add <${host.label}> <file>`)
			.description(`Upload a file to a ${host.label}`)
			.option('--name <name>', 'Stored file name (default: the file name)')
			.option('--type <mime>', 'MIME type (default: from the file extension)')
	).action(
		async (
			value: string,
			path: string,
			options: TargetOptions & { name?: string; type?: string }
		) => {
			await initRuntime();
			const info = await stat(path).catch(() => null);
			if (!info?.isFile())
				throw new KainbuError(`File not found: ${path}`, { code: 'not_found', exitCode: 4 });
			if (info.size > MAX_ASSET_BYTES)
				throw new KainbuError(
					`File is ${formatSize(info.size)}; attachments are limited to 20 MB.`,
					{
						code: 'too_large',
						exitCode: 2
					}
				);
			const target = await host.resolve(options, value, true);
			const name = options.name?.trim() || basename(path);
			const type =
				options.type || MIME_TYPES[extname(name).toLowerCase()] || 'application/octet-stream';
			const file = new File([await readFile(path)], name, { type });
			const { asset } = await uploadAsset(
				target.projectId,
				host.target,
				target.targetId,
				file,
				'attachment'
			);
			printSuccess(
				{ id: asset.id, projectId: target.projectId, [`${host.target}Id`]: target.targetId, asset },
				`${ui.success('Attached')} ${ui.name(asset.name)} ${ui.meta(`to ${target.name}`)} ${ui.id(`(${asset.id})`)}`
			);
		}
	);

	group
		.command('download <attachmentId>')
		.description('Download an attachment')
		.option('-o, --output <path>', 'Destination file, or - for stdout (default: its name)')
		.option('--force', 'Overwrite an existing file')
		.option('--project <id|name>', 'Project override')
		.action(
			async (assetId: string, options: { output?: string; force?: boolean; project?: string }) => {
				await initRuntime();
				const { project } = await resolveContext({ project: options.project, requireBoard: false });
				const response = await downloadAsset(project.id, host.target, assetId);
				const body = Readable.fromWeb(response.body as unknown as WebReadableStream);
				if (options.output === '-') {
					await pipeline(body, process.stdout);
					return;
				}
				const name = dispositionName(response.headers.get('content-disposition')) || assetId;
				const destination = resolve(options.output || basename(name));
				if (
					!options.force &&
					(await access(destination).then(
						() => true,
						() => false
					))
				) {
					body.destroy();
					throw new KainbuError(`File already exists: ${destination}`, {
						code: 'invalid_arguments',
						exitCode: 2,
						hint: 'Pass --force to overwrite, or --output to choose another path.'
					});
				}
				await pipeline(body, createWriteStream(destination));
				printSuccess(
					{ id: assetId, projectId: project.id, path: destination },
					`${ui.success('Saved')} ${ui.name(destination)}`
				);
			}
		);

	group
		.command('delete <attachmentId>')
		.description('Delete an attachment')
		.option('--project <id|name>', 'Project override')
		.action(async (assetId: string, options: { project?: string }) => {
			await initRuntime();
			const { project } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			await deleteAsset(project.id, host.target, assetId);
			printSuccess(
				{ id: assetId, projectId: project.id, deleted: true },
				ui.removed('Deleted attachment')
			);
		});
};
