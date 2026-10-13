import { describe, expect, it } from 'vitest';
import {
	buildWorkspaceSearchParams,
	buildWorkspacePath,
	buildWorkspaceShareUrl,
	isSettingsSection,
	parseWorkspaceLocation,
	parseWorkspaceUrl,
	workspaceSearchParamsEqual
} from '../src/lib/kainbu/workspaceUrl';

describe('workspaceUrl', () => {
	it('makes the dashboard route override a remembered board or legacy query', () => {
		expect(
			parseWorkspaceLocation('/dashboard', new URLSearchParams('project=p1&view=kanban&board=b1'))
		).toEqual({ view: 'dashboard', legacyQuery: false });
		expect(
			buildWorkspacePath({
				projectId: 'p1',
				boardId: 'b1',
				...parseWorkspaceLocation('/dashboard')
			})
		).toBe('/dashboard');
	});
	it('round-trips board links', () => {
		const state = {
			projectId: 'proj-1',
			boardId: 'board-2',
			view: 'kanban' as const
		};
		const params = buildWorkspaceSearchParams(state);
		expect(parseWorkspaceUrl(params)).toEqual(state);
		expect(buildWorkspaceShareUrl(state, 'https://kainbu.example')).toBe(
			'https://kainbu.example/projects/proj-1/boards/board-2'
		);
	});

	it('treats equivalent aliases as equal', () => {
		const left = new URLSearchParams('project=a&view=kanban&board=b');
		const right = new URLSearchParams('p=a&v=kanban&b=b');
		expect(workspaceSearchParamsEqual(left, right)).toBe(true);
	});

	it('round-trips dedicated board, page, and chat routes', () => {
		expect(parseWorkspaceLocation('/projects/p%2F1/boards/b-2')).toMatchObject({
			projectId: 'p/1',
			boardId: 'b-2',
			view: 'kanban',
			legacyQuery: false
		});
		expect(parseWorkspaceLocation('/projects/p1/pages/n1')).toMatchObject({
			projectId: 'p1',
			pageId: 'n1',
			view: 'scratchpad'
		});
		expect(parseWorkspaceLocation('/projects/p1/chat')).toMatchObject({
			projectId: 'p1',
			view: 'chat'
		});
		expect(buildWorkspacePath({ projectId: 'p1', boardId: 'b1', view: 'kanban' })).toBe(
			'/projects/p1/boards/b1'
		);
		expect(buildWorkspacePath({ projectId: 'p1', pageId: 'n1', view: 'scratchpad' })).toBe(
			'/projects/p1/pages/n1'
		);
		expect(buildWorkspacePath({ projectId: 'p1', view: 'chat' })).toBe('/projects/p1/chat');
	});

	it('gives settings its own URL instead of mapping it to the dashboard', () => {
		expect(buildWorkspacePath({ projectId: 'p1', boardId: 'b1', view: 'settings' })).toBe(
			'/settings'
		);
		expect(
			buildWorkspacePath({
				projectId: 'p1',
				boardId: 'b1',
				view: 'settings',
				settingsSection: 'account'
			})
		).toBe('/settings/account');
		expect(parseWorkspaceLocation('/settings')).toEqual({ view: 'settings', legacyQuery: false });
		expect(parseWorkspaceLocation('/settings/')).toEqual({ view: 'settings', legacyQuery: false });
	});

	it('round-trips every settings section', () => {
		for (const section of ['account', 'appearance', 'access'] as const) {
			const path = buildWorkspacePath({ view: 'settings', settingsSection: section });
			expect(path).toBe(`/settings/${section}`);
			expect(parseWorkspaceLocation(path)).toEqual({
				view: 'settings',
				settingsSection: section,
				legacyQuery: false
			});
			expect(buildWorkspacePath(parseWorkspaceLocation(path))).toBe(path);
		}
	});

	it('reports an unknown settings section explicitly instead of guessing one', () => {
		const location = parseWorkspaceLocation('/settings/billing');
		expect(location).toEqual({
			view: 'settings',
			invalidSettingsSection: 'billing',
			legacyQuery: false
		});
		expect(location.settingsSection).toBeUndefined();
		expect(buildWorkspacePath(location)).toBe('/settings');
		expect(parseWorkspaceLocation('/settings/account/extra')).toEqual({ legacyQuery: false });
		expect(isSettingsSection('billing')).toBe(false);
		expect(isSettingsSection('access')).toBe(true);
	});

	it('accepts legacy settings query links', () => {
		expect(parseWorkspaceLocation('/', new URLSearchParams('view=settings'))).toEqual({
			view: 'settings',
			legacyQuery: true
		});
		const withSection = parseWorkspaceLocation(
			'/',
			new URLSearchParams('view=settings&section=access')
		);
		expect(withSection).toMatchObject({
			view: 'settings',
			settingsSection: 'access',
			legacyQuery: true
		});
		expect(buildWorkspacePath(withSection)).toBe('/settings/access');
		expect(
			parseWorkspaceLocation('/', new URLSearchParams('view=settings&section=bogus'))
				.settingsSection
		).toBeUndefined();
		expect(
			buildWorkspaceSearchParams({ view: 'settings', settingsSection: 'account' }).toString()
		).toBe('view=settings&section=account');
	});

	it('marks old root query links for migration', () => {
		expect(
			parseWorkspaceLocation('/', new URLSearchParams('project=p1&view=kanban&board=b1'))
		).toMatchObject({
			projectId: 'p1',
			boardId: 'b1',
			legacyQuery: true
		});
	});
});
