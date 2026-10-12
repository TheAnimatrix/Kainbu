import { loadWorkspace } from '../workspace.js';
import { listAuthProfiles, readAuthFile, upsertAuthProfile } from '@kainbu/core';
import type { Command } from 'commander';
import { c, ui } from '../color.js';
import { setActiveBoard, setActiveProject } from '../context.js';
import { KainbuError } from '../errors.js';
import { isInteractive, promptLine } from '../prompt.js';
import { initRuntime, requireUser, resolveCredentials } from '../runtime.js';
import { openInBrowser, parseServerUrl, resolveProfileName, verifyApiKey } from './auth.js';

const DEFAULT_SERVER = 'https://kainbu.avarnic.com';
const MAX_KEY_ATTEMPTS = 3;

/** True when no credentials are available: a first run, or after `kainbu logout`. */
export const needsSetup = async () => {
	await initRuntime();
	return !(await resolveCredentials()).token;
};

/** Prompt for a line; end of input cancels setup instead of looping. */
const ask = async (question: string, options?: { hidden?: boolean }) => {
	const answer = await promptLine(question, options);
	if (answer === null)
		throw new KainbuError('Setup cancelled.', { code: 'cancelled', exitCode: 130 });
	return answer.trim();
};

const askServer = async () => {
	for (;;) {
		const answer = await ask(`Server URL ${ui.meta(`(${DEFAULT_SERVER})`)}: `);
		try {
			return parseServerUrl(answer || DEFAULT_SERVER);
		} catch (error) {
			console.log(ui.warn(error instanceof Error ? error.message : String(error)));
		}
	}
};

const askApiKey = async (server: string) => {
	for (let attempt = 1; ; attempt += 1) {
		const apiKey = await ask('Paste your API key: ', { hidden: true });
		try {
			if (!apiKey)
				throw new KainbuError('No API key entered.', { code: 'input_required', exitCode: 2 });
			return { apiKey, identity: await verifyApiKey(server, apiKey) };
		} catch (error) {
			const retryable =
				error instanceof KainbuError && ['unauthenticated', 'input_required'].includes(error.code);
			if (!retryable || attempt >= MAX_KEY_ATTEMPTS) throw error;
			console.log(
				ui.warn(
					error.code === 'unauthenticated'
						? 'The server rejected that key. Check that you copied all of it.'
						: error.message
				)
			);
		}
	}
};

const pick = async <T>(question: string, items: T[], label: (item: T) => string) => {
	if (items.length === 1) return items[0]!;
	console.log(question);
	items.forEach((item, index) => console.log(`  ${index + 1}) ${label(item)}`));
	for (;;) {
		const index = Number(await ask('> '));
		if (Number.isInteger(index) && index >= 1 && index <= items.length) return items[index - 1]!;
		console.log(ui.warn(`Enter a number from 1 to ${items.length}.`));
	}
};

/** Interactive first-run setup: sign in, then choose the active project and board. */
export const runSetup = async () => {
	if (!isInteractive())
		throw new KainbuError('Setup needs an interactive terminal.', {
			code: 'input_required',
			exitCode: 2,
			hint: 'Use kainbu login --server <url> --api-key - instead.'
		});

	console.log(`${ui.heading('Welcome to Kainbu.')} Let's connect this terminal to your workspace.`);
	console.log(ui.meta('Press Ctrl+C to stop at any time.\n'));

	console.log(`${ui.heading('1.')} Which Kainbu server do you use? Press Enter for the default.`);
	const server = await askServer();

	console.log(
		`\n${ui.heading('2.')} Create an API key: in Kainbu, open ${ui.name('Settings → Access')}, choose ${ui.name('Create key')}, and copy it.`
	);
	const openAnswer = await ask(`Open ${server} in your browser now? [Y/n] `);
	if (!/^n/i.test(openAnswer) && !(await openInBrowser(server)))
		console.log(ui.warn(`Couldn't open a browser. Go to ${server} yourself.`));

	const { apiKey, identity } = await askApiKey(server);
	const auth = await readAuthFile();
	const active = auth.activeProfile ? auth.profiles[auth.activeProfile] : undefined;
	// First account is "default"; a signed-out profile for the same server is reused.
	const profiles = await listAuthProfiles();
	const profileName = !profiles.length
		? 'default'
		: active?.apiBase === server
			? active.name
			: await resolveProfileName(undefined, profiles);
	await upsertAuthProfile({ name: profileName, apiBase: server, apiKey, setActive: true });
	console.log(
		`${ui.success('Signed in as')} ${ui.name(identity.email || identity.username || identity.id)}`
	);

	await initRuntime();
	await requireUser();
	const { projects } = await loadWorkspace();
	if (!projects.length) {
		console.log(
			`\nYou don't have any projects yet. Create one in the web app, or run ${c.cyan('kainbu project create "My project"')}.`
		);
		return;
	}

	console.log(`\n${ui.heading('3.')} Choose what to work on.`);
	const project = await pick('Project:', projects, (entry) => entry.name);
	await setActiveProject(project.id);
	if (!project.boards.length) {
		console.log(
			`\n${ui.name(project.name)} has no boards yet. Run ${c.cyan('kainbu board create "My board"')} to add one.`
		);
		return;
	}
	const board = await pick('Board:', project.boards, (entry) => entry.name);
	await setActiveBoard(board.id);

	console.log(
		`\n${ui.success("You're all set.")} Working on ${ui.name(board.name)} in ${ui.name(project.name)}.`
	);
	console.log('\nTry these next:');
	for (const [command, description] of [
		['kainbu ls', 'show tasks on this board'],
		['kainbu task add "My task"', 'add a task'],
		['kainbu use "Other board"', 'switch boards'],
		['kainbu --help', 'see every command']
	])
		console.log(`  ${c.cyan(command.padEnd(28))}${ui.meta(description)}`);
};

export const registerSetupCommand = (program: Command) => {
	program
		.command('setup')
		.description('Guided setup: sign in and choose a project and board')
		.action(runSetup);
};
