import { describe, expect, it } from 'vitest';
import {
	buildWorkspaceSearchParams,
	buildWorkspacePath,
	buildWorkspaceShareUrl,
	parseWorkspaceLocation,
	parseWorkspaceUrl,
	workspaceSearchParamsEqual
} from '../src/lib/kainbu/workspaceUrl';

describe('workspaceUrl', () => {
	it('round-trips board links', () => {
		const state = {
			projectId: 'proj-1',
			boardId: 'board-2',
			view: 'kanban' as const
		};
		const params = buildWorkspaceSearchParams(state);
		expect(parseWorkspaceUrl(params)).toEqual(state);
		expect(buildWorkspaceShareUrl(state, 'https://kainbu.example')).toBe(
			'https://kainbu.example/?project=proj-1&view=kanban&board=board-2'
		);
	});

	it('treats equivalent aliases as equal', () => {
		const left = new URLSearchParams('project=a&view=kanban&board=b');
		const right = new URLSearchParams('p=a&v=kanban&b=b');
		expect(workspaceSearchParamsEqual(left, right)).toBe(true);
	});

	it('round-trips dedicated board, page, and chat routes', () => {
		expect(parseWorkspaceLocation('/projects/p%2F1/boards/b-2')).toMatchObject({
			projectId: 'p/1', boardId: 'b-2', view: 'kanban', legacyQuery: false
		});
		expect(parseWorkspaceLocation('/projects/p1/pages/n1')).toMatchObject({ projectId: 'p1', pageId: 'n1', view: 'scratchpad' });
		expect(parseWorkspaceLocation('/projects/p1/chat')).toMatchObject({ projectId: 'p1', view: 'chat' });
		expect(buildWorkspacePath({ projectId: 'p1', boardId: 'b1', view: 'kanban' })).toBe('/projects/p1/boards/b1');
		expect(buildWorkspacePath({ projectId: 'p1', pageId: 'n1', view: 'scratchpad' })).toBe('/projects/p1/pages/n1');
		expect(buildWorkspacePath({ projectId: 'p1', view: 'chat' })).toBe('/projects/p1/chat');
	});

	it('marks old root query links for migration', () => {
		expect(parseWorkspaceLocation('/', new URLSearchParams('project=p1&view=kanban&board=b1'))).toMatchObject({
			projectId: 'p1', boardId: 'b1', legacyQuery: true
		});
	});
});
