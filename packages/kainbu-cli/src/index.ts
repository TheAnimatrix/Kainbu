import { loadWorkspace } from './workspace.js';
import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerConfigCommands } from './commands/config.js';
import { registerBoardCommands } from './commands/board.js';
import { registerColumnCommands } from './commands/column.js';
import { registerPageCommands } from './commands/page.js';
import { registerProjectCommands } from './commands/project.js';
import { registerScratchpadCommands } from './commands/scratchpad.js';
import { registerSearchCommands } from './commands/search.js';
import { registerTaskCommands } from './commands/task.js';
import { needsSetup, registerSetupCommand, runSetup } from './commands/setup.js';
import { isInteractive } from './prompt.js';
import { c, ui } from './color.js';
import { printError, printSuccess } from './output.js';
import { configureInvocation, integerOption } from './invocation.js';
import { registerSchemaCommand } from './schema.js';
import { initRuntime } from './runtime.js';
import { resolveContext, setActiveBoard, setActiveProject } from './context.js';
import { KainbuError } from './errors.js';
import { resolveByIdOrName } from './commands/shared.js';
// Single source of truth for the version: bundled from package.json at build
// time, so `kainbu -V` can never drift from the published npm version.
import pkg from '../package.json' with { type: 'json' };

const program = new Command();

program
	.name('kainbu')
	.description('Kainbu workspace CLI')
	.version(pkg.version)
	.option('--json', 'Print JSON results and structured errors; never prompt')
	.option('--non-interactive', 'Never prompt or open a browser')
	.option('--auth-profile <name>', 'Use a saved credential pair for this invocation')
	.option(
		'--timeout <ms>',
		'HTTP request timeout in milliseconds',
		integerOption(1, 2_147_483_647),
		30_000
	)
	.exitOverride()
	.showHelpAfterError('(add --help for usage)');

// Colorize help output with consistent tones. configureHelp/configureOutput
// are inherited by every subcommand, so this styles `--help` everywhere.
program.configureHelp({
	styleTitle: (str) => c.bold(c.yellow(str)),
	styleCommandText: (str) => c.cyan(str),
	styleSubcommandTerm: (str) => c.cyan(str),
	styleOptionTerm: (str) => c.green(str),
	styleArgumentTerm: (str) => c.green(str),
	styleDescriptionText: (str) => c.dim(str)
});
// Flags before `--`, read directly so errors raised before option parsing still honor --json.
const argv = process.argv.slice(2);
const flags = argv.slice(0, argv.indexOf('--') < 0 ? argv.length : argv.indexOf('--'));
const jsonRequested = flags.includes('--json');

program.configureOutput({
	// Parser failures are emitted once by the structured error handler.
	outputError: () => {},
	// Help for a bare command group still prints, except in JSON mode where stderr carries one error object.
	writeErr: (text) => {
		if (!jsonRequested) process.stderr.write(text);
	}
});
program.hook('preAction', (_command, action) => configureInvocation(action.optsWithGlobals()));

registerAuthCommands(program);
registerConfigCommands(program);
registerProjectCommands(program);
registerBoardCommands(program);
registerColumnCommands(program);
registerTaskCommands(program);
registerPageCommands(program);
registerScratchpadCommands(program);
registerSearchCommands(program);

registerSchemaCommand(program);
registerSetupCommand(program);

program
	.command('use <target>')
	.description('Set the active project or board (ids first, then exact names, then partial names)')
	.option('--project <id|name>', 'Project context when selecting a board')
	.action(async (target: string, options: { project?: string }) => {
		await initRuntime();
		const trimmed = target.trim();
		if (!trimmed)
			throw new KainbuError('Target cannot be empty.', { code: 'invalid_arguments', exitCode: 2 });

		if (options.project) {
			const { project } = await resolveContext({ project: options.project, requireBoard: false });
			const selected = resolveByIdOrName(project.boards, trimmed, 'board');
			await setActiveProject(project.id);
			await setActiveBoard(selected.id);
			printSuccess(
				{ projectId: project.id, boardId: selected.id, name: selected.name },
				`${ui.active('Active board:')} ${ui.name(selected.name)} ${ui.meta(project.name)}`
			);
			return;
		}

		const { projects } = await loadWorkspace();
		const lower = trimmed.toLowerCase();
		type Candidate = { project: (typeof projects)[number]; boardId?: string; label: string };
		const candidates = (test: (id: string, name: string) => boolean): Candidate[] =>
			projects.flatMap((project) => [
				...(test(project.id, project.name)
					? [{ project, label: `project "${project.name}" (${project.id})` }]
					: []),
				...project.boards
					.filter((board) => test(board.id, board.name))
					.map((board) => ({
						project,
						boardId: board.id,
						label: `board "${board.name}" in ${project.name} (${board.id})`
					}))
			]);
		const tiers = [
			candidates((id) => id === trimmed),
			candidates((_, name) => name.toLowerCase() === lower),
			candidates((_, name) => name.toLowerCase().includes(lower))
		];
		const matches = tiers.find((tier) => tier.length) ?? [];
		if (matches.length > 1)
			throw new KainbuError(`"${trimmed}" matches more than one project or board.`, {
				code: 'ambiguous_target',
				exitCode: 2,
				hint: `Use an id: ${matches
					.slice(0, 6)
					.map((entry) => entry.label)
					.join('; ')}`
			});
		const [selected] = matches;
		if (!selected)
			throw new KainbuError(`No project or board matches "${trimmed}".`, {
				code: 'not_found',
				exitCode: 4,
				hint: 'Run: kainbu project list, or kainbu board list --project <name>'
			});
		await setActiveProject(selected.project.id);
		if (selected.boardId) {
			await setActiveBoard(selected.boardId);
			const board = selected.project.boards.find((entry) => entry.id === selected.boardId)!;
			printSuccess(
				{ projectId: selected.project.id, boardId: board.id, name: board.name },
				`${ui.active('Active board:')} ${ui.name(board.name)} ${ui.meta(selected.project.name)}`
			);
			return;
		}
		printSuccess(
			{ projectId: selected.project.id, name: selected.project.name },
			`${ui.active('Active project:')} ${ui.name(selected.project.name)}`
		);
	});

// A bare `kainbu` in a terminal guides first-time setup; otherwise it shows help.
const main = async () => {
	if (argv.length) return program.parseAsync(process.argv);
	if (isInteractive() && (await needsSetup())) return runSetup();
	program.outputHelp();
};

main().catch((error: unknown) => {
	const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
	if (error && typeof error === 'object' && 'exitCode' in error && error.exitCode === 0) return;
	configureInvocation({ json: jsonRequested });
	// A command group without a subcommand already printed its help.
	if (code === 'commander.help' && !jsonRequested) {
		process.exitCode = 2;
		return;
	}
	process.exitCode = printError(
		code === 'commander.help'
			? new KainbuError('A subcommand is required.', {
					code: 'invalid_arguments',
					exitCode: 2,
					hint: 'Run kainbu schema for the command catalog.'
				})
			: error
	);
});
