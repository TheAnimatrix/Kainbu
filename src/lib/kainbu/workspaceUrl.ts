import type { SettingsSection, WorkspaceTab } from '$lib/kainbu/types';

export type WorkspaceUrlState = {
	projectId?: string;
	boardId?: string;
	pageId?: string;
	view?: WorkspaceTab;
	/** Only meaningful when `view === 'settings'`. */
	settingsSection?: SettingsSection;
};

export type WorkspaceLocation = WorkspaceUrlState & {
	legacyQuery: boolean;
	/**
	 * Raw `/settings/:section` segment that is not a known section. The location still
	 * resolves to the settings view (without a section); callers must report it.
	 */
	invalidSettingsSection?: string;
};

const VIEW_TABS = new Set<WorkspaceTab>(['dashboard', 'kanban', 'scratchpad', 'chat', 'settings']);
export const SETTINGS_SECTIONS: readonly SettingsSection[] = ['account', 'appearance', 'access'];

export const isSettingsSection = (value: unknown): value is SettingsSection =>
	typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);

export const parseWorkspaceUrl = (searchParams: URLSearchParams): WorkspaceUrlState => {
	const projectId = searchParams.get('project') || searchParams.get('p') || undefined;
	const boardId = searchParams.get('board') || searchParams.get('b') || undefined;
	const pageId =
		searchParams.get('page') || searchParams.get('note') || searchParams.get('n') || undefined;
	const viewRaw = searchParams.get('view') || searchParams.get('v') || undefined;
	const view =
		viewRaw && VIEW_TABS.has(viewRaw as WorkspaceTab) ? (viewRaw as WorkspaceTab) : undefined;
	const sectionRaw = searchParams.get('section');
	const settingsSection =
		view === 'settings' && isSettingsSection(sectionRaw) ? sectionRaw : undefined;
	return { projectId, boardId, pageId, view, ...(settingsSection ? { settingsSection } : {}) };
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
			return {
				projectId,
				boardId: decodeURIComponent(projectMatch[3]),
				view: 'kanban',
				legacyQuery: false
			};
		}
		if (projectMatch[2] === 'pages') {
			return {
				projectId,
				pageId: decodeURIComponent(projectMatch[3]),
				view: 'scratchpad',
				legacyQuery: false
			};
		}
		return { projectId, view: 'kanban', legacyQuery: false };
	}
	if (path === '/dashboard') return { view: 'dashboard', legacyQuery: false };
	if (path === '/settings') return { view: 'settings', legacyQuery: false };
	const settingsMatch = path.match(/^\/settings\/([^/]+)$/);
	if (settingsMatch) {
		const section = decodeURIComponent(settingsMatch[1]);
		return isSettingsSection(section)
			? { view: 'settings', settingsSection: section, legacyQuery: false }
			: { view: 'settings', invalidSettingsSection: section, legacyQuery: false };
	}
	if (path === '/') {
		const query = parseWorkspaceUrl(searchParams);
		return {
			...query,
			legacyQuery:
				path === '/' && Boolean(query.projectId || query.view || query.boardId || query.pageId)
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
	if (state.view === 'settings' && state.settingsSection)
		params.set('section', state.settingsSection);
	return params;
};

export const buildWorkspacePath = (state: WorkspaceUrlState): string => {
	// Settings is account-level: it never carries the project in its URL.
	if (state.view === 'settings')
		return state.settingsSection
			? `/settings/${encodeURIComponent(state.settingsSection)}`
			: '/settings';
	if (!state.projectId || state.view === 'dashboard') return '/dashboard';
	const project = encodeURIComponent(state.projectId);
	if (state.view === 'kanban' && state.boardId)
		return `/projects/${project}/boards/${encodeURIComponent(state.boardId)}`;
	if (state.view === 'scratchpad' && state.pageId)
		return `/projects/${project}/pages/${encodeURIComponent(state.pageId)}`;
	if (state.view === 'chat') return `/projects/${project}/chat`;
	return `/projects/${project}`;
};

export const buildWorkspaceShareUrl = (
	state: WorkspaceUrlState,
	origin = typeof window !== 'undefined' ? window.location.origin : ''
): string => {
	const base = (origin || '').replace(/\/$/, '');
	return `${base}${buildWorkspacePath(state)}`;
};

export const workspaceSearchParamsEqual = (left: URLSearchParams, right: URLSearchParams) =>
	buildWorkspaceSearchParams(parseWorkspaceUrl(left)).toString() ===
	buildWorkspaceSearchParams(parseWorkspaceUrl(right)).toString();
