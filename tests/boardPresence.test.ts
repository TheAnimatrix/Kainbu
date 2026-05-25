import { describe, expect, it } from 'vitest';
import { getBoardPresenceViewers, BOARD_PRESENCE_TTL_MS } from '../src/lib/kainbu/boardPresence';
import type { ProjectMembership } from '../src/lib/kainbu/types';

const member = (overrides: Partial<ProjectMembership>): ProjectMembership => ({
	projectId: 'proj',
	userId: 'useraaaaaaaaaaaaa',
	role: 'member',
	joinedAt: 0,
	lastOpenedAt: 0,
	...overrides
});

describe('getBoardPresenceViewers', () => {
	it('includes recent viewers on the same board except current user', () => {
		const now = Date.now();
		const viewers = getBoardPresenceViewers(
			[
				member({
					userId: 'self111111111111',
					isCurrentUser: true,
					viewingBoardId: 'board-a',
					presenceAt: now
				}),
				member({
					userId: 'other222222222222',
					viewingBoardId: 'board-a',
					presenceAt: now - 1000
				}),
				member({
					userId: 'stale333333333333',
					viewingBoardId: 'board-a',
					presenceAt: now - BOARD_PRESENCE_TTL_MS - 1
				})
			],
			'board-a',
			'self111111111111',
			now
		);

		expect(viewers.map((entry) => entry.userId)).toEqual(['other222222222222']);
	});
});
