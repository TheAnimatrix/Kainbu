import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
	getCliConfigDir,
	getCliConfigPath,
	loadCliEnv,
	readCliConfig,
	writeCliConfig
} from '@kainbu/core';
import type { Command } from 'commander';
import { printResult } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';

const findProjectEnv = () => {
	let dir = process.cwd();
	for (let depth = 0; depth < 12; depth += 1) {
		const candidate = join(dir, '.env');
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
};

export const registerConfigCommands = (program: Command) => {
	const config = program.command('config').description('CLI configuration');

	config
		.command('path')
		.description('Show config directory paths')
		.action(() => {
			console.log(getCliConfigDir());
			console.log(getCliConfigPath());
			console.log(join(getCliConfigDir(), '.env'));
		});

	config
		.command('import-env')
		.description('Copy .env from the current project into ~/.config/kainbu/.env')
		.action(async () => {
			const source = findProjectEnv();
			if (!source) {
				throw new Error('No .env found in the current directory or parents.');
			}

			await mkdir(getCliConfigDir(), { recursive: true });
			const target = join(getCliConfigDir(), '.env');
			await copyFile(source, target);
			console.log(`${ui.success('Imported')} ${ui.id(source)} → ${ui.id(target)}`);
		});

	config
		.command('set')
		.description('Set a config value')
		.option('--pocketbase-url <url>', 'PocketBase URL')
		.option('--api-base <url>', 'Kainbu API base URL')
		.action(
			async (options: {
				pocketbaseUrl?: string;
				apiBase?: string;
			}) => {
				const current = await readCliConfig();
				await writeCliConfig({
					...current,
					...(options.pocketbaseUrl ? { pocketbaseUrl: options.pocketbaseUrl } : {}),
					...(options.apiBase ? { apiBase: options.apiBase } : {})
				});
				console.log(ui.success('Config updated.'));
			}
		);

	config
		.command('show')
		.description('Show resolved config (secrets redacted)')
		.option('--json', 'Print JSON')
		.action(async (options: { json?: boolean }) => {
			loadCliEnv();
			await initRuntime();
			const file = await readCliConfig();
			const envPath = join(getCliConfigDir(), '.env');
			let envKeys: string[] = [];
			try {
				const raw = await readFile(envPath, 'utf8');
				envKeys = raw
					.split('\n')
					.map((line) => line.split('=')[0]?.trim())
					.filter((key) => key && !key.startsWith('#'));
			} catch {
				// no global .env
			}

			const payload = {
				configDir: getCliConfigDir(),
				globalEnvFile: existsSync(envPath) ? envPath : null,
				globalEnvKeys: envKeys,
				activeProjectId: file.activeProjectId,
				activeBoardId: file.activeBoardId,
				apiBase: file.apiBase,
				hasPocketBaseUrl: Boolean(file.pocketbaseUrl)
			};

			printResult(
				{ json: Boolean(options.json), quiet: false },
				payload,
				[
					`${ui.meta('config:')} ${ui.id(getCliConfigDir())}`,
					`${ui.meta('global .env:')} ${payload.globalEnvFile ? ui.id(payload.globalEnvFile) : ui.warn('(missing)')}`,
					`${ui.meta('active project:')} ${file.activeProjectId ? ui.id(file.activeProjectId) : ui.warn('(none)')}`,
					`${ui.meta('active board:')} ${file.activeBoardId ? ui.id(file.activeBoardId) : ui.warn('(none)')}`
				]
			);
		});
};
