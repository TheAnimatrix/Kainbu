import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;
let originalPlatform: NodeJS.Platform;

const loadAuthModule = async () => {
	// Reset the module so it re-evaluates after we mock the config dir.
	vi.resetModules();
	const mod = await import('../packages/kainbu-core/src/auth.js');
	return mod;
};

describe('CLI auth.json', () => {
	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'kainbu-auth-'));
		originalPlatform = process.platform;
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		// getCliConfigDir lives in pocketbase.js. Stub APPDATA / XDG_CONFIG_HOME
		// for the duration of the test.
		process.env.XDG_CONFIG_HOME = tempDir;
		delete process.env.APPDATA;
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
		delete process.env.XDG_CONFIG_HOME;
		process.env.APPDATA = originalPlatform === 'win32' ? tempDir : undefined;
	});

	it('returns an empty file when none exists', async () => {
		const { readAuthFile, getAuthFileLocation } = await loadAuthModule();
		expect(getAuthFileLocation()).toBe(join(tempDir, 'kainbu', 'auth.json'));
		const file = await readAuthFile();
		expect(file).toEqual({ version: 1, activeProfile: null, profiles: {} });
	});

	it('upserts a profile and promotes it to active when none was set', async () => {
		const { upsertAuthProfile, getActiveAuthProfile, readAuthFile } = await loadAuthModule();
		const profile = await upsertAuthProfile({
			name: 'work',
			apiBase: 'https://kainbu.example.com',
			apiKey: 'kb_secret_super_long_key_for_test'
		});
		expect(profile.name).toBe('work');
		expect(profile.createdAt).toBeTruthy();
		const active = await getActiveAuthProfile();
		expect(active?.name).toBe('work');
		const file = await readAuthFile();
		expect(file.activeProfile).toBe('work');
	});

	it('rejects an invalid server URL', async () => {
		const { upsertAuthProfile } = await loadAuthModule();
		await expect(
			upsertAuthProfile({ name: 'x', apiBase: 'not a url', apiKey: 'kb_valid_key_long' })
		).rejects.toThrow(/Invalid server URL/);
	});

	it('rejects non-http(s) URLs', async () => {
		const { upsertAuthProfile } = await loadAuthModule();
		await expect(
			upsertAuthProfile({ name: 'x', apiBase: 'ftp://example.com', apiKey: 'kb_valid_key_long' })
		).rejects.toThrow(/http\(s\)/);
	});

	it('rejects too-short API keys', async () => {
		const { upsertAuthProfile } = await loadAuthModule();
		await expect(
			upsertAuthProfile({ name: 'x', apiBase: 'https://example.com', apiKey: 'short' })
		).rejects.toThrow(/too short/);
	});

	it('removes a profile and reassigns the active pointer', async () => {
		const { upsertAuthProfile, removeAuthProfile, setActiveAuthProfile, getActiveAuthProfile } =
			await loadAuthModule();
		await upsertAuthProfile({ name: 'a', apiBase: 'https://a.example.com', apiKey: 'kb_valid_key_long_a' });
		await upsertAuthProfile({ name: 'b', apiBase: 'https://b.example.com', apiKey: 'kb_valid_key_long_b' });
		await setActiveAuthProfile('a');
		expect((await getActiveAuthProfile())?.name).toBe('a');

		const removed = await removeAuthProfile('a');
		expect(removed).toBe(true);
		// 'b' was the only remaining profile so it should be auto-promoted.
		expect((await getActiveAuthProfile())?.name).toBe('b');
	});

	it('lists profile summaries without the raw key', async () => {
		const { upsertAuthProfile, listAuthProfiles } = await loadAuthModule();
		await upsertAuthProfile({ name: 'a', apiBase: 'https://a.example.com', apiKey: 'kb_valid_key_long_a' });
		const list = await listAuthProfiles();
		expect(list).toHaveLength(1);
		expect(list[0]).not.toHaveProperty('apiKey');
		expect(list[0].hasKey).toBe(true);
		expect(list[0].apiBase).toBe('https://a.example.com');
	});
});
