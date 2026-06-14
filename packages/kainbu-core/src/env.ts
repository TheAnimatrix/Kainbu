import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { parseJsonFile } from './jsonFile.js';
import { getCliConfigDir, getCliConfigPath } from './pocketbase.js';

const normalizeEnvValue = (value: string | undefined) =>
	(value || '')
		.trim()
		.replace(/^['"]|['"]$/g, '')
		.replace(/;+\s*$/, '');

const collectEnvFilesUpward = (startDir: string) => {
	const chain: string[] = [];
	let dir = startDir;

	for (let depth = 0; depth < 12; depth += 1) {
		for (const name of ['.env', '.env.local']) {
			const candidate = join(dir, name);
			if (existsSync(candidate)) {
				chain.push(candidate);
			}
		}

		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return chain.reverse();
};

const readConfigFileSync = () => {
	try {
		const raw = readFileSync(getCliConfigPath(), 'utf8');
		return parseJsonFile<Record<string, unknown>>(raw, getCliConfigPath()) || {};
	} catch {
		return {};
	}
};

let envLoaded = false;

/** Load env from ~/.config/kainbu/.env, then project .env files (root → cwd). */
export const loadCliEnv = () => {
	if (envLoaded) return;
	envLoaded = true;

	const globalEnv = join(getCliConfigDir(), '.env');
	if (existsSync(globalEnv)) {
		loadDotenv({ path: globalEnv, quiet: true });
	}

	for (const path of collectEnvFilesUpward(process.cwd())) {
		loadDotenv({ path, override: true, quiet: true });
	}
};

export const getPocketBaseEnv = () => {
	loadCliEnv();
	const fileConfig = readConfigFileSync();

	const url = normalizeEnvValue(
		process.env.KAINBU_POCKETBASE_URL ||
			process.env.POCKETBASE_URL ||
			process.env.VITE_POCKETBASE_URL ||
			(typeof fileConfig.pocketbaseUrl === 'string' ? fileConfig.pocketbaseUrl : '')
	);

	return { url };
};

/**
 * Reads KAINBU_API_KEY from the process environment. Used by the runtime as
 * the CI / non-interactive fallback when no profile exists in auth.json.
 */
export const getEnvApiKey = (): string | null => {
	loadCliEnv();
	const raw = normalizeEnvValue(process.env.KAINBU_API_KEY);
	return raw || null;
};

export const getDefaultApiBase = () => {
	loadCliEnv();
	const fileConfig = readConfigFileSync();
	const configured = normalizeEnvValue(
		process.env.KAINBU_API_BASE ||
			process.env.VITE_API_BASE_URL ||
			process.env.PUBLIC_API_BASE_URL ||
			process.env.KAINBU_PUBLIC_URL ||
			(typeof fileConfig.apiBase === 'string' ? fileConfig.apiBase : '')
	);

	if (configured) {
		return configured.replace(/\/+$/, '');
	}

	return 'http://127.0.0.1:8788';
};

export const formatMissingPocketBaseConfigHelp = () => {
	const configDir = getCliConfigDir();
	const globalEnv = join(configDir, '.env');
	const cwdEnv = join(process.cwd(), '.env');

	return [
		'PocketBase is not configured.',
		'',
		'Add credentials using one of:',
		`  1. ${globalEnv}`,
		'     KAINBU_POCKETBASE_URL=http://127.0.0.1:8090',
		`  2. ${cwdEnv} (or a parent directory — same VITE_POCKETBASE_URL as the web app)`,
		'  3. export KAINBU_POCKETBASE_URL in your shell',
		'',
		'From a kainbu repo with .env:  kainbu config import-env'
	].join('\n');
};
