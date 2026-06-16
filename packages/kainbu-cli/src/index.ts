import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerConfigCommands } from './commands/config.js';
import { registerBoardCommands } from './commands/board.js';
import { registerColumnCommands } from './commands/column.js';
import { registerPageCommands } from './commands/page.js';
import { registerProjectCommands } from './commands/project.js';
import { registerScratchpadCommands } from './commands/scratchpad.js';
import { registerTaskCommands } from './commands/task.js';
import { isKainbuError } from './errors.js';
import { c, ui } from './color.js';
import { printError } from './output.js';
import { initRuntime } from './runtime.js';
import { resolveContext, setActiveBoard, setActiveProject } from './context.js';
import { requireUser } from './runtime.js';
import { fetchWorkspace } from '@kainbu/core';

const program = new Command();

program
	.name('kainbu')
	.description('Kainbu workspace CLI')
	.version('0.0.1')
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
	outputError: (str, write) => write(c.red(str))
});

registerAuthCommands(program);
registerConfigCommands(program);
registerProjectCommands(program);
registerBoardCommands(program);
registerColumnCommands(program);
registerTaskCommands(program);
registerPageCommands(program);
registerScratchpadCommands(program);

program
	.command('ls [board]')
	.description('List tasks (alias for `task list`). [board] lists any board without making it active.')
	.allowUnknownOption()
	.allowExcessArguments(true)
	.action(async () => {
		const args = process.argv.slice(process.argv.indexOf('ls') + 1);
		// Default ('node') parsing skips the first two argv entries, so keep the
			// node/kainbu prefix here rather than mixing it with `{ from: 'user' }`.
			await program.parseAsync(['node', 'kainbu', 'task', 'list', ...args]);
	});

program
	.command('use <target>')
	.description('Set active project or board')
	.option('--project <id|name>', 'Project context when selecting a board')
	.action(async (target: string, options: { project?: string }) => {
		await initRuntime();
		const user = await requireUser();
		const workspace = await fetchWorkspace(user.id);
		const trimmed = target.trim();

		const projectById = workspace.projects.find((entry) => entry.id === trimmed);
		const projectByName = workspace.projects.filter((entry) =>
			entry.name.toLowerCase().includes(trimmed.toLowerCase())
		);

		if (projectById || projectByName.length === 1) {
			const selected = projectById || projectByName[0]!;
			await setActiveProject(selected.id);
			console.log(`${ui.active('Active project:')} ${ui.name(selected.name)}`);
			return;
		}

		const { project } = await resolveContext({ project: options.project, requireBoard: false });
		const boardById = project.boards.find((entry) => entry.id === trimmed);
		const boardByName = project.boards.filter((entry) =>
			entry.name.toLowerCase().includes(trimmed.toLowerCase())
		);
		const selectedBoard = boardById || (boardByName.length === 1 ? boardByName[0] : null);
		if (!selectedBoard) {
			throw new Error(`No project or board matched "${target}".`);
		}
		await setActiveBoard(selectedBoard.id);
		console.log(`${ui.active('Active board:')} ${ui.name(selectedBoard.name)}`);
	});

program.parseAsync(process.argv).catch((error: unknown) => {
	if (isKainbuError(error)) {
		printError(error.message, error.hint);
		process.exit(error.exitCode);
	}

	printError(error instanceof Error ? error.message : 'Unexpected error');
	process.exit(1);
});
