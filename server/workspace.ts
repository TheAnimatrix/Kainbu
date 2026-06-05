import type PocketBase from 'pocketbase';
import type { BackgroundTheme } from '../src/lib/kainbu/types.js';
import { formatPocketBaseError } from '../src/lib/pocketbaseErrors.js';
import { sendProjectInviteEmail } from './mailDelivery.js';
import { createAdminPb, getAuthenticatedUserId } from './pocketbase.js';
import { ClientResponseError } from 'pocketbase';
import {
	getProjectPbId,
	getProjectRecord,
	pbEscapeFilter,
	projectClientFilter,
	projectRelationFilter,
	resolveProjectClientId
} from './pbWorkspace.js';

const VALID_GRADIENT_BACKGROUND_IDS = new Set([
	'ember-haze',
	'lagoon-veil',
	'forest-glow',
	'indigo-rain',
	'rose-fog',
	'ash-sunrise'
]);

const VALID_SOLID_BACKGROUND_IDS = new Set([
	'obsidian',
	'graphite',
	'cinder',
	'deep-sea',
	'evergreen',
	'navy-room',
	'mulberry',
	'sand',
	'porcelain',
	'plum'
]);

const isCustomHslSolidId = (id: string) => /^custom-hsl-\d{1,3}-\d{1,3}-\d{1,3}$/.test(id.trim());

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isBackgroundTheme = (value: unknown): value is BackgroundTheme => {
	if (!isRecord(value) || typeof value.kind !== 'string') {
		return false;
	}

	if (value.kind === 'gradient') {
		return typeof value.id === 'string' && VALID_GRADIENT_BACKGROUND_IDS.has(value.id.trim());
	}

	if (value.kind === 'solid') {
		const id = typeof value.id === 'string' ? value.id.trim() : '';
		return VALID_SOLID_BACKGROUND_IDS.has(id) || isCustomHslSolidId(id);
	}

	if (value.kind === 'image') {
		return typeof value.path === 'string' && value.path.trim().length > 0;
	}

	return false;
};

class WorkspaceApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

type WorkspaceScratchpadRequest = {
	projectId: string;
	scratchpadData: string;
	expectedRevision: number;
};

type WorkspaceProjectRequest = {
	projectId: string;
};

type WorkspaceProjectBackgroundRequest = {
	projectId: string;
	backgroundTheme: BackgroundTheme | null;
};

type WorkspaceInviteCreateRequest = {
	projectId: string;
	inviteeEmail: string;
};

type WorkspaceInviteRespondRequest = {
	inviteId: string;
	accept: boolean;
};

type WorkspaceInviteCancelRequest = {
	inviteId: string;
};

type WorkspaceRemoveMemberRequest = {
	projectId: string;
	memberUserId: string;
};

type WorkspaceLeaveProjectRequest = {
	projectId: string;
};

type WorkspaceBoardPresenceRequest = {
	projectId: string;
	boardId: string | null;
};

type WorkspaceMemberProfilesRequest = {
	userIds: string[];
};

const requireString = (value: unknown, field: string) => {
	if (typeof value !== 'string' || !value.trim()) {
		throw new WorkspaceApiError(400, `${field} is required.`);
	}

	return value.trim();
};

const requireBoolean = (value: unknown, field: string) => {
	if (typeof value !== 'boolean') {
		throw new WorkspaceApiError(400, `${field} must be a boolean.`);
	}

	return value;
};

const requireInteger = (value: unknown, field: string) => {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new WorkspaceApiError(400, `${field} must be an integer.`);
	}

	return value;
};

const requireBackgroundThemeOrNull = (value: unknown, field: string) => {
	if (value == null) {
		return null;
	}

	if (!isBackgroundTheme(value)) {
		throw new WorkspaceApiError(400, `${field} is invalid.`);
	}

	return value;
};

const relationId = (value: unknown) => {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && typeof (value as { id?: string }).id === 'string') {
		return (value as { id: string }).id;
	}
	return '';
};

