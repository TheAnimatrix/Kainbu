import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	BackgroundTheme,
	ProfileRow,
	ProjectInviteRow,
	ProjectMembershipRow,
	ProjectRow
} from '../src/lib/kainbu/types.js';
import { createAdminSupabaseClient, getAuthenticatedUserId } from './supabase.js';

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

const getProjectOrThrow = async (admin: SupabaseClient, projectId: string) => {
	const { data, error } = await admin
		.from('projects')
		.select('id,user_id,name,scratchpad_data,scratchpad_rev,updated_at')
		.eq('id', projectId)
		.maybeSingle();

	if (error) throw error;
	if (!data) {
		throw new WorkspaceApiError(404, 'Project not found.');
	}

	return data as Pick<
		ProjectRow,
		'id' | 'user_id' | 'name' | 'scratchpad_data' | 'scratchpad_rev' | 'updated_at'
	>;
};

const ensureOwnerProject = async (admin: SupabaseClient, projectId: string, userId: string) => {
	const project = await getProjectOrThrow(admin, projectId);
	if (project.user_id !== userId) {
		throw new WorkspaceApiError(403, 'Only the project owner can perform this action.');
	}

	return project;
};

const getMembership = async (admin: SupabaseClient, projectId: string, userId: string) => {
	const { data, error } = await admin
		.from('project_memberships')
		.select('*')
		.eq('project_id', projectId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) throw error;
	return data as ProjectMembershipRow | null;
};

const ensureMembership = async (admin: SupabaseClient, projectId: string, userId: string) => {
	const membership = await getMembership(admin, projectId, userId);
	if (!membership) {
		throw new WorkspaceApiError(404, 'Membership not found.');
	}

	return membership;
};

const getInviteOrThrow = async (admin: SupabaseClient, inviteId: string) => {
	const { data, error } = await admin.from('project_invites').select('*').eq('id', inviteId).maybeSingle();

	if (error) throw error;
	if (!data) {
		throw new WorkspaceApiError(404, 'Invite not found.');
	}

	return data as ProjectInviteRow;
};

const getProfileByEmail = async (admin: SupabaseClient, inviteeEmail: string) => {
	const normalizedEmail = inviteeEmail.trim().toLowerCase();
	const { data, error } = await admin
		.from('profiles')
		.select('user_id,email')
		.ilike('email', normalizedEmail)
		.maybeSingle();

	if (error) throw error;
	return data as Pick<ProfileRow, 'user_id' | 'email'> | null;
};

