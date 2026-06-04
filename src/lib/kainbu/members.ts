import type { ProjectMembership } from '$lib/kainbu/types';

const normalizeMemberValue = (value?: string | null) =>
	typeof value === 'string' && value.trim().length ? value.trim() : null;

export const getProjectMemberDisplayName = (
	member: Pick<ProjectMembership, 'userId' | 'email' | 'username' | 'isCurrentUser'>,
	options: { preferCurrentUserLabel?: boolean } = {}
) => {
	if (options.preferCurrentUserLabel !== false && member.isCurrentUser) {
		return 'You';
	}

	return normalizeMemberValue(member.username) || normalizeMemberValue(member.email) || 'Teammate';
};

export const getProjectMemberSearchText = (
	member: Pick<ProjectMembership, 'userId' | 'email' | 'username' | 'role'>
) =>
	[
		normalizeMemberValue(member.username),
		normalizeMemberValue(member.email),
		member.userId,
		member.role
	]
		.filter(Boolean)
		.join(' ');
