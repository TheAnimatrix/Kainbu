import { randomUUID } from 'node:crypto';
import { deleteCliSession, fetchWorkspaceMe, type AuthProfileSummary } from '@kainbu/core';
import type { Command } from 'commander';
import { readJsonResponse } from '../http.js';
import { isInteractive, promptChoice, promptLine } from '../prompt.js';
import { getApiBase, initRuntime, resetRuntimeAccessToken } from '../runtime.js';
import { printError, printResult, type OutputMode } from '../output.js';
import { KainbuError } from '../errors.js';
import {
	getActiveAuthProfile,
	listAuthProfiles,
	removeAuthProfile,
	setActiveAuthProfile,
	upsertAuthProfile
} from '@kainbu/core';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatUserCode = (value: string) => {
	const compact = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
	if (compact.length <= 4) return compact;
	return `${compact.slice(0, 4)}-${compact.slice(4)}`;
};

const verifyApiKey = async (apiBase: string, apiKey: string) => {
	const response = await fetch(`${apiBase}/api/me`, {
		headers: { Authorization: `Bearer ${apiKey}` }
	});
	if (response.status === 401) {
		throw new KainbuError('Server rejected the API key (401).', {
			hint: 'Double-check the key on the server, or run: kainbu login --server <url> --api-key <new-key>'
		});
	}
	const payload = await readJsonResponse<{
		id?: string;
		email?: string | null;
		username?: string | null;
		auth_method?: string;
		error?: string;
	}>(response, 'API key verification');
	if (!response.ok) {
		throw new KainbuError(payload.error || `Server returned ${response.status}.`);
	}
	return {
		id: String(payload.id || ''),
		email: payload.email || null,
		username: payload.username || null
	};
};

type LoginArgs = {
	server?: string;
	apiKey?: string;
	profile?: string;
	device?: boolean;
	token?: string;
	code?: string;
	open?: boolean;
	switch?: boolean;
	rename?: string;
};

const resolveProfileName = async (
	argName: string | undefined,
	existing: AuthProfileSummary[]
): Promise<string> => {
	if (argName) return argName;
	const defaultName = existing.length === 0 ? 'default' : '';
	const answer = await promptLine(`Profile name${defaultName ? ` (${defaultName})` : ''}: `);
	const trimmed = (answer || '').trim();
	if (trimmed) return trimmed;
	if (defaultName) return defaultName;
	throw new KainbuError('Profile name is required.', {
		hint: 'Pass --profile <name> to set it explicitly.'
	});
};

const interactivePickProfile = async (profiles: AuthProfileSummary[]): Promise<AuthProfileSummary | null> => {
	if (profiles.length === 0) return null;
	const labels = [
		...profiles.map(
			(p, i) => `${i === 0 ? '* ' : '  '}${p.name}  (${p.apiBase}, ${p.lastUsedAt ? 'used ' + new Date(p.lastUsedAt).toLocaleString() : 'never used'})`
		),
		'+ Add a new profile'
	];
	const index = await promptChoice('Pick a profile:', labels);
	if (index === null) return null;
	if (index === labels.length) return null;
	return profiles[index - 1] || null;
};