const jsonProjectScratchpadResult = (row: Pick<ProjectRow, 'scratchpad_data' | 'scratchpad_rev' | 'updated_at'>) => ({
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
	const admin = createAdminSupabaseClient();
	const projectId = requireString(body.projectId, 'projectId');

	await ensureMembership(admin, projectId, userId);

	const { error } = await admin
		.from('project_memberships')
		.update({
			last_opened_at: new Date().toISOString()
		})
		.eq('project_id', projectId)
		.eq('user_id', userId);

	if (error) throw error;

	return { ok: true };
};

export const handleWorkspaceScratchpadRequest = async (
	body: WorkspaceScratchpadRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
	const projectId = requireString(body.projectId, 'projectId');
	const scratchpadData = requireString(body.scratchpadData, 'scratchpadData');
	const expectedRevision = requireInteger(body.expectedRevision, 'expectedRevision');

	await ensureMembership(admin, projectId, userId);

	const { data: updatedProject, error: updateError } = await admin
		.from('projects')
		.update({
			scratchpad_data: scratchpadData,
			scratchpad_rev: expectedRevision + 1,
			updated_at: new Date().toISOString()
		})
		.eq('id', projectId)
		.eq('scratchpad_rev', expectedRevision)
		.select('scratchpad_data,scratchpad_rev,updated_at')
		.maybeSingle();

	if (updateError) throw updateError;
	if (updatedProject) {
		return {
			ok: true,
			...jsonProjectScratchpadResult(
				updatedProject as Pick<ProjectRow, 'scratchpad_data' | 'scratchpad_rev' | 'updated_at'>
			)
		};
	}

	const project = await getProjectOrThrow(admin, projectId);
	return {
		ok: false,
		...jsonProjectScratchpadResult(project)
	};
};

export const handleWorkspaceProjectBackgroundRequest = async (
	body: WorkspaceProjectBackgroundRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
	const projectId = requireString(body.projectId, 'projectId');
	const backgroundTheme = requireBackgroundThemeOrNull(body.backgroundTheme, 'backgroundTheme');

	await ensureMembership(admin, projectId, userId);

	const { error } = await admin
		.from('projects')
		.update({
			background_theme: backgroundTheme,
			updated_at: new Date().toISOString()
		})
		.eq('id', projectId);

	if (error) throw error;

	return { ok: true };
};

export const handleWorkspaceCreateInviteRequest = async (
	body: WorkspaceInviteCreateRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
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

	const { error } = await admin.from('project_invites').upsert(
		{
			project_id: projectId,
			invitee_user_id: profile.user_id,
			invitee_email: profile.email,
			invited_by_user_id: userId,
			status: 'pending',
			responded_at: null
		},
		{
			onConflict: 'project_id,invitee_user_id'
		}
	);

	if (error) throw error;

	return { ok: true };
};

export const handleWorkspaceRespondInviteRequest = async (
	body: WorkspaceInviteRespondRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
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
	const { error: inviteUpdateError } = await admin
		.from('project_invites')
		.update({
			status: accept ? 'accepted' : 'rejected',
			responded_at: respondedAt
		})
		.eq('id', inviteId);

	if (inviteUpdateError) throw inviteUpdateError;

	if (accept) {
		const existingMembership = await getMembership(admin, invite.project_id, invite.invitee_user_id);
		const now = new Date().toISOString();
		const { error: membershipError } = await admin.from('project_memberships').upsert(
			{
				project_id: invite.project_id,
				user_id: invite.invitee_user_id,
				role: 'member',
				joined_at: existingMembership?.joined_at || now,
				last_opened_at: now
			},
			{
				onConflict: 'project_id,user_id'
			}
		);

		if (membershipError) throw membershipError;
	}

	return { ok: true };
};

export const handleWorkspaceCancelInviteRequest = async (
	body: WorkspaceInviteCancelRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
	const inviteId = requireString(body.inviteId, 'inviteId');
	const invite = await getInviteOrThrow(admin, inviteId);

	await ensureOwnerProject(admin, invite.project_id, userId);

	const { error } = await admin
		.from('project_invites')
		.update({
			status: 'cancelled',
			responded_at: new Date().toISOString()
		})
		.eq('id', inviteId);

	if (error) throw error;

	return { ok: true };
};

export const handleWorkspaceRemoveMemberRequest = async (
	body: WorkspaceRemoveMemberRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
	const projectId = requireString(body.projectId, 'projectId');
	const memberUserId = requireString(body.memberUserId, 'memberUserId');
	const project = await ensureOwnerProject(admin, projectId, userId);

	if (memberUserId === project.user_id) {
		throw new WorkspaceApiError(400, 'Use board deletion to remove the owner.');
	}

	const { error: userStateError } = await admin
		.from('project_user_state')
		.delete()
		.eq('project_id', projectId)
		.eq('user_id', memberUserId);
	if (userStateError) throw userStateError;

	const { error: aiSessionsError } = await admin
		.from('project_ai_sessions')
		.delete()
		.eq('project_id', projectId)
		.eq('user_id', memberUserId);
	if (aiSessionsError) throw aiSessionsError;

	const { error: membershipError } = await admin
		.from('project_memberships')
		.delete()
		.eq('project_id', projectId)
		.eq('user_id', memberUserId);
	if (membershipError) throw membershipError;

	return { ok: true };
};

export const handleWorkspaceLeaveProjectRequest = async (
	body: WorkspaceLeaveProjectRequest,
	authorization: string | undefined
) => {
	const userId = await getAuthenticatedUserId(authorization);
	const admin = createAdminSupabaseClient();
	const projectId = requireString(body.projectId, 'projectId');
	const membership = await ensureMembership(admin, projectId, userId);

	if (membership.role === 'owner') {
		throw new WorkspaceApiError(400, 'The owner cannot leave their own board.');
	}

	const { error: userStateError } = await admin
		.from('project_user_state')
		.delete()
		.eq('project_id', projectId)
		.eq('user_id', userId);
	if (userStateError) throw userStateError;

	const { error: aiSessionsError } = await admin
		.from('project_ai_sessions')
		.delete()
		.eq('project_id', projectId)
		.eq('user_id', userId);
	if (aiSessionsError) throw aiSessionsError;

	const { error: membershipError } = await admin
		.from('project_memberships')
		.delete()
		.eq('project_id', projectId)
		.eq('user_id', userId);
	if (membershipError) throw membershipError;

	return { ok: true };
};
