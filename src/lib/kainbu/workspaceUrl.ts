import type { WorkspaceTab } from '$lib/kainbu/types';

export type WorkspaceUrlState = {
	projectId?: string;
	boardId?: string;
	pageId?: string;
	view?: WorkspaceTab;
};

export type WorkspaceLocation = WorkspaceUrlState & { legacyQuery: boolean };

const VIEW_TABS = new Set<WorkspaceTab>(['dashboard', 'kanban', 'scratchpad', 'chat', 'settings']);

export const parseWorkspaceUrl = (searchParams: URLSearchParams): WorkspaceUrlState => {
	const projectId = searchParams.get('project') || searchParams.get('p') || undefined;
	const boardId = searchParams.get('board') || searchParams.get('b') || undefined;
	const pageId = searchParams.get('page') || searchParams.get('note') || searchParams.get('n') || undefined;
	const viewRaw = searchParams.get('view') || searchParams.get('v') || undefined;
	const view = viewRaw && VIEW_TABS.has(viewRaw as WorkspaceTab) ? (viewRaw as WorkspaceTab) : undefined;
	return { projectId, boardId, pageId, view };
};

/** Parse canonical SvelteKit routes and the pre-routing query-string links. */
export const parseWorkspaceLocation = (
	pathname: string,
	searchParams = new URLSearchParams()
): WorkspaceLocation => {
	const path = pathname.replace(/\/+$/, '') || '/';
	const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/(boards|pages)\/([^/]+)|\/(chat))?$/);
	if (projectMatch) {
		const projectId = decodeURIComponent(projectMatch[1]);
		if (projectMatch[4] === 'chat') return { projectId, view: 'chat', legacyQuery: false };
		if (projectMatch[2] === 'boards') {
			return { projectId, boardId: decodeURIComponent(projectMatch[3]), view: 'kanban', legacyQuery: false };
		}
		if (projectMatch[2] === 'pages') {
			return { projectId, pageId: decodeURIComponent(projectMatch[3]), view: 'scratchpad', legacyQuery: false };
		}
		return { projectId, view: 'kanban', legacyQuery: false };
	}
	if (path === '/dashboard' || path === '/') {
		const query = parseWorkspaceUrl(searchParams);
		return {
			...query,
			legacyQuery: path === '/' && Boolean(query.projectId || query.view || query.boardId || query.pageId)
		};
	}
	return { legacyQuery: false };
};

export const buildWorkspaceSearchParams = (state: WorkspaceUrlState): URLSearchParams => {
	const params = new URLSearchParams();
	if (state.projectId) params.set('project', state.projectId);
	if (state.view) params.set('view', state.view);
	if (state.view === 'kanban' && state.boardId) params.set('board', state.boardId);
	if (state.view === 'scratchpad' && state.pageId) params.set('page', state.pageId);
	return params;
};

export const buildWorkspacePath = (state: WorkspaceUrlState): string => {
	if (!state.projectId || state.view === 'dashboard' || state.view === 'settings') return '/dashboard';
	const project = encodeURIComponent(state.projectId);
	if (state.view === 'kanban' && state.boardId) return `/projects/${project}/boards/${encodeURIComponent(state.boardId)}`;
	if (state.view === 'scratchpad' && state.pageId) return `/projects/${project}/pages/${encodeURIComponent(state.pageId)}`;
	if (state.view === 'chat') return `/projects/${project}/chat`;
	return `/projects/${project}`;
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
