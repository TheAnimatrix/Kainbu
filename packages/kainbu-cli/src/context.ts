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

/**
 * Finds a board by id (globally unique) or name across every project in the
 * workspace. This lets `kainbu task list <board>` work with only a project
 * active — or with nothing active at all when a board id is given — so you
 * don't have to `use` a board just to read it.
 */
const findBoardInWorkspace = (projects: Project[], query: string) => {
	const trimmed = query.trim();
	const matches: { project: Project; board: ProjectBoard }[] = [];
	for (const project of projects) {
		for (const board of project.boards) {
			if (board.id === trimmed) return { matches: [{ project, board }], exactId: true };
			if (matchesName(board.name, trimmed)) matches.push({ project, board });
		}
	}
	return { matches, exactId: false };
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

	let board: ProjectBoard | undefined;

	// An explicit board target resolves within the active/--project first, then
	// falls back to a workspace-wide search so a board id (or unique board name)
	// works even with no active project or board set.
	if (options.board) {
		if (project) {
			board = project.boards.find((entry) => entry.id === options.board!.trim());
			if (!board) {
				const named = project.boards.filter((entry) => matchesName(entry.name, options.board!));
				if (named.length === 1) board = named[0];
			}
		}
		if (!board) {
			const { matches } = findBoardInWorkspace(workspace.projects, options.board);
			if (matches.length === 1) {
				project = matches[0].project;
				board = matches[0].board;
			} else if (matches.length > 1) {
				throw new KainbuError(`Multiple boards match "${options.board}".`, {
					hint: 'Use the board id, or pass --project to disambiguate.'
				});
			}
		}
		if (!board) {
			throw new KainbuError(`Board not found: ${options.board}`, {
				hint: 'Run: kainbu board list (after kainbu project use <name|id>), or pass a board id.'
			});
		}
	}

	if (!project) {
		throw new KainbuError('No active project.', {
			hint: 'Run: kainbu project list — then kainbu project use <name|id>'
		});
	}

	if (!board) {
		board = getProjectBoard(project, config.activeBoardId) ?? project.boards[0] ?? undefined;
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
