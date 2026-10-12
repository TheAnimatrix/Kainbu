import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import {
	getCliConfigDir,
	getCliConfigPath,
	loadCliEnv,
	readCliConfig,
	writeCliConfig
} from '@kainbu/core';
import type { Command } from 'commander';
import { printSuccess, printResult } from '../output.js';
import { ui } from '../color.js';
import { initRuntime } from '../runtime.js';
import { KainbuError } from '../errors.js';

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

const PROJECT_POCKETBASE_KEYS = ['KAINBU_POCKETBASE_URL', 'POCKETBASE_URL', 'VITE_POCKETBASE_URL'];

const parseHttpUrl = (value: string, label: string) => {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new KainbuError(`Invalid ${label}: ${value}`, { code: 'invalid_arguments', exitCode: 2 });
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
		throw new KainbuError(`${label} must be an HTTP(S) URL without embedded credentials.`, {
			code: 'invalid_arguments',
			exitCode: 2
		});
	return url.href.replace(/\/+$/, '');
};

export const registerConfigCommands = (program: Command) => {
	const config = program.command('config').description('CLI configuration');

	config
		.command('path')
		.description('Show config directory paths')
		.action(() => {
			printResult(
				{ json: false, quiet: false },
				{
					directory: getCliConfigDir(),
					config: getCliConfigPath(),
					env: join(getCliConfigDir(), '.env')
				},
				[getCliConfigDir(), getCliConfigPath(), join(getCliConfigDir(), '.env')]
			);
		});

	config
		.command('import-env')
		.description("Save the PocketBase URL from the current project's .env to the CLI config")
		.action(async () => {
			const source = findProjectEnv();
			if (!source)
				throw new KainbuError('No .env found in the current directory or parents.', {
					code: 'not_found',
					exitCode: 4
				});

			// Only the PocketBase URL is copied; project .env files also hold server secrets.
			const values = parseDotenv(await readFile(source, 'utf8'));
			const key = PROJECT_POCKETBASE_KEYS.find((name) => values[name]?.trim());
			if (!key)
				throw new KainbuError(`No PocketBase URL in ${source}.`, {
					code: 'not_found',
					exitCode: 4,
					hint: `Expected one of: ${PROJECT_POCKETBASE_KEYS.join(', ')}.`
				});
			const pocketbaseUrl = parseHttpUrl(values[key]!, key);
			await writeCliConfig({ ...(await readCliConfig()), pocketbaseUrl });
			printSuccess(
				{ source, key, pocketbaseUrl, target: getCliConfigPath() },
				`${ui.success('Saved PocketBase URL')} ${ui.id(pocketbaseUrl)} ${ui.meta(`from ${source}`)}`
			);
		});

	config
		.command('set')
		.description('Set a config value')
		.option('--pocketbase-url <url>', 'PocketBase URL')
		.option('--api-base <url>', 'Kainbu API base URL')
		.action(async (options: { pocketbaseUrl?: string; apiBase?: string }) => {
			const current = await readCliConfig();
			await writeCliConfig({
				...current,
				...(options.pocketbaseUrl
					? { pocketbaseUrl: parseHttpUrl(options.pocketbaseUrl, 'PocketBase URL') }
					: {}),
				...(options.apiBase ? { apiBase: parseHttpUrl(options.apiBase, 'API base URL') } : {})
			});
			printSuccess({}, ui.success('Config updated.'));
		});

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

			printResult({ json: Boolean(options.json), quiet: false }, payload, [
				`${ui.meta('config:')} ${ui.id(getCliConfigDir())}`,
				`${ui.meta('global .env:')} ${payload.globalEnvFile ? ui.id(payload.globalEnvFile) : ui.warn('(missing)')}`,
				`${ui.meta('active project:')} ${file.activeProjectId ? ui.id(file.activeProjectId) : ui.warn('(none)')}`,
				`${ui.meta('active board:')} ${file.activeBoardId ? ui.id(file.activeBoardId) : ui.warn('(none)')}`
			]);
		});
};
