import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { formatMissingSupabaseConfigHelp, getSupabaseEnv } from './env.js';
import { parseJsonFile, quarantineCorruptFile } from './jsonFile.js';

const AUTH_STORAGE_KEY = 'kainbu-auth';

export type CliConfig = {
	activeProjectId?: string;
	activeBoardId?: string;
	apiBase?: string;
	defaultLimit?: number;
	supabaseUrl?: string;
	supabaseAnonKey?: string;
};

export const getCliConfigDir = () => {
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
		return join(appData, 'kainbu');
	}

	const xdg = process.env.XDG_CONFIG_HOME;
	if (xdg) return join(xdg, 'kainbu');
	return join(homedir(), '.config', 'kainbu');
};

export const getCliSessionPath = () => join(getCliConfigDir(), 'session.json');
export const getCliConfigPath = () => join(getCliConfigDir(), 'config.json');

const ensureConfigDir = async () => {
	await mkdir(getCliConfigDir(), { recursive: true });
};

const isSessionPayload = (value: unknown) =>
	value !== null &&
	typeof value === 'object' &&
	'access_token' in value &&
	typeof (value as { access_token?: unknown }).access_token === 'string';

const normalizeStoredSession = (raw: string) => {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}

	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return null;
		}
	}

	if (isSessionPayload(parsed)) {
		return JSON.stringify(parsed);
	}

	if (parsed && typeof parsed === 'object' && AUTH_STORAGE_KEY in parsed) {
		const wrapped = (parsed as Record<string, unknown>)[AUTH_STORAGE_KEY];
		if (typeof wrapped === 'string') {
			try {
				const inner = JSON.parse(wrapped);
				if (isSessionPayload(inner)) return wrapped;
			} catch {
				return null;
			}
		}
		if (isSessionPayload(wrapped)) {
			return JSON.stringify(wrapped);
		}
	}

	return null;
};

export const readCliConfig = async (): Promise<CliConfig> => {
	const path = getCliConfigPath();
	try {
		const raw = await readFile(path, 'utf8');
		return parseJsonFile<CliConfig>(raw, path) || {};
	} catch (error) {
		if (error instanceof Error && error.message.includes('not valid JSON')) {
			await quarantineCorruptFile(path, 'config.json parse error');
			return {};
		}
		return {};
	}
};

export const writeCliConfig = async (config: CliConfig) => {
	await ensureConfigDir();
	await writeFile(getCliConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

export const deleteCliSession = async () => {
	try {
		await unlink(getCliSessionPath());
	} catch {
		// no session file
	}
};

export const createFileAuthStorage = (sessionPath = getCliSessionPath()) => ({
	getItem: async (key: string) => {
		if (key !== AUTH_STORAGE_KEY) return null;
		try {
			const raw = await readFile(sessionPath, 'utf8');
			const normalized = normalizeStoredSession(raw);
			if (!normalized) {
				await quarantineCorruptFile(sessionPath, 'session.json was not a valid Supabase session');
				return null;
			}
			return normalized;
		} catch {
			return null;
		}
	},
	setItem: async (key: string, value: string) => {
		if (key !== AUTH_STORAGE_KEY) return;
		await ensureConfigDir();
		await writeFile(sessionPath, value, 'utf8');
	},
	removeItem: async (key: string) => {
		if (key !== AUTH_STORAGE_KEY) return;
		await deleteCliSession();
	}
});

export { formatMissingSupabaseConfigHelp, getDefaultApiBase, getSupabaseEnv, loadCliEnv } from './env.js';

export const createCliSupabaseClient = (): SupabaseClient => {
	const { url, anonKey } = getSupabaseEnv();
	if (!url || !anonKey) {
		throw new Error(formatMissingSupabaseConfigHelp());
	}

	return createClient(url, anonKey, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: false,
			storageKey: AUTH_STORAGE_KEY,
			storage: createFileAuthStorage()
		}
	});
};
