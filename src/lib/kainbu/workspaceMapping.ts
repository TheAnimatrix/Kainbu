import type {
	Project,
	ProjectInvite,
	ProjectInviteRow,
	ProjectMembership,
	ProjectMembershipRow,
	ProjectRow
} from './types.js';

export const mapMembershipRow = (
	row: ProjectMembershipRow,
	email: string | undefined,
	username: string | null,
	avatarUrl: string | null | undefined,
	currentUserId: string
): ProjectMembership => ({
	projectId: row.project_id,
	userId: row.user_id,
	role: row.role,
	email,
	username,
	avatarUrl: avatarUrl ?? null,
	joinedAt: new Date(row.joined_at).getTime(),
	lastOpenedAt: new Date(row.last_opened_at).getTime(),
	viewingBoardId: row.viewing_board_client_id || undefined,
	presenceAt: row.presence_at ? new Date(row.presence_at).getTime() : undefined,
	isCurrentUser: row.user_id === currentUserId
});

export const mapInviteRow = (row: ProjectInviteRow, projectName?: string): ProjectInvite => ({
	id: row.id,
	projectId: row.project_id,
	inviteeUserId: row.invitee_user_id,
	inviteeEmail: row.invitee_email,
	invitedByUserId: row.invited_by_user_id,
	status: row.status,
	projectName,
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime(),
	respondedAt: row.responded_at ? new Date(row.responded_at).getTime() : undefined
});

export const compareProjects = (left: Project, right: Project) => {
	const leftPinned = left.viewerPinnedAt ?? 0;
	const rightPinned = right.viewerPinnedAt ?? 0;
	if (leftPinned !== rightPinned) return rightPinned - leftPinned;

	return (
		left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
		right.updatedAt - left.updatedAt ||
		left.id.localeCompare(right.id)
	);
};

export const findProjectName = (projectRows: ProjectRow[], projectId: string) =>
	projectRows.find((project) => project.id === projectId)?.name;
