import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { parseJsonFile } from './jsonFile.js';
import { getCliConfigDir, getCliConfigPath } from './supabase.js';

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

export const getSupabaseEnv = () => {
	loadCliEnv();
	const fileConfig = readConfigFileSync();

	const url = normalizeEnvValue(
		process.env.KAINBU_SUPABASE_URL ||
			process.env.VITE_SUPABASE_URL ||
			process.env.PUBLIC_SUPABASE_URL ||
			(typeof fileConfig.supabaseUrl === 'string' ? fileConfig.supabaseUrl : '')
	);

	const anonKey = normalizeEnvValue(
		process.env.KAINBU_SUPABASE_ANON_KEY ||
			process.env.VITE_SUPABASE_ANON_KEY ||
			process.env.PUBLIC_SUPABASE_ANON_KEY ||
			(typeof fileConfig.supabaseAnonKey === 'string' ? fileConfig.supabaseAnonKey : '')
	);

	return { url, anonKey };
};

export const getDefaultApiBase = () => {
	loadCliEnv();
	const fileConfig = readConfigFileSync();
	const configured = normalizeEnvValue(
		process.env.KAINBU_API_BASE ||
			process.env.VITE_API_BASE_URL ||
			process.env.PUBLIC_API_BASE_URL ||
			(typeof fileConfig.apiBase === 'string' ? fileConfig.apiBase : '')
	);

	if (configured) {
		return configured.replace(/\/+$/, '');
	}

	return 'https://kainbu.vercel.app';
};

export const formatMissingSupabaseConfigHelp = () => {
	const configDir = getCliConfigDir();
	const globalEnv = join(configDir, '.env');
	const cwdEnv = join(process.cwd(), '.env');

	return [
		'Supabase is not configured.',
		'',
		'Add credentials using one of:',
		`  1. ${globalEnv}`,
		'     KAINBU_SUPABASE_URL=https://….supabase.co',
		'     KAINBU_SUPABASE_ANON_KEY=eyJ…',
		`  2. ${cwdEnv} (or a parent directory — same VITE_* names as the web app)`,
		'  3. export KAINBU_SUPABASE_URL / KAINBU_SUPABASE_ANON_KEY in your shell',
		'',
		'From a kainbu repo with .env:  kainbu config import-env'
	].join('\n');
};
