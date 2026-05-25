import type { ProjectMembership } from '$lib/kainbu/types';

export const BOARD_PRESENCE_TTL_MS = 90_000;
export const BOARD_PRESENCE_INTERVAL_MS = 30_000;

export const getBoardPresenceViewers = (
	members: ProjectMembership[],
	boardId: string,
	currentUserId: string | undefined,
	now = Date.now()
): ProjectMembership[] => {
	if (!boardId.trim()) return [];

	return members.filter((member) => {
		if (currentUserId && member.userId === currentUserId) return false;
		if (member.viewingBoardId !== boardId) return false;
		if (!member.presenceAt) return false;
		return now - member.presenceAt <= BOARD_PRESENCE_TTL_MS;
	});
};