export const registerAuthCommands = (program: Command) => {
	program
		.command('login')
		.description('Sign in with a server URL and API key (or use a saved profile)')
		.option('--server <url>', 'Server URL, e.g. https://kainbu.example.com')
		.option('--api-key <key>', 'API key (use --api-key - to read from stdin)')
		.option('--profile <name>', 'Save the credentials under this profile name')
		.option('--device', 'Use the device-code flow instead of an API key')
		.option('--token <jwt>', 'Sign in with a PocketBase auth token (CI/debug)')
		.option('--code <code>', 'Approve using a code from the browser')
		.option('--no-open', 'Do not open the browser automatically')
		.option('--switch', 'Pick a different saved profile even if one is active')
		.action(async (options: LoginArgs) => {
			const mode: OutputMode = { json: false, quiet: false };

			// PB JWT shortcut — used by the existing device-auth exchange.
			if (options.token) {
				const { getPocketBaseClient, setPocketBaseClient, createCliPocketBaseClient } = await import('../runtime.js');
				try {
					setPocketBaseClient(createCliPocketBaseClient());
				} catch {
					/* PB not configured; ignore */
				}
				const pb = getPocketBaseClient();
				pb.authStore.save(options.token, null);
				printResult(mode, { ok: true }, ['Logged in with provided token.']);
				return;
			}

			await initRuntime();
			const existing = await listAuthProfiles();
			const active = await getActiveAuthProfile();

			// Path 1: explicit --switch or no flags in interactive mode → pick profile
			if (options.switch || (existing.length > 0 && !options.server && !options.apiKey && !options.device)) {
				if (!isInteractive()) {
					throw new KainbuError('Multiple profiles are saved but no flags were given.', {
						hint: 'Use --profile <name>, --server, or --api-key.'
					});
				}
				const pick = await interactivePickProfile(existing);
				if (pick) {
					await setActiveAuthProfile(pick.name);
					resetRuntimeAccessToken();
					const apiBase = await getApiBase();
					const me = await fetchWorkspaceMe().catch((error) => {
						throw new KainbuError(`Saved key is no longer valid: ${error instanceof Error ? error.message : 'unknown'}`, {
							hint: 'Run: kainbu login --server <url> --api-key <new-key>'
						});
					});
					printResult(
						mode,
						{ ok: true, profile: pick.name, apiBase, user: me },
						[`Switched to profile "${pick.name}" (${me.email || me.username || me.id}).`]
					);
					return;
				}
				// User chose "Add a new profile" — fall through to creation.
			}

			// Path 2: device flow
			if (options.device) {
				await runDeviceFlow(options, mode);
				return;
			}

			// Path 3: interactive create or create from flags
			let server = options.server?.trim() || '';
			let apiKey = options.apiKey?.trim() || '';

			if (!server && isInteractive()) {
				const answer = await promptLine('Server URL (e.g. https://kainbu.example.com): ');
				server = (answer || '').trim();
			}
			if (!apiKey && options.apiKey === '-' && !isInteractive()) {
				// Read from stdin in non-interactive mode.
				const readAllStdin = async () => {
					const chunks: Buffer[] = [];
					process.stdin.on('data', (chunk) => {
						chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
					});
					await new Promise((resolve) => process.stdin.on('end', resolve));
					return Buffer.concat(chunks).toString('utf8').trim();
				};
				apiKey = await readAllStdin();
			}
			if (!apiKey && isInteractive()) {
				const answer = await promptLine('API key: ', { hidden: true });
				apiKey = (answer || '').trim();
			}

			if (!server) {
				throw new KainbuError('Server URL is required.', {
					hint: 'Pass --server <url> or run interactively in a TTY.'
				});
			}
			if (!apiKey) {
				throw new KainbuError('API key is required.', {
					hint: 'Pass --api-key <key> (or --api-key - to read from stdin) or run interactively in a TTY.'
				});
			}

			const profileName = await resolveProfileName(options.profile, existing);
			const identity = await verifyApiKey(server, apiKey);
			const profile = await upsertAuthProfile({
				name: profileName,
				apiBase: server,
				apiKey,
				setActive: true
			});
			resetRuntimeAccessToken();

			printResult(
				mode,
				{ ok: true, profile: profile.name, apiBase: server, user: identity },
				[
					`Logged in as ${identity.email || identity.username || identity.id} on ${server}.`,
					`Saved to profile "${profile.name}".`
				]
			);
		});

	program
		.command('logout')
		.description('Sign out and clear the active profile\'s key (does not delete the profile)')
		.action(async () => {
			await initRuntime();
			const { getPocketBaseClient, setPocketBaseClient, createCliPocketBaseClient } = await import('../runtime.js');
			try {
				setPocketBaseClient(createCliPocketBaseClient());
			} catch {
				/* PB not configured */
			}
			try {
				getPocketBaseClient().authStore.clear();
			} catch {
				/* PB not configured */
			}
			await deleteCliSession();
			resetRuntimeAccessToken();
			console.log('Logged out.');
		});

	program
		.command('whoami')
		.description('Show the signed-in user')
		.option('--json', 'Print JSON')
		.action(async (cmdOptions: { json?: boolean }) => {
			await initRuntime();
			try {
				const me = await fetchWorkspaceMe();
				printResult(
					{ json: Boolean(cmdOptions.json), quiet: false },
					{
						id: me.id,
						email: me.email,
						username: me.username,
						auth_method: me.auth_method,
						is_admin: me.is_admin
					},
					[
						`user: ${me.email || me.username || me.id}`,
						`auth: ${me.auth_method === 'api-key' ? 'API key' : 'PocketBase session'}`
					]
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Not logged in.';
				printError(message, 'Run: kainbu login --server <url> --api-key <key>');
				process.exit(1);
			}
		});

	const auth = program.command('auth').description('Authentication utilities');

	auth
		.command('profiles')
		.description('List, switch, or remove saved profiles')
		.option('--json', 'Print JSON')
		.option('--use <name>', 'Switch the active profile to <name>')
		.option('--remove <name>', 'Remove the named profile (prompts to confirm)')
		.option('--rename <name>', 'Rename the active profile to <name>')
		.action(
			async (cmdOptions: { json?: boolean; use?: string; remove?: string; rename?: string }) => {
				await initRuntime();

				if (cmdOptions.use) {
					const profile = await setActiveAuthProfile(cmdOptions.use);
					resetRuntimeAccessToken();
					printResult(
						{ json: Boolean(cmdOptions.json), quiet: false },
						{ ok: true, active: profile.name },
						[`Active profile: ${profile.name} (${profile.apiBase})`]
					);
					return;
				}

				if (cmdOptions.remove) {
					const profiles = await listAuthProfiles();
					const target = profiles.find((p) => p.name === cmdOptions.remove);
					if (!target) {
						throw new KainbuError(`No profile named "${cmdOptions.remove}".`);
					}
					if (isInteractive()) {
						const confirm = await promptLine(
							`Remove profile "${target.name}" (${target.apiBase})? [y/N] `
						);
						if ((confirm || '').trim().toLowerCase() !== 'y') {
							console.log('Cancelled.');
							return;
						}
					}
					const removed = await removeAuthProfile(target.name);
					resetRuntimeAccessToken();
					printResult(
						{ json: Boolean(cmdOptions.json), quiet: false },
						{ ok: removed, removed: target.name },
						[removed ? `Removed profile "${target.name}".` : 'No profile removed.']
					);
					return;
				}

				if (cmdOptions.rename) {
					const { readAuthFile, upsertAuthProfile, removeAuthProfile } = await import('@kainbu/core');
					const file = await readAuthFile();
					if (!file.activeProfile) {
						throw new KainbuError('No active profile to rename.');
					}
					const current = file.profiles[file.activeProfile];
					if (!current) {
						throw new KainbuError('Active profile is missing from auth.json.');
					}
					await upsertAuthProfile({
						name: cmdOptions.rename,
						apiBase: current.apiBase,
						apiKey: current.apiKey,
						setActive: true
					});
					if (cmdOptions.rename !== current.name) {
						await removeAuthProfile(current.name);
					}
					resetRuntimeAccessToken();
					printResult(
						{ json: Boolean(cmdOptions.json), quiet: false },
						{ ok: true, active: cmdOptions.rename },
						[`Renamed to "${cmdOptions.rename}".`]
					);
					return;
				}

				const profiles = await listAuthProfiles();
				const file = await (await import('@kainbu/core')).readAuthFile();
				printResult(
					{ json: Boolean(cmdOptions.json), quiet: false },
					{
						active: file.activeProfile,
						profiles
					},
					profiles.length === 0
						? ['No profiles yet. Run: kainbu login']
						: profiles.map((p) => `${file.activeProfile === p.name ? '* ' : '  '}${p.name}  ${p.apiBase}`)
				);
			}
		);

	auth
		.command('status')
		.description('Show auth and active context')
		.option('--json', 'Print JSON')
		.action(async (cmdOptions: { json?: boolean }) => {
			await initRuntime();
			const profiles = await listAuthProfiles();
			const file = await (await import('@kainbu/core')).readAuthFile();
			const apiBase = await getApiBase();
			const active = file.activeProfile ? file.profiles[file.activeProfile] : null;
			let me: Awaited<ReturnType<typeof fetchWorkspaceMe>> | null = null;
			let verifyError = '';
			try {
				me = await fetchWorkspaceMe();
			} catch (error) {
				verifyError = error instanceof Error ? error.message : String(error);
			}
			printResult(
				{ json: Boolean(cmdOptions.json), quiet: false },
				{
					active: file.activeProfile,
					apiBase,
					profiles: profiles.map((p) => ({
						name: p.name,
						apiBase: p.apiBase,
						lastUsedAt: p.lastUsedAt
					})),
					user: me,
					verifyError
				},
				[
					`api: ${apiBase}`,
					`active: ${file.activeProfile || '(none)'}`,
					`user: ${me ? (me.email || me.username || me.id) : verifyError || '(unverified)'}`
				]
			);
		});
};

// Keep the device flow for environments where the user doesn't have an API
// key yet (e.g. they're setting up a fresh self-hosted instance and the
// invite flow produces one later).
async function runDeviceFlow(options: LoginArgs, mode: OutputMode) {
	const apiBase = await getApiBase();
	const deviceId = randomUUID();

	const startResponse = await fetch(`${apiBase}/api/cli/device/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceId })
	});

	const startPayload = await readJsonResponse<{
		error?: string;
		userCode?: string;
		verificationUrl?: string;
		interval?: number;
	}>(startResponse, 'CLI device start');

	if (!startResponse.ok) {
		throw new KainbuError(startPayload.error || 'Unable to start CLI login.');
	}

	const userCode = formatUserCode(options.code || startPayload.userCode || '');
	const verificationUrl =
		startPayload.verificationUrl || `${apiBase}/cli/authorize?code=${encodeURIComponent(userCode)}`;

	console.log(`Device code: ${userCode}`);
	console.log(`If needed, open: ${verificationUrl}`);

	if (options.open !== false) {
		const { exec } = await import('node:child_process');
		const { promisify } = await import('node:util');
		const execAsync = promisify(exec);
		const platform = process.platform;
		const command =
			platform === 'win32'
				? `start "" "${verificationUrl}"`
				: platform === 'darwin'
					? `open "${verificationUrl}"`
					: `xdg-open "${verificationUrl}"`;
		await execAsync(command).catch(() => {
			console.log(`Open this URL in your browser:\n${verificationUrl}`);
		});
	}

	const pollIntervalMs = (startPayload.interval || 3) * 1000;
	const deadline = Date.now() + 10 * 60 * 1000;

	while (Date.now() < deadline) {
		await sleep(pollIntervalMs);
		const pollResponse = await fetch(`${apiBase}/api/cli/device/poll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ deviceId })
		});
		const pollPayload = await readJsonResponse<{
			status?: string;
			exchangeToken?: string;
			error?: string;
		}>(pollResponse, 'CLI device poll');

		if (!pollResponse.ok) {
			throw new KainbuError(pollPayload.error || 'CLI login poll failed.');
		}

		if (pollPayload.status === 'expired' || pollPayload.status === 'consumed') {
			throw new KainbuError('CLI login expired before approval.');
		}

		if (pollPayload.status === 'approved' && pollPayload.exchangeToken) {
			const exchangeResponse = await fetch(`${apiBase}/api/cli/device/exchange`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exchangeToken: pollPayload.exchangeToken })
			});
			const exchangePayload = await readJsonResponse<{
				error?: string;
				accessToken?: string;
				refreshToken?: string;
			}>(exchangeResponse, 'CLI device exchange');

			if (
				!exchangeResponse.ok ||
				!exchangePayload.accessToken ||
				!exchangePayload.refreshToken
			) {
				throw new KainbuError(exchangePayload.error || 'Unable to exchange CLI login.');
			}

			const { getPocketBaseClient, setPocketBaseClient, createCliPocketBaseClient } = await import('../runtime.js');
			try {
				setPocketBaseClient(createCliPocketBaseClient());
			} catch {
				/* ignore */
			}
			const pb = getPocketBaseClient();
			pb.authStore.save(
				exchangePayload.accessToken,
				(exchangePayload as { user?: Record<string, unknown> }).user || null
			);

			printResult(mode, { ok: true, email: exchangePayload }, ['Logged in successfully.']);
			return;
		}

		process.stdout.write('.');
	}

	throw new KainbuError('Timed out waiting for browser approval.');
}
