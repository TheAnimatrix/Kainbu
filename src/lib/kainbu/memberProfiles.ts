import { invokeWorkspaceApi } from './workspaceApi.js';
import { normalizeUsernameValue } from './usernames.js';
import type { ProfileRow } from './types.js';

export const fetchSharedMemberProfiles = async (
	userIds: string[]
): Promise<Pick<ProfileRow, 'user_id' | 'email' | 'username' | 'avatar_url'>[]> => {
	const uniqueUserIds = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
	if (!uniqueUserIds.length) {
		return [];
	}

	const result = await invokeWorkspaceApi<{
		profiles: Array<{
			userId: string;
			email?: string | null;
			username?: string | null;
			avatarUrl?: string | null;
		}>;
	}>('/api/workspace/members/profiles', {
		body: { userIds: uniqueUserIds }
	});

	return (result.profiles || []).map((profile) => ({
		user_id: profile.userId,
		email: profile.email || null,
		username: normalizeUsernameValue(profile.username),
		avatar_url: profile.avatarUrl ?? null
	}));
};
