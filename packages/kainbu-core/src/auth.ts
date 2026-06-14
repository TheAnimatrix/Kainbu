import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getCliConfigDir } from './pocketbase.js';
import { parseJsonFile, quarantineCorruptFile } from './jsonFile.js';

export type AuthProfile = {
	name: string;
	apiBase: string;
	apiKey: string;
	createdAt: string;
	lastUsedAt: string | null;
};

export type AuthFile = {
	version: 1;
	activeProfile: string | null;
	profiles: Record<string, AuthProfile>;
};

export type AuthProfileSummary = Omit<AuthProfile, 'apiKey'> & { hasKey: boolean };

const AUTH_FILE_NAME = 'auth.json';

const getAuthFilePath = () => join(getCliConfigDir(), AUTH_FILE_NAME);

const isProfile = (value: unknown): value is AuthProfile => {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.name === 'string' &&
		typeof v.apiBase === 'string' &&
		typeof v.apiKey === 'string' &&
		typeof v.createdAt === 'string' &&
		(v.lastUsedAt === null || typeof v.lastUsedAt === 'string')
	);
};

const isAuthFile = (value: unknown): value is AuthFile => {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if (v.version !== 1) return false;
	if (typeof v.activeProfile !== 'string' && v.activeProfile !== null) return false;
	if (!v.profiles || typeof v.profiles !== 'object') return false;
	for (const profile of Object.values(v.profiles as Record<string, unknown>)) {
		if (!isProfile(profile)) return false;
	}
	return true;
};

const emptyAuthFile = (): AuthFile => ({ version: 1, activeProfile: null, profiles: {} });

const ensureAuthDir = async () => {
	await mkdir(getCliConfigDir(), { recursive: true });
};

const tryChmod600 = async (path: string) => {
	if (process.platform === 'win32') return;
	try {
		await chmod(path, 0o600);
	} catch {
		// Best-effort; on some filesystems (FAT, network mounts) chmod is a no-op.
	}
};

export const readAuthFile = async (): Promise<AuthFile> => {
	const path = getAuthFilePath();
	try {
		const raw = await readFile(path, 'utf8');
		const parsed = parseJsonFile<unknown>(raw, path);
		if (!isAuthFile(parsed)) {
			await quarantineCorruptFile(path, 'auth.json was not a valid AuthFile');
			return emptyAuthFile();
		}
		return parsed;
	} catch {
		return emptyAuthFile();
	}
};

export const writeAuthFile = async (file: AuthFile) => {
	await ensureAuthDir();
	const path = getAuthFilePath();
	// `mode` only applies when the file is created, so a fresh auth.json is
	// never world-readable even for an instant. tryChmod600 still tightens
	// pre-existing files on overwrite.
	await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
	await tryChmod600(path);
};

export const listAuthProfiles = async (): Promise<AuthProfileSummary[]> => {
	const file = await readAuthFile();
	return Object.values(file.profiles)
		.map(({ apiKey, ...summary }) => ({
			...summary,
			hasKey: Boolean(apiKey)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
};

export const getActiveAuthProfile = async (): Promise<AuthProfile | null> => {
	const file = await readAuthFile();
	if (!file.activeProfile) return null;
	return file.profiles[file.activeProfile] || null;
};

export type UpsertProfileInput = {
	name: string;
	apiBase: string;
	apiKey: string;
	setActive?: boolean;
};

const validateProfileName = (name: string) => {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Profile name is required.');
	if (trimmed.length > 64) throw new Error('Profile name is too long (max 64 chars).');
	if (!/^[A-Za-z0-9._\- ]+$/.test(trimmed)) {
		throw new Error('Profile name can only contain letters, numbers, spaces, dots, underscores and dashes.');
	}
	return trimmed;
};

const normalizeApiBase = (apiBase: string) => {
	const trimmed = apiBase.trim().replace(/\/+$/, '');
	if (!trimmed) throw new Error('Server URL is required.');
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error(`Invalid server URL: ${apiBase}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`Server URL must be http(s): ${apiBase}`);
	}
	return trimmed;
};

const validateApiKey = (apiKey: string) => {
	const trimmed = apiKey.trim();
	if (!trimmed) throw new Error('API key is required.');
	if (trimmed.length < 16) throw new Error('API key looks too short.');
	return trimmed;
};

export const upsertAuthProfile = async (input: UpsertProfileInput): Promise<AuthProfile> => {
	const name = validateProfileName(input.name);
	const apiBase = normalizeApiBase(input.apiBase);
	const apiKey = validateApiKey(input.apiKey);

	const file = await readAuthFile();
	const existing = file.profiles[name];
	const now = new Date().toISOString();
	const profile: AuthProfile = {
		name,
		apiBase,
		apiKey,
		createdAt: existing?.createdAt || now,
		lastUsedAt: existing?.lastUsedAt ?? null
	};
	file.profiles[name] = profile;
	if (input.setActive || !file.activeProfile) {
		file.activeProfile = name;
	}
	await writeAuthFile(file);
	return profile;
};

export const removeAuthProfile = async (name: string): Promise<boolean> => {
	const file = await readAuthFile();
	if (!file.profiles[name]) return false;
	delete file.profiles[name];
	if (file.activeProfile === name) {
		const remaining = Object.keys(file.profiles);
		file.activeProfile = remaining[0] ?? null;
	}
	await writeAuthFile(file);
	return true;
};

export const setActiveAuthProfile = async (name: string): Promise<AuthProfile> => {
	const file = await readAuthFile();
	const profile = file.profiles[name];
	if (!profile) {
		throw new Error(`No profile named "${name}". Run: kainbu auth profiles`);
	}
	file.activeProfile = name;
	await writeAuthFile(file);
	return profile;
};

export const touchActiveProfile = async (): Promise<void> => {
	const file = await readAuthFile();
	if (!file.activeProfile) return;
	const profile = file.profiles[file.activeProfile];
	if (!profile) return;
	profile.lastUsedAt = new Date().toISOString();
	await writeAuthFile(file);
};

export const updateActiveProfileApiBase = async (apiBase: string): Promise<AuthProfile | null> => {
	const file = await readAuthFile();
	if (!file.activeProfile) return null;
	const profile = file.profiles[file.activeProfile];
	if (!profile) return null;
	profile.apiBase = normalizeApiBase(apiBase);
	await writeAuthFile(file);
	return profile;
};

export const resolveEffectiveApiBase = (
	profile: { apiBase: string } | null | undefined,
	fallback: string
): string => profile?.apiBase?.trim() || fallback;

export const getAuthFileLocation = () => getAuthFilePath();
export { getCliConfigDir, homedir };
