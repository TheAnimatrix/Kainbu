import {
	fetchWorkspace,
	getProjectBoard,
	readCliConfig,
	writeCliConfig,
	type CliConfig
} from '@kainbu/core';
import type { Project, ProjectBoard } from '../../../src/lib/kainbu/types.js';
import { KainbuError } from './errors.js';
import { requireUser } from './runtime.js';

export type CliContext = {
	project: Project;
	board: ProjectBoard;
	config: CliConfig;
};

const matchesName = (value: string, query: string) =>
	value.toLowerCase() === query.toLowerCase() || value.toLowerCase().includes(query.toLowerCase());

const resolveByIdOrName = <T extends { id: string; name: string }>(
	items: T[],
	query: string,
	label: string
) => {
	const trimmed = query.trim();
	const byId = items.find((item) => item.id === trimmed);
	if (byId) return byId;

	const matches = items.filter((item) => matchesName(item.name, trimmed));
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		throw new KainbuError(`Multiple ${label} entries match "${trimmed}".`, {
			hint: 'Use the project or board id instead of the name.'
		});
	}

	throw new KainbuError(`${label} not found: ${trimmed}`, {
		hint: `Run kainbu ${label === 'project' ? 'project' : 'board'} list`
	});
};

export const resolveContext = async (options: {
	project?: string;
	board?: string;
	requireBoard?: boolean;
}): Promise<CliContext> => {
	const user = await requireUser();
	const workspace = await fetchWorkspace(user.id);
	const config = await readCliConfig();

	let project: Project | undefined;
	if (options.project) {
		project = resolveByIdOrName(workspace.projects, options.project, 'project');
	} else if (config.activeProjectId) {
		project = workspace.projects.find((entry) => entry.id === config.activeProjectId);
	}

	if (!project) {
		throw new KainbuError('No active project.', {
			hint: 'Run: kainbu project list — then kainbu project use <name|id>'
		});
	}

	let board = options.board
		? resolveByIdOrName(project.boards, options.board, 'board')
		: getProjectBoard(project, config.activeBoardId);

	if (!board && project.boards.length) {
		board = project.boards[0];
	}

	if (options.requireBoard !== false && !board) {
		throw new KainbuError('No active board.', {
			hint: 'Run: kainbu board list — then kainbu board use <name|id>'
		});
	}

	if (!board) {
		throw new KainbuError('No board available on this project.');
	}

	return { project, board, config };
};

export const setActiveProject = async (projectId: string) => {
	const config = await readCliConfig();
	await writeCliConfig({ ...config, activeProjectId: projectId });
};

export const setActiveBoard = async (boardId: string) => {
	const config = await readCliConfig();
	await writeCliConfig({ ...config, activeBoardId: boardId });
};