const getProjectOrThrow = async (admin: PocketBase, projectId: string) => {
	try {
		const data = await getProjectRecord(admin, projectId);
		return {
			id: String(data.client_id || data.id),
			user_id: relationId(data.owner),
			name: String(data.name || ''),
			scratchpad_data: String(data.scratchpad_data || ''),
			scratchpad_rev: typeof data.scratchpad_rev === 'number' ? data.scratchpad_rev : 0,
			updated_at: String(data.updated || new Date().toISOString()),
			_pbId: String(data.id)
		};
	} catch {
		throw new WorkspaceApiError(404, 'Project not found.');
	}
};

const ensureOwnerProject = async (admin: PocketBase, projectId: string, userId: string) => {
	const project = await getProjectOrThrow(admin, projectId);
	if (project.user_id !== userId) {
		throw new WorkspaceApiError(403, 'Only the project owner can perform this action.');
	}

	return project;
};

const getMembership = async (admin: PocketBase, projectId: string, userId: string) => {
	const projectPbId = await getProjectPbId(admin, projectId);
	try {
		return await admin
			.collection('project_memberships')
			.getFirstListItem(
				`${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`
			);
	} catch {
		return null;
	}
};

const ensureMembership = async (admin: PocketBase, projectId: string, userId: string) => {
	const membership = await getMembership(admin, projectId, userId);
	if (!membership) {
		throw new WorkspaceApiError(404, 'Membership not found.');
	}

	return membership;
};

const getInviteOrThrow = async (admin: PocketBase, inviteId: string) => {
	try {
		const data = await admin.collection('project_invites').getOne(inviteId, {
			expand: 'project'
		});
		const projectPbId = String(data.project);
		const expandedProject = (data.expand as { project?: { client_id?: string } })?.project;
		const projectClientId = await resolveProjectClientId(admin, projectPbId, expandedProject);

		return {
			id: String(data.id),
			project_id: projectClientId,
			project_pb_id: projectPbId,
			invitee_user_id: relationId(data.invitee),
			invitee_email: String(data.invitee_email || ''),
			invited_by_user_id: relationId(data.invited_by),
			status:
				data.status === 'accepted' || data.status === 'rejected' || data.status === 'cancelled'
					? data.status
					: 'pending',
			created_at: String(data.created || new Date().toISOString()),
			updated_at: String(data.updated || new Date().toISOString()),
			responded_at: data.responded_at ? String(data.responded_at) : null
		};
	} catch {
		throw new WorkspaceApiError(404, 'Invite not found.');
	}
};

const getProfileByEmail = async (admin: PocketBase, inviteeEmail: string) => {
	const normalizedEmail = inviteeEmail.trim().toLowerCase();
	try {
		const data = await admin
			.collection('users')
			.getFirstListItem(`email = "${pbEscapeFilter(normalizedEmail)}"`);
		return { user_id: String(data.id), email: String(data.email || normalizedEmail) };
	} catch {
		return null;
	}
};

const isUnsetInviteeRelation = (value: unknown) => !relationId(value);

export type LinkPendingInvitesResult = { linked: number; failed: number };

