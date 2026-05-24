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

registerAuthCommands(program);
registerConfigCommands(program);
registerProjectCommands(program);
registerBoardCommands(program);
registerColumnCommands(program);
registerTaskCommands(program);
registerPageCommands(program);
registerScratchpadCommands(program);

program
	.command('ls')
	.description('List tasks on the active board')
	.allowUnknownOption()
	.action(async () => {
		const args = process.argv.slice(process.argv.indexOf('ls') + 1);
		await program.parseAsync(['node', 'kainbu', 'task', 'list', ...args], { from: 'user' });
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
			console.log(`Active project: ${selected.name}`);
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
		console.log(`Active board: ${selectedBoard.name}`);
	});

program.parseAsync(process.argv).catch((error: unknown) => {
	if (isKainbuError(error)) {
		printError(error.message, error.hint);
		process.exit(error.exitCode);
	}

	printError(error instanceof Error ? error.message : 'Unexpected error');
	process.exit(1);
});
