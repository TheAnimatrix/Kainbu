import type { WorkspaceTab } from '$lib/kainbu/types';

export type WorkspaceUrlState = {
	projectId?: string;
	boardId?: string;
	pageId?: string;
	view?: WorkspaceTab;
};

const VIEW_TABS = new Set<WorkspaceTab>(['dashboard', 'kanban', 'scratchpad', 'chat', 'settings']);

export const parseWorkspaceUrl = (searchParams: URLSearchParams): WorkspaceUrlState => {
	const projectId = searchParams.get('project') || searchParams.get('p') || undefined;
	const boardId = searchParams.get('board') || searchParams.get('b') || undefined;
	const pageId = searchParams.get('page') || searchParams.get('note') || searchParams.get('n') || undefined;
	const viewRaw = searchParams.get('view') || searchParams.get('v') || undefined;
	const view = viewRaw && VIEW_TABS.has(viewRaw as WorkspaceTab) ? (viewRaw as WorkspaceTab) : undefined;

	return {
		projectId: projectId || undefined,
		boardId: boardId || undefined,
		pageId: pageId || undefined,
		view
	};
};

export const buildWorkspaceSearchParams = (state: WorkspaceUrlState): URLSearchParams => {
	const params = new URLSearchParams();
	if (state.projectId) params.set('project', state.projectId);
	if (state.view) params.set('view', state.view);

	if (state.view === 'kanban' && state.boardId) {
		params.set('board', state.boardId);
	}

	if (state.view === 'scratchpad' && state.pageId) {
		params.set('page', state.pageId);
	}

	return params;
};

export const buildWorkspaceShareUrl = (
	state: WorkspaceUrlState,
	origin = typeof window !== 'undefined' ? window.location.origin : ''
): string => {
	const params = buildWorkspaceSearchParams(state);
	const query = params.toString();
	const base = (origin || '').replace(/\/$/, '');
	return query ? `${base}/?${query}` : `${base}/`;
};

export const workspaceSearchParamsEqual = (left: URLSearchParams, right: URLSearchParams) =>
	buildWorkspaceSearchParams(parseWorkspaceUrl(left)).toString() ===
	buildWorkspaceSearchParams(parseWorkspaceUrl(right)).toString();