/** Attach email-only pending invites to a new user. Never throws — signup must not fail after user create. */
export const linkPendingInvitesByEmail = async (
	admin: PocketBase,
	email: string,
	userId: string
): Promise<LinkPendingInvitesResult> => {
	const normalizedEmail = email.trim().toLowerCase();
	if (!normalizedEmail || !userId) return { linked: 0, failed: 0 };

	let invites: { id: string; invitee?: unknown }[] = [];
	try {
		invites = await admin.collection('project_invites').getFullList({
			filter: `invitee_email = "${pbEscapeFilter(normalizedEmail)}" && status = "pending"`
		});
	} catch (error) {
		console.error('[invites] linkPendingInvitesByEmail list failed', {
			email: normalizedEmail,
			error: error instanceof Error ? error.message : String(error)
		});
		return { linked: 0, failed: 0 };
	}

	const toLink = invites.filter((invite) => isUnsetInviteeRelation(invite.invitee));
	let linked = 0;
	let failed = 0;

	for (const invite of toLink) {
		try {
			await admin.collection('project_invites').update(invite.id, { invitee: userId });
			linked += 1;
		} catch (error) {
			failed += 1;
			console.error('[invites] linkPendingInvitesByEmail update failed', {
				inviteId: invite.id,
				email: normalizedEmail,
				userId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return { linked, failed };
};

const inviteeCanRespond = (
	invite: { invitee_user_id: string; invitee_email: string },
	userId: string,
	authEmail: string
) => {
	if (invite.invitee_user_id && invite.invitee_user_id === userId) return true;
	return !invite.invitee_user_id && invite.invitee_email.toLowerCase() === authEmail;
};

const jsonProjectScratchpadResult = (row: {
	scratchpad_data: string;
	scratchpad_rev: number;
	updated_at: string;
}) => ({
	scratchpadData: row.scratchpad_data,
	scratchpadRev: row.scratchpad_rev,
	updatedAt: new Date(row.updated_at).getTime()
});

export const toWorkspaceApiError = (error: unknown) => {
	if (error instanceof WorkspaceApiError) {
		return {
			status: error.status,
			message: error.message
		};
	}

	if (error instanceof ClientResponseError) {
		const status =
			error.status === 404 ? 404 : error.status >= 400 && error.status < 600 ? error.status : 500;
		return {
			status,
			message:
				status === 404
					? 'The requested resource was not found.'
					: formatPocketBaseError(error, 'PocketBase request failed.')
		};
	}

	if (error instanceof Error) {
		return {
			status: error.message === 'Unauthorized' ? 401 : 500,
			message: error.message
		};
	}

	return {
		status: 500,
		message: 'Unknown error'
	};
};

export const handleWorkspaceTouchProjectRequest = async (
	body: WorkspaceProjectRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');

	await ensureMembership(admin, projectId, userId);

	const membership = await getMembership(admin, projectId, userId);
	if (!membership) throw new WorkspaceApiError(404, 'Membership not found.');
	await admin.collection('project_memberships').update(membership.id, {
		last_opened_at: new Date().toISOString()
	});

	return { ok: true };
};

export const handleWorkspaceBoardPresenceRequest = async (
	body: WorkspaceBoardPresenceRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const boardId =
		typeof body.boardId === 'string' && body.boardId.trim() ? body.boardId.trim() : '';

	await ensureMembership(admin, projectId, userId);

	const membership = await getMembership(admin, projectId, userId);
	if (!membership) throw new WorkspaceApiError(404, 'Membership not found.');

	const now = new Date().toISOString();
	await admin.collection('project_memberships').update(membership.id, {
		last_opened_at: now,
		viewing_board_client_id: boardId,
		presence_at: boardId ? now : ''
	});

	return { ok: true };
};

export const handleWorkspacePinProjectRequest = async (
	body: WorkspaceProjectRequest & { pinned?: boolean },
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const pinned = body.pinned === true;

	await ensureMembership(admin, projectId, userId);

	const membership = await getMembership(admin, projectId, userId);
	if (!membership) throw new WorkspaceApiError(404, 'Membership not found.');
	await admin.collection('project_memberships').update(membership.id, {
		pinned_at: pinned ? new Date().toISOString() : ''
	});

	return { ok: true, pinned };
};

export const handleWorkspaceScratchpadRequest = async (
	body: WorkspaceScratchpadRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const scratchpadData = requireString(body.scratchpadData, 'scratchpadData');
	const expectedRevision = requireInteger(body.expectedRevision, 'expectedRevision');

	await ensureMembership(admin, projectId, userId);

	const project = await getProjectOrThrow(admin, projectId);
	if (project.scratchpad_rev !== expectedRevision) {
		return {
			ok: false,
			...jsonProjectScratchpadResult(project)
		};
	}

	const updatedProject = await admin.collection('projects').update(project._pbId, {
		scratchpad_data: scratchpadData,
		scratchpad_rev: expectedRevision + 1
	});

	return {
		ok: true,
		...jsonProjectScratchpadResult({
			scratchpad_data: String(updatedProject.scratchpad_data || ''),
			scratchpad_rev:
				typeof updatedProject.scratchpad_rev === 'number' ? updatedProject.scratchpad_rev : 0,
			updated_at: String(updatedProject.updated || new Date().toISOString())
		})
	};
};

export const handleWorkspaceProjectBackgroundRequest = async (
	body: WorkspaceProjectBackgroundRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const backgroundTheme = requireBackgroundThemeOrNull(body.backgroundTheme, 'backgroundTheme');

	await ensureMembership(admin, projectId, userId);

	const project = await getProjectOrThrow(admin, projectId);
	await admin.collection('projects').update(project._pbId, {
		background_theme: backgroundTheme
	});

	return { ok: true };
};

export const handleWorkspaceCreateInviteRequest = async (
	body: WorkspaceInviteCreateRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const inviteeEmail = requireString(body.inviteeEmail, 'inviteeEmail').toLowerCase();

	const project = await ensureOwnerProject(admin, projectId, userId);
	const profile = await getProfileByEmail(admin, inviteeEmail);

	if (profile?.user_id === project.user_id) {
		throw new WorkspaceApiError(400, 'You are already on this board.');
	}

	if (profile?.user_id) {
		const membership = await getMembership(admin, projectId, profile.user_id);
		if (membership) {
			throw new WorkspaceApiError(400, 'That user is already a collaborator.');
		}
	}

	const projectPbId = await getProjectPbId(admin, projectId);
	const invitePayload: Record<string, unknown> = {
		invitee_email: inviteeEmail,
		invited_by: userId,
		status: 'pending'
	};
	if (profile?.user_id) {
		invitePayload.invitee = profile.user_id;
	}

	try {
		const existing = await admin
			.collection('project_invites')
			.getFirstListItem(
				`${projectRelationFilter(projectPbId)} && invitee_email = "${pbEscapeFilter(inviteeEmail)}" && status = "pending"`
			);
		await admin.collection('project_invites').update(existing.id, invitePayload);
	} catch {
		await admin.collection('project_invites').create({
			project: projectPbId,
			...invitePayload
		});
	}

	const mailResult = await sendProjectInviteEmail(admin, inviteeEmail, project.name);
	return {
		ok: true,
		emailSent: mailResult.sent,
		emailConfigured: mailResult.configured,
		emailError: mailResult.error
	};
};

export const handleWorkspaceRespondInviteRequest = async (
	body: WorkspaceInviteRespondRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const inviteId = requireString(body.inviteId, 'inviteId');
	const accept = requireBoolean(body.accept, 'accept');
	const invite = await getInviteOrThrow(admin, inviteId);
	const authUser = await admin.collection('users').getOne(userId);
	const authEmail = String(authUser.email || '')
		.trim()
		.toLowerCase();

	if (!inviteeCanRespond(invite, userId, authEmail)) {
		throw new WorkspaceApiError(403, 'You can only respond to your own invite.');
	}

	if (invite.status !== 'pending') {
		throw new WorkspaceApiError(409, 'This invite has already been handled.');
	}

	const respondedAt = new Date().toISOString();
	const inviteUpdate: Record<string, unknown> = {
		status: accept ? 'accepted' : 'rejected',
		responded_at: respondedAt
	};
	if (!invite.invitee_user_id) {
		inviteUpdate.invitee = userId;
	}
	await admin.collection('project_invites').update(inviteId, inviteUpdate);

	if (accept) {
		const projectPbId = invite.project_pb_id;
		const memberUserId = invite.invitee_user_id || userId;
		const existingMembership = await getMembership(admin, invite.project_id, memberUserId);
		const now = new Date().toISOString();
		if (existingMembership) {
			await admin.collection('project_memberships').update(existingMembership.id, {
				last_opened_at: now
			});
		} else {
			await admin.collection('project_memberships').create({
				project: projectPbId,
				user: memberUserId,
				role: 'member',
				joined_at: now,
				last_opened_at: now
			});
		}
	}

	return { ok: true };
};

export const handleWorkspaceCancelInviteRequest = async (
	body: WorkspaceInviteCancelRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const inviteId = requireString(body.inviteId, 'inviteId');
	const invite = await getInviteOrThrow(admin, inviteId);

	await ensureOwnerProject(admin, invite.project_id, userId);

	await admin.collection('project_invites').update(inviteId, {
		status: 'cancelled',
		responded_at: new Date().toISOString()
	});

	return { ok: true };
};

export const handleWorkspaceRemoveMemberRequest = async (
	body: WorkspaceRemoveMemberRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const memberUserId = requireString(body.memberUserId, 'memberUserId');
	const project = await ensureOwnerProject(admin, projectId, userId);

	if (memberUserId === project.user_id) {
		throw new WorkspaceApiError(400, 'Use board deletion to remove the owner.');
	}

	const projectPbId = await getProjectPbId(admin, projectId);
	const userStates = await admin.collection('project_user_state').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(memberUserId)}"`
	});
	const aiSessions = await admin.collection('project_ai_sessions').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(memberUserId)}"`
	});
	const membership = await getMembership(admin, projectId, memberUserId);

	await Promise.all([
		...userStates.map((record) => admin.collection('project_user_state').delete(record.id)),
		...aiSessions.map((record) => admin.collection('project_ai_sessions').delete(record.id)),
		membership ? admin.collection('project_memberships').delete(membership.id) : Promise.resolve()
	]);

	return { ok: true };
};

