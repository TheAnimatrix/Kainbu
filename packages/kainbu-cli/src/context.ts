import { readCliConfig, writeCliConfig, type CliConfig } from '@kainbu/core';
import type { Project, ProjectBoard } from '../../../src/lib/kainbu/types.js';
import { KainbuError } from './errors.js';
import { resolveByIdOrName } from './commands/shared.js';
import { loadWorkspace, type WorkspaceSnapshot } from './workspace.js';

export type CliContext = {
	project: Project;
	board: ProjectBoard;
	config: CliConfig;
};

const matchesName = (value: string, query: string, exact: boolean) =>
	value.toLowerCase() === query.toLowerCase() ||
	(!exact && value.toLowerCase().includes(query.toLowerCase()));

/**
 * Finds a board by id (globally unique) or name across every project in the
 * workspace. This lets `kainbu task list <board>` work with only a project
 * active — or with nothing active at all when a board id is given — so you
 * don't have to `use` a board just to read it.
 */
export const findBoardInWorkspace = (projects: Project[], query: string, exact = false) => {
	const trimmed = query.trim();
	const matches: { project: Project; board: ProjectBoard }[] = [];
	for (const project of projects) {
		for (const board of project.boards) {
			if (board.id === trimmed) return [{ project, board }];
			if (matchesName(board.name, trimmed, exact)) matches.push({ project, board });
		}
	}
	const exactMatches = matches.filter(
		({ board }) => board.name.toLowerCase() === trimmed.toLowerCase()
	);
	return exactMatches.length ? exactMatches : matches;
};

type ContextOptions = {
	project?: string;
	board?: string;
	requireBoard?: boolean;
	/** Writes: names must match exactly; reads also accept a unique substring. */
	exact?: boolean;
};

/**
 * Board selection when none is named: the saved board, or the project's only
 * board. A stale saved board or a choice between several boards is an error
 * rather than a silent switch to the first board.
 */
const defaultBoard = (project: Project, savedBoardId?: string) => {
	const saved = savedBoardId
		? project.boards.find((entry) => entry.id === savedBoardId)
		: undefined;
	if (saved) return saved;
	if (savedBoardId)
		throw new KainbuError('The saved board no longer exists in this project.', {
			code: 'context_required',
			exitCode: 2,
			hint: 'Run: kainbu board list — then kainbu board use <name|id>, or pass --board.'
		});
	if (project.boards.length === 1) return project.boards[0];
	throw new KainbuError(
		project.boards.length ? 'No active board.' : `Project "${project.name}" has no boards.`,
		{
			code: 'context_required',
			exitCode: 2,
			hint: project.boards.length
				? 'Run: kainbu board list — then kainbu board use <name|id>, or pass --board.'
				: 'Run: kainbu board create <name>'
		}
	);
};

export function resolveContext(
	options: ContextOptions & { requireBoard: false }
): Promise<Omit<CliContext, 'board'> & { board?: ProjectBoard }>;
export function resolveContext(options: ContextOptions): Promise<CliContext>;
export async function resolveContext(
	options: ContextOptions
): Promise<Omit<CliContext, 'board'> & { board?: ProjectBoard }> {
	const config = await readCliConfig();
	const exact = Boolean(options.exact);
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

	// Fetch only the target project when its ID is known. Names, and boards that
	// live outside the saved project, need the full workspace.
	const candidate = options.project?.trim() || config.activeProjectId;
	let workspace: WorkspaceSnapshot | undefined = candidate
		? await loadWorkspace(candidate)
		: undefined;
	if (!workspace?.projects.some((entry) => entry.id === candidate))
		workspace = await loadWorkspace();
	const scoped = Boolean(candidate) && workspace.projects.length === 1;

	let project: Project | undefined;
	if (options.project) {
		project = resolveByIdOrName(workspace.projects, options.project, 'project', { exact });
	} else if (config.activeProjectId) {
		project = workspace.projects.find((entry) => entry.id === config.activeProjectId);
	}

	let board: ProjectBoard | undefined;

	// Explicit project scope is strict. Saved context is only a convenience;
	// without explicit project scope a board ID or name can select another project.
	if (options.board) {
		const target = options.board.trim();
		if (options.project && project) {
			board = resolveByIdOrName(project.boards, target, 'board', { exact });
		} else {
			let matches = findBoardInWorkspace(workspace.projects, target, exact);
			// A scoped snapshot settles an ID or exact name in the saved project;
			// anything else must be checked against the whole workspace.
			const settled =
				matches.length === 1 &&
				(matches[0].board.id === target ||
					matches[0].board.name.toLowerCase() === target.toLowerCase());
			if (scoped && !settled) {
				workspace = await loadWorkspace();
				matches = findBoardInWorkspace(workspace.projects, target, exact);
			}
			// Prefer the saved project when several projects have a matching board.
			const local = project ? matches.filter((entry) => entry.project.id === project!.id) : [];
			const pick = local.length === 1 ? local : matches;
			if (pick.length === 1) {
				project = pick[0].project;
				board = pick[0].board;
			} else if (pick.length > 1) {
				throw new KainbuError(`Multiple boards match "${target}".`, {
					code: 'ambiguous_target',
					exitCode: 2,
					hint: 'Use the board id, or pass --project to disambiguate.'
				});
			}
		}
		if (!board) {
			throw new KainbuError(`Board not found: ${target}`, {
				code: 'not_found',
				exitCode: 4,
				hint: 'Run: kainbu board list (after kainbu project use <name|id>), or pass a board id.'
			});
		}
	}

	if (!project) {
		throw new KainbuError(
			config.activeProjectId ? 'The saved project is no longer available.' : 'No active project.',
			{
				code: 'context_required',
				exitCode: 2,
				hint: 'Run: kainbu project list — then kainbu project use <name|id>'
			}
		);
	}

	if (!board && options.requireBoard !== false) {
		board = defaultBoard(
			project,
			config.activeProjectId === project.id ? config.activeBoardId : undefined
		);
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
