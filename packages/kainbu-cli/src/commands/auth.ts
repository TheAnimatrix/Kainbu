import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { deleteCliSession, getDefaultApiBase, readCliConfig } from '@kainbu/core';
import type { Command } from 'commander';
import { readJsonResponse } from '../http.js';
import { getApiBase, getPocketBaseClient, initRuntime } from '../runtime.js';
import { printError, printResult, type OutputMode } from '../output.js';

const execAsync = promisify(exec);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const openBrowser = async (url: string) => {
	const platform = process.platform;
	const command =
		platform === 'win32'
			? `start "" "${url}"`
			: platform === 'darwin'
				? `open "${url}"`
				: `xdg-open "${url}"`;
	await execAsync(command).catch(() => {
		console.log(`Open this URL in your browser:\n${url}`);
	});
};

const formatUserCode = (value: string) => {
	const compact = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
	if (compact.length <= 4) return compact;
	return `${compact.slice(0, 4)}-${compact.slice(4)}`;
};

export const registerAuthCommands = (program: Command) => {
	program
		.command('login')
		.description('Sign in via browser device code')
		.option('--code <code>', 'Approve using a code from the browser')
		.option('--token <jwt>', 'Sign in with a PocketBase auth token (CI/debug)')
		.option('--no-open', 'Do not open the browser automatically')
		.action(async (options: { code?: string; token?: string; open?: boolean }) => {
			const mode: OutputMode = { json: false, quiet: false };
			await initRuntime();

			if (options.token) {
				const pb = getPocketBaseClient();
				pb.authStore.save(options.token, null);
				printResult(mode, { ok: true }, ['Logged in with provided token.']);
				return;
			}

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
				printError(startPayload.error || 'Unable to start CLI login.');
				process.exit(1);
			}

			const userCode = formatUserCode(options.code || startPayload.userCode || '');
			const verificationUrl =
				startPayload.verificationUrl ||
				`${getDefaultApiBase()}/cli/authorize?code=${encodeURIComponent(userCode)}`;

			console.log(`Device code: ${userCode}`);
			console.log(`If needed, open: ${verificationUrl}`);

			if (options.open !== false) {
				await openBrowser(verificationUrl);
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
					printError(pollPayload.error || 'CLI login poll failed.');
					process.exit(1);
				}

				if (pollPayload.status === 'expired' || pollPayload.status === 'consumed') {
					printError('CLI login expired before approval.');
					process.exit(1);
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

					if (!exchangeResponse.ok || !exchangePayload.accessToken || !exchangePayload.refreshToken) {
						printError(exchangePayload.error || 'Unable to exchange CLI login.');
						process.exit(1);
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

			console.log('');
			printError('Timed out waiting for browser approval.');
			process.exit(1);
		});

	program
		.command('logout')
		.description('Remove the local CLI session')
		.action(async () => {
			await initRuntime();
			getPocketBaseClient().authStore.clear();
			await deleteCliSession();
			console.log('Logged out.');
		});

	program
		.command('whoami')
		.description('Show the signed-in user')
		.option('--json', 'Print JSON')
		.action(async (options: { json?: boolean }) => {
			await initRuntime();
			const {
				data: { user }
			} = { data: { user: getPocketBaseClient().authStore.model } };
			if (!user) {
				printError('Not logged in.', 'Run: kainbu login');
				process.exit(1);
			}
			printResult(
				{ json: Boolean(options.json), quiet: false },
				{ id: user.id, email: user.email },
				[`${user.email || user.id}`]
			);
		});

	const auth = program.command('auth').description('Authentication utilities');

	auth
		.command('status')
		.description('Show auth and active context')
		.option('--json', 'Print JSON')
		.action(async (options: { json?: boolean }) => {
			await initRuntime();
			const config = await readCliConfig();
			const {
				data: { session }
			} = {
				data: {
					session: getPocketBaseClient().authStore.isValid
						? {
								user: getPocketBaseClient().authStore.model,
								expires_at: undefined
							}
						: null
				}
			};
			const apiBase = await getApiBase();

			printResult(
				{ json: Boolean(options.json), quiet: false },
				{
					loggedIn: Boolean(session),
					email: session?.user?.email,
					expiresAt: session?.expires_at,
					apiBase,
					activeProjectId: config.activeProjectId,
					activeBoardId: config.activeBoardId
				},
				[
					session?.user?.email ? `user: ${session.user.email}` : 'user: (not logged in)',
					`api: ${apiBase}`,
					`project: ${config.activeProjectId || '(none)'}`,
					`board: ${config.activeBoardId || '(none)'}`
				]
			);
		});
};