export const handleWorkspaceLeaveProjectRequest = async (
	body: WorkspaceLeaveProjectRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const membership = await ensureMembership(admin, projectId, userId);

	if (membership.role === 'owner') {
		throw new WorkspaceApiError(400, 'The owner cannot leave their own board.');
	}

	const projectPbId = await getProjectPbId(admin, projectId);
	const userStates = await admin.collection('project_user_state').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`
	});
	const aiSessions = await admin.collection('project_ai_sessions').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`
	});

	await Promise.all([
		...userStates.map((record) => admin.collection('project_user_state').delete(record.id)),
		...aiSessions.map((record) => admin.collection('project_ai_sessions').delete(record.id)),
		admin.collection('project_memberships').delete(membership.id)
	]);

	return { ok: true };
};

export const handleWorkspaceMemberProfilesRequest = async (
	body: WorkspaceMemberProfilesRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = await createAdminPb();
	const requestedUserIds = [
		...new Set(
			(Array.isArray(body.userIds) ? body.userIds : []).filter((id) => typeof id === 'string')
		)
	]
		.map((id) => id.trim())
		.filter(Boolean)
		.slice(0, 100);

	if (!requestedUserIds.length) {
		return { profiles: [] };
	}

	const ownMemberships = await admin.collection('project_memberships').getFullList({
		filter: `user = "${pbEscapeFilter(userId)}"`
	});
	const projectIds = [...new Set(ownMemberships.map((membership) => String(membership.project)))];
	if (!projectIds.length) {
		return { profiles: [] };
	}

	const sharedMemberships = await admin.collection('project_memberships').getFullList({
		filter: `(${projectIds
			.map((projectId) => `project = "${pbEscapeFilter(projectId)}"`)
			.join(' || ')}) && (${requestedUserIds
			.map((id) => `user = "${pbEscapeFilter(id)}"`)
			.join(' || ')})`
	});
	const allowedUserIds = [
		...new Set(sharedMemberships.map((membership) => String(membership.user)).filter(Boolean))
	];

	if (!allowedUserIds.length) {
		return { profiles: [] };
	}

	const users = await admin.collection('users').getFullList({
		filter: allowedUserIds.map((id) => `id = "${pbEscapeFilter(id)}"`).join(' || ')
	});

	return {
		profiles: users.map((user) => ({
			userId: String(user.id),
			email: typeof user.email === 'string' ? user.email : null,
			username:
				typeof user.username === 'string' && user.username.trim() ? user.username.trim() : null,
			avatarUrl:
				typeof user.avatar === 'string' && user.avatar.trim()
					? admin.files.getURL(user, user.avatar)
					: null
		}))
	};
};
