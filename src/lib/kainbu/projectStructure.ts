import { mergeBoardPreferences, normalizeBoardPreferences } from '$lib/kainbu/boardPreferences';
import { createId } from '$lib/kainbu/id';
import { normalizeProjectAiState } from '$lib/kainbu/aiSessions';
import { getActiveScratchpadPad, normalizeScratchpadData } from '$lib/kainbu/scratchpad';
import type {
	BoardPreferences,
	KanbanData,
	Project,
	ProjectBoard,
	ProjectPage,
	ScratchpadData
} from '$lib/kainbu/types';

const cloneKanbanData = (kanbanData: KanbanData) => structuredClone(kanbanData || []);

const createFallbackBoard = (project: Pick<Project, 'id' | 'kanbanData' | 'createdAt' | 'updatedAt'>): ProjectBoard => ({
	id: createId(),
	projectId: project.id,
	name: 'Board',
	position: 0,
	kanbanData: cloneKanbanData(project.kanbanData || []),
	preferences: normalizeBoardPreferences(undefined),
	createdAt: project.createdAt,
	updatedAt: project.updatedAt
});

const createFallbackPage = (project: Pick<Project, 'id' | 'scratchpadData' | 'createdAt' | 'updatedAt'>): ProjectPage => ({
	id: createId(),
	projectId: project.id,
	name: 'Notes',
	content: getActiveScratchpadPad(normalizeScratchpadData(project.scratchpadData || '')).content,
	position: 0,
	createdAt: project.createdAt,
	updatedAt: project.updatedAt
});

export const pageToScratchpadData = (
	page: Pick<ProjectPage, 'id' | 'name' | 'content'> | null | undefined
): ScratchpadData => {
	const padId = page?.id || createId();

	return {
		activePadId: padId,
		pads: [
			{
				id: padId,
				name: page?.name || 'Notes',
				content: page?.content || ''
			}
		]
	};
};

export const getProjectBoard = (project: Pick<Project, 'boards' | 'activeBoardId'>, boardId?: string | null) =>
	project.boards.find((board) => board.id === (boardId || project.activeBoardId)) || project.boards[0] || null;

export const resolveProjectBoardId = (
	project: Pick<Project, 'boards' | 'activeBoardId'>,
	boardId?: string | null
) => getProjectBoard(project, boardId)?.id ?? null;

export const getProjectPage = (project: Pick<Project, 'pages' | 'activePageId'>, pageId?: string | null) =>
	project.pages.find((page) => page.id === (pageId || project.activePageId)) || project.pages[0] || null;

export const normalizeProjectStructure = (project: Project): Project => {
	const normalizedAiState = normalizeProjectAiState(project);
	const boards = (project.boards || []).length
		? project.boards
				.map((board, index) => ({
					...board,
					projectId: board.projectId || project.id,
					name: board.name?.trim() || `Board ${index + 1}`,
					position: Number.isFinite(board.position) ? board.position : index,
					kanbanData: cloneKanbanData(board.kanbanData || []),
					preferences: normalizeBoardPreferences(board.preferences),
					createdAt: board.createdAt || project.createdAt,
					updatedAt: board.updatedAt || project.updatedAt
				}))
				.sort((left, right) => left.position - right.position || left.createdAt - right.createdAt)
		: [createFallbackBoard(project)];
	const pages = (project.pages || []).length
		? project.pages
				.map((page, index) => ({
					...page,
					projectId: page.projectId || project.id,
					name: page.name?.trim() || `Page ${index + 1}`,
					content: typeof page.content === 'string' ? page.content : '',
					position: Number.isFinite(page.position) ? page.position : index,
					createdAt: page.createdAt || project.createdAt,
					updatedAt: page.updatedAt || project.updatedAt
				}))
				.sort((left, right) => left.position - right.position || left.createdAt - right.createdAt)
		: [createFallbackPage(project)];
	const activeBoard = getProjectBoard(
		{ boards, activeBoardId: project.activeBoardId || project.boards?.[0]?.id || '' },
		project.activeBoardId
	);
	const activePage = getProjectPage(
		{ pages, activePageId: project.activePageId || project.pages?.[0]?.id || '' },
		project.activePageId
	);

	return {
		...project,
		...normalizedAiState,
		boards,
		pages,
		activeBoardId: activeBoard?.id || boards[0].id,
		activePageId: activePage?.id || pages[0].id,
		kanbanData: cloneKanbanData(activeBoard?.kanbanData || []),
		scratchpadData: pageToScratchpadData(activePage)
	};
};

