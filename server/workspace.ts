import type PocketBase from 'pocketbase';
import type { BackgroundTheme } from '../src/lib/kainbu/types.js';
import { createAdminPb, getAuthenticatedUserId } from './pocketbase.js';
import {
	getProjectPbId,
	getProjectRecord,
	pbEscapeFilter,
	projectClientFilter,
	projectRelationFilter
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
	'cinder',
	'deep-sea',
	'evergreen',
	'navy-room',
	'mulberry'
]);

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
		return typeof value.id === 'string' && VALID_SOLID_BACKGROUND_IDS.has(value.id.trim());
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
		return await admin.collection('project_memberships').getFirstListItem(
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
		const data = await admin.collection('project_invites').getOne(inviteId);
		return {
			id: String(data.id),
			project_id: String(
				(data.expand as { project?: { client_id?: string } })?.project?.client_id || data.project
			),
			invitee_user_id: relationId(data.invitee),
			invitee_email: String(data.invitee_email || ''),
			invited_by_user_id: relationId(data.invited_by),
			status:
				data.status === 'accepted' ||
				data.status === 'rejected' ||
				data.status === 'cancelled'
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

	if (!profile?.user_id || !profile.email) {
		throw new WorkspaceApiError(400, 'Only existing accounts can be invited.');
	}

	if (profile.user_id === project.user_id) {
		throw new WorkspaceApiError(400, 'You are already on this board.');
	}

	const membership = await getMembership(admin, projectId, profile.user_id);
	if (membership) {
		throw new WorkspaceApiError(400, 'That user is already a collaborator.');
	}

	const projectPbId = await getProjectPbId(admin, projectId);
	try {
		const existing = await admin.collection('project_invites').getFirstListItem(
			`${projectRelationFilter(projectPbId)} && invitee = "${pbEscapeFilter(profile.user_id)}"`
		);
		await admin.collection('project_invites').update(existing.id, {
			invitee_email: profile.email,
			invited_by: userId,
			status: 'pending',
			responded_at: ''
		});
	} catch {
		await admin.collection('project_invites').create({
			project: projectPbId,
			invitee: profile.user_id,
			invitee_email: profile.email,
			invited_by: userId,
			status: 'pending'
		});
	}

	return { ok: true };
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

	if (invite.invitee_user_id !== userId) {
		throw new WorkspaceApiError(403, 'You can only respond to your own invite.');
	}

	if (invite.status !== 'pending') {
		throw new WorkspaceApiError(409, 'This invite has already been handled.');
	}

	const respondedAt = new Date().toISOString();
	await admin.collection('project_invites').update(inviteId, {
		status: accept ? 'accepted' : 'rejected',
		responded_at: respondedAt
	});

	if (accept) {
		const projectPbId = await getProjectPbId(admin, invite.project_id);
		const existingMembership = await getMembership(admin, invite.project_id, invite.invitee_user_id);
		const now = new Date().toISOString();
		if (existingMembership) {
			await admin.collection('project_memberships').update(existingMembership.id, {
				last_opened_at: now
			});
		} else {
			await admin.collection('project_memberships').create({
				project: projectPbId,
				user: invite.invitee_user_id,
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
		membership
			? admin.collection('project_memberships').delete(membership.id)
			: Promise.resolve()
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
