import { describe, expect, it } from 'vitest';
import {
	buildWorkspaceSearchParams,
	buildWorkspaceShareUrl,
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
});
