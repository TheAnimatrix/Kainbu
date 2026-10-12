import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { parseJsonFile } from './jsonFile.js';
import { getCliConfigDir, getCliConfigPath } from './pocketbase.js';

const normalizeEnvValue = (value: string | undefined) =>
	(value || '')
		.trim()
		.replace(/^['"]|['"]$/g, '')
		.replace(/;+\s*$/, '');

const readConfigFileSync = () => {
	try {
		const raw = readFileSync(getCliConfigPath(), 'utf8');
		return parseJsonFile<Record<string, unknown>>(raw, getCliConfigPath()) || {};
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
		throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
			code: 'invalid_config'
		});
	}
};

let envLoaded = false;

/**
 * Load the CLI's own <config dir>/.env. Shell variables always win. Project
 * .env files are deliberately never read: they belong to whatever app lives in
 * the working directory and must not redirect the CLI to another server.
 */
export const loadCliEnv = () => {
	if (envLoaded) return;
	envLoaded = true;
	const globalEnv = join(getCliConfigDir(), '.env');
	if (existsSync(globalEnv)) {
		loadDotenv({ path: globalEnv, quiet: true });
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
	const globalEnv = join(getCliConfigDir(), '.env');

	return [
		'PocketBase is not configured.',
		'',
		'Add the URL using one of:',
		`  1. ${globalEnv}`,
		'     KAINBU_POCKETBASE_URL=http://127.0.0.1:8090',
		'  2. kainbu config set --pocketbase-url http://127.0.0.1:8090',
		'  3. export KAINBU_POCKETBASE_URL in your shell',
		'',
		'From a Kainbu repository with a .env file:  kainbu config import-env'
	].join('\n');
};
