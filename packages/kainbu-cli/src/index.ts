import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerConfigCommands } from './commands/config.js';
import { registerBoardCommands } from './commands/board.js';
import { registerColumnCommands } from './commands/column.js';
import { registerPageCommands } from './commands/page.js';
import { registerProjectCommands } from './commands/project.js';
import { registerScratchpadCommands } from './commands/scratchpad.js';
import { registerTaskCommands } from './commands/task.js';
import { c, ui } from './color.js';
import { printError, printSuccess } from './output.js';
import { configureInvocation, integerOption } from './invocation.js';
import { registerSchemaCommand } from './schema.js';
import { initRuntime } from './runtime.js';
import { resolveContext, setActiveBoard, setActiveProject } from './context.js';
import { requireUser } from './runtime.js';
import { fetchWorkspace } from '@kainbu/core';
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
program.configureOutput({
	writeErr: () => {} // Parser failures are emitted once by the structured error handler.
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

registerSchemaCommand(program);

program
	.command('use <target>')
	.description('Set active project or board')
	.option('--project <id|name>', 'Project context when selecting a board')
	.action(async (target: string, options: { project?: string }) => {
		await initRuntime();
		const user = await requireUser();
		const workspace = await fetchWorkspace(user.id);
		const trimmed = target.trim();
		if (!trimmed)
			throw new KainbuError('Target cannot be empty.', { code: 'invalid_arguments', exitCode: 2 });

		const projectById = workspace.projects.find((entry) => entry.id === trimmed);
		const exactProjectNames = workspace.projects.filter(
			(entry) => entry.name.toLowerCase() === trimmed.toLowerCase()
		);
		const projectByName = exactProjectNames.length
			? exactProjectNames
			: workspace.projects.filter((entry) =>
					entry.name.toLowerCase().includes(trimmed.toLowerCase())
				);

		if (!options.project && (projectById || projectByName.length === 1)) {
			const selected = projectById || projectByName[0]!;
			await setActiveProject(selected.id);
			printSuccess(
				{ projectId: selected.id, name: selected.name },
				`${ui.active('Active project:')} ${ui.name(selected.name)}`
			);
			return;
		}
		if (!options.project && projectByName.length > 1)
			throw new KainbuError('Multiple projects match this target.', {
				code: 'ambiguous_target',
				exitCode: 2,
				hint: 'Use a project ID, or --project when selecting a board.'
			});

		const { project } = await resolveContext({ project: options.project, requireBoard: false });
		const selectedBoard = resolveByIdOrName(project.boards, target, 'board');
		await setActiveProject(project.id);
		await setActiveBoard(selectedBoard.id);
		printSuccess(
			{ projectId: project.id, boardId: selectedBoard.id, name: selectedBoard.name },
			`${ui.active('Active board:')} ${ui.name(selectedBoard.name)}`
		);
	});

program.parseAsync(process.argv).catch((error: unknown) => {
	if (error && typeof error === 'object' && 'exitCode' in error && error.exitCode === 0) return;
	const args = process.argv.slice(2);
	const flags = args.slice(0, args.indexOf('--') < 0 ? args.length : args.indexOf('--'));
	configureInvocation({ json: flags.includes('--json') });
	process.exitCode = printError(error);
});
