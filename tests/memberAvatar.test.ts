import { describe, expect, it } from 'vitest';
import { getMemberAvatarUrl } from '../src/lib/kainbu/members';
import type { ProjectMembership } from '../src/lib/kainbu/types';

const member = (overrides: Partial<ProjectMembership>): ProjectMembership => ({
	projectId: 'project-1',
	userId: 'user-a',
	role: 'member',
	joinedAt: 0,
	lastOpenedAt: 0,
	...overrides
});

describe('getMemberAvatarUrl', () => {
	it('prefers the live profile avatar for the current user', () => {
		expect(
			getMemberAvatarUrl(
				member({
					userId: 'user-a',
					isCurrentUser: true,
					avatarUrl: 'https://example.com/stale.jpg'
				}),
				'user-a',
				'https://example.com/current.jpg'
			)
		).toBe('https://example.com/current.jpg');
	});

	it('falls back to membership avatar for teammates', () => {
		expect(
			getMemberAvatarUrl(
				member({
					userId: 'user-b',
					avatarUrl: 'https://example.com/teammate.jpg'
				}),
				'user-a',
				'https://example.com/current.jpg'
			)
		).toBe('https://example.com/teammate.jpg');
	});

	it('uses membership avatar for the current user when profile avatar is missing', () => {
		expect(
			getMemberAvatarUrl(
				member({
					userId: 'user-a',
					isCurrentUser: true,
					avatarUrl: 'https://example.com/membership.jpg'
				}),
				'user-a',
				null
			)
		).toBe('https://example.com/membership.jpg');
	});
});
