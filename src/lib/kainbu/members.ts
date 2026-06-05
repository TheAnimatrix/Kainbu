import { getAvatarInitials } from '$lib/kainbu/avatar';
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

export const getMemberAvatarInitials = (
	member: Pick<ProjectMembership, 'userId' | 'email' | 'username'>
) => {
	const username = normalizeMemberValue(member.username);
	if (username) return getAvatarInitials(username, 2);

	const email = normalizeMemberValue(member.email);
	if (email) return getAvatarInitials(email.split('@')[0] || email, 2);

	return getAvatarInitials(member.userId, 2);
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