export const setProjectActiveBoard = (project: Project, boardId: string) => {
	const activeBoard = getProjectBoard(project, boardId);
	if (!activeBoard) return project;

	return {
		...project,
		activeBoardId: activeBoard.id,
		kanbanData: cloneKanbanData(activeBoard.kanbanData)
	};
};

export const setProjectActivePage = (project: Project, pageId: string) => {
	const activePage = getProjectPage(project, pageId);
	if (!activePage) return project;

	return {
		...project,
		activePageId: activePage.id,
		scratchpadData: pageToScratchpadData(activePage)
	};
};

export const updateProjectBoardData = (project: Project, boardId: string, kanbanData: KanbanData) => {
	const nextBoards = project.boards.map((board) =>
		board.id === boardId
			? {
					...board,
					kanbanData: cloneKanbanData(kanbanData),
					updatedAt: Date.now()
				}
			: board
	);
	const nextProject = {
		...project,
		boards: nextBoards
	};

	return setProjectActiveBoard(nextProject, boardId);
};

export const mergeProjectBoardsByUpdatedAt = (
	localBoards: ProjectBoard[],
	remoteBoards: ProjectBoard[],
	preferLocalBoardIds: ReadonlySet<string> = new Set()
): ProjectBoard[] => {
	const localById = new Map(localBoards.map((board) => [board.id, board]));
	const remoteById = new Map(remoteBoards.map((board) => [board.id, board]));
	const mergedIds = new Set([...localById.keys(), ...remoteById.keys()]);
	const merged: ProjectBoard[] = [];

	for (const boardId of mergedIds) {
		const localBoard = localById.get(boardId);
		const remoteBoard = remoteById.get(boardId);

		if (localBoard && remoteBoard) {
			const preferLocalBoard = preferLocalBoardIds.has(boardId);
			const remoteIsNewer = remoteBoard.updatedAt > localBoard.updatedAt;
			const winner = preferLocalBoard
				? localBoard
				: remoteIsNewer
					? remoteBoard
					: localBoard;

			merged.push({
				...winner,
				preferences: mergeBoardPreferences(
					localBoard.preferences,
					remoteBoard.preferences,
					preferLocalBoard || !remoteIsNewer
				),
				updatedAt: Math.max(localBoard.updatedAt, remoteBoard.updatedAt)
			});
			continue;
		}

		if (localBoard) {
			merged.push(localBoard);
			continue;
		}

		if (remoteBoard) {
			merged.push(remoteBoard);
		}
	}

	return merged.sort(
		(left, right) => left.position - right.position || left.createdAt - right.createdAt
	);
};

export const updateProjectBoardPreferences = (
	project: Project,
	boardId: string,
	preferences: BoardPreferences
) => {
	const resolvedBoardId = resolveProjectBoardId(project, boardId);
	if (!resolvedBoardId) return project;

	const now = Date.now();
	const nextBoards = project.boards.map((board) =>
		board.id === resolvedBoardId
			? {
					...board,
					preferences: normalizeBoardPreferences(preferences),
					updatedAt: now
				}
			: board
	);

	return setProjectActiveBoard(
		{
			...project,
			boards: nextBoards,
			activeBoardId: resolvedBoardId,
			updatedAt: Math.max(project.updatedAt, now)
		},
		resolvedBoardId
	);
};

export const updateProjectPageContent = (project: Project, pageId: string, content: string) => {
	const nextPages = project.pages.map((page) =>
		page.id === pageId
			? {
					...page,
					content,
					updatedAt: Date.now()
				}
			: page
	);
	const nextProject = {
		...project,
		pages: nextPages
	};

	return setProjectActivePage(nextProject, pageId);
};
