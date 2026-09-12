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
import { resolveByIdOrName } from './commands/shared.js';

export type CliContext = {
	project: Project;
	board: ProjectBoard;
	config: CliConfig;
};

const matchesName = (value: string, query: string) =>
	value.toLowerCase() === query.toLowerCase() || value.toLowerCase().includes(query.toLowerCase());

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
	const exact = matches.filter(({ board }) => board.name.toLowerCase() === trimmed.toLowerCase());
	return { matches: exact.length ? exact : matches, exactId: false };
};

type ContextOptions = { project?: string; board?: string; requireBoard?: boolean };
export function resolveContext(
	options: ContextOptions & { requireBoard: false }
): Promise<Omit<CliContext, 'board'> & { board?: ProjectBoard }>;
export function resolveContext(options: ContextOptions): Promise<CliContext>;
export async function resolveContext(
	options: ContextOptions
): Promise<Omit<CliContext, 'board'> & { board?: ProjectBoard }> {
	const user = await requireUser();
	const workspace = await fetchWorkspace(user.id);
	const config = await readCliConfig();
	options = {
		...options,
		project: options.project ?? (process.env.KAINBU_PROJECT || undefined),
		board:
			options.board ??
			(options.requireBoard !== false ? process.env.KAINBU_BOARD || undefined : undefined)
	};
	if (options.project?.trim() === '' || options.board?.trim() === '')
		throw new KainbuError('Project and board targets cannot be empty.', {
			code: 'invalid_arguments',
			exitCode: 2
		});

	let project: Project | undefined;
	if (options.project) {
		project = resolveByIdOrName(workspace.projects, options.project, 'project');
	} else if (config.activeProjectId) {
		project = workspace.projects.find((entry) => entry.id === config.activeProjectId);
	}

	let board: ProjectBoard | undefined;

	// Explicit project scope is strict. Saved context is only a convenience;
	// without explicit project scope a board ID can select another project.
	if (options.board) {
		if (options.project && project) {
			board = resolveByIdOrName(project.boards, options.board, 'board');
		} else if (project) {
			board = project.boards.find((entry) => entry.id === options.board!.trim());
			if (!board) {
				const exact = project.boards.filter(
					(entry) => entry.name.toLowerCase() === options.board!.trim().toLowerCase()
				);
				const named = exact.length
					? exact
					: project.boards.filter((entry) => matchesName(entry.name, options.board!.trim()));
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
					code: 'ambiguous_target',
					exitCode: 2,
					hint: 'Use the board id, or pass --project to disambiguate.'
				});
			}
		}
		if (!board) {
			throw new KainbuError(`Board not found: ${options.board}`, {
				code: 'not_found',
				exitCode: 4,
				hint: 'Run: kainbu board list (after kainbu project use <name|id>), or pass a board id.'
			});
		}
	}

	if (!project) {
		throw new KainbuError('No active project.', {
			code: 'context_required',
			exitCode: 2,
			hint: 'Run: kainbu project list — then kainbu project use <name|id>'
		});
	}

	if (!board && options.requireBoard !== false) {
		board = getProjectBoard(project, config.activeBoardId) ?? project.boards[0] ?? undefined;
	}

	if (options.requireBoard !== false && !board) {
		throw new KainbuError('No active board.', {
			code: 'context_required',
			exitCode: 2,
			hint: 'Run: kainbu board list — then kainbu board use <name|id>'
		});
	}

	return { project, board, config };
}

export const setActiveProject = async (projectId: string) => {
	const config = await readCliConfig();
	await writeCliConfig({
		...config,
		activeProjectId: projectId,
		...(config.activeProjectId !== projectId ? { activeBoardId: undefined } : {})
	});
};

export const setActiveBoard = async (boardId: string) => {
	const config = await readCliConfig();
	await writeCliConfig({ ...config, activeBoardId: boardId });
};
