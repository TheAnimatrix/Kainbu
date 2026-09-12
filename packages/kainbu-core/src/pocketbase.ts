import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import PocketBase from 'pocketbase';
import { formatMissingPocketBaseConfigHelp, getPocketBaseEnv } from './env.js';
import { parseJsonFile, quarantineCorruptFile } from './jsonFile.js';

export type CliConfig = {
	activeProjectId?: string;
	activeBoardId?: string;
	apiBase?: string;
	defaultLimit?: number;
	pocketbaseUrl?: string;
};

export const getCliConfigDir = () => {
	if (process.env.KAINBU_CONFIG_DIR?.trim()) return process.env.KAINBU_CONFIG_DIR.trim();
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

type StoredSession = {
	token: string;
	record?: Record<string, unknown>;
};

const isStoredSession = (value: unknown): value is StoredSession =>
	value !== null && typeof value === 'object' && typeof (value as StoredSession).token === 'string';

export const readCliConfig = async (): Promise<CliConfig> => {
	const path = getCliConfigPath();
	try {
		const raw = await readFile(path, 'utf8');
		const config = parseJsonFile<CliConfig>(raw, path);
		if (
			!config ||
			typeof config !== 'object' ||
			Array.isArray(config) ||
			['activeProjectId', 'activeBoardId', 'apiBase', 'pocketbaseUrl'].some(
				(key) => key in config && typeof config[key as keyof CliConfig] !== 'string'
			)
		)
			throw new Error(`${path} is not a valid CLI config.`);
		return config;
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
		throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
			code: 'invalid_config'
		});
	}
};

export const writeCliConfig = async (config: CliConfig) => {
	await ensureConfigDir();
	await writeFile(getCliConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

export const readCliSession = async (): Promise<StoredSession | null> => {
	try {
		const raw = await readFile(getCliSessionPath(), 'utf8');
		const parsed = parseJsonFile<unknown>(raw, getCliSessionPath());
		if (!isStoredSession(parsed)) {
			await quarantineCorruptFile(
				getCliSessionPath(),
				'session.json was not a valid PocketBase session'
			);
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
};

export const writeCliSession = async (session: StoredSession) => {
	await ensureConfigDir();
	await writeFile(getCliSessionPath(), `${JSON.stringify(session, null, 2)}\n`, 'utf8');
};

export const deleteCliSession = async () => {
	try {
		await unlink(getCliSessionPath());
	} catch {
		// no session file
	}
};

export {
	formatMissingPocketBaseConfigHelp,
	getDefaultApiBase,
	getPocketBaseEnv,
	loadCliEnv
} from './env.js';

export const createCliPocketBaseClient = () => {
	const { url } = getPocketBaseEnv();
	if (!url) {
		throw new Error(formatMissingPocketBaseConfigHelp());
	}

	const pb = new PocketBase(url);

	try {
		const raw = readFileSync(getCliSessionPath(), 'utf8');
		const parsed = parseJsonFile<unknown>(raw, getCliSessionPath());
		if (isStoredSession(parsed)) {
			pb.authStore.save(parsed.token, (parsed.record as never) || null);
		}
	} catch {
		// no session yet
	}

	pb.authStore.onChange((token, model) => {
		if (token) {
			void writeCliSession({ token, record: model || undefined });
			return;
		}
		void deleteCliSession();
	});

	return pb;
};
