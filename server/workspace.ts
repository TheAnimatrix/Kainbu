import type PocketBase from 'pocketbase';
import type { BackgroundTheme, Project } from '../src/lib/kainbu/types.js';
import { formatPocketBaseError } from '../src/lib/pocketbaseErrors.js';
import { sendProjectInviteEmail } from './mailDelivery.js';
import { createAdminPb, resolveAuthenticatedUserId } from './pocketbase.js';
import { ClientResponseError } from 'pocketbase';
import { syncBoardWithPb } from '../src/lib/kainbu/boardSyncCore.js';
import { createId } from '../src/lib/kainbu/id.js';
import { EMPTY_PROJECT } from '../src/lib/kainbu/constants.js';
import { normalizeBoardPreferences } from '../src/lib/kainbu/boardPreferences.js';
import { normalizeProjectStructure } from '../src/lib/kainbu/projectStructure.js';
import { normalizeScratchpadData, serializeScratchpadData } from '../src/lib/kainbu/scratchpad.js';
import { runProjectInitialization } from '../src/lib/kainbu/projectCreationTransaction.js';
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
				// A legitimate invite acceptance/rejoin reactivates the historical row;
				// never create a duplicate membership for the same project/user.
				left_at: '',
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
			? admin.collection('project_memberships').update(membership.id, {
					left_at: new Date().toISOString(),
					last_opened_at: '',
					viewing_board_client_id: '',
					presence_at: '',
					pinned_at: ''
				})
			: Promise.resolve()
	]);

	return { ok: true };
};

export const handleWorkspaceLeaveProjectRequest = async (
	body: WorkspaceLeaveProjectRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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
		admin.collection('project_memberships').update(membership.id, {
			left_at: new Date().toISOString(),
			last_opened_at: '',
			viewing_board_client_id: '',
			presence_at: '',
			pinned_at: ''
		})
	]);

	return { ok: true };
};

export const handleWorkspaceMemberProfilesRequest = async (
	body: WorkspaceMemberProfilesRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
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

// ---------------------------------------------------------------------------
// Board / page / project write handlers.
//
// These exist so the CLI (which authenticates with an API key and has no
// PocketBase session) can perform every workspace write through the HTTP API.
// They run the same kanban-diff logic as the web app via `syncBoardWithPb`,
// and enforce project membership before touching any record.
// ---------------------------------------------------------------------------

type KanbanData = Project['kanbanData'];

type WorkspaceBoardSyncRequest = {
	projectId: string;
	boardId: string;
	previous: KanbanData;
	next: KanbanData;
};

type WorkspaceBoardCreateRequest = {
	projectId: string;
	name: string;
	position?: number;
};

type WorkspaceBoardMutateRequest = {
	projectId: string;
	boardId: string;
	name?: string;
};

type WorkspacePageCreateRequest = {
	projectId: string;
	name: string;
	position?: number;
	content?: string;
};

type WorkspacePageMutateRequest = {
	projectId: string;
	pageId: string;
	name?: string;
	content?: string;
};

type WorkspaceProjectCreateRequest = {
	name?: string;
	/** Browser callers may provide stable client IDs (for restore/import). */
	seedProject?: Partial<Project>;
};

type WorkspaceProjectRenameRequest = {
	projectId: string;
	name: string;
};

const isKanbanColumn = (value: unknown): value is KanbanData[number] =>
	isRecord(value) && typeof value.id === 'string' && Array.isArray((value as { tasks?: unknown }).tasks);

const isFiniteOptionalNumber = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value));
const isOptionalString = (value: unknown, max: number) => value === undefined || (typeof value === 'string' && value.length <= max);

const requireKanbanData = (value: unknown, field: string): KanbanData => {
	if (!Array.isArray(value) || value.length > 100 || !value.every(isKanbanColumn)) {
		throw new WorkspaceApiError(400, `${field} must be an array of at most 100 board columns.`);
	}
	let taskCount = 0;
	for (const [columnIndex, column] of value.entries()) {
		if (
			column.id.length === 0 || column.id.length > 128 ||
			typeof column.title !== 'string' || column.title.length > 500 ||
			!isOptionalString(column.color, 128) ||
			(column.width !== undefined && (typeof column.width !== 'number' || !Number.isFinite(column.width) || column.width < 0))
		) {
			throw new WorkspaceApiError(400, `${field}[${columnIndex}] has invalid fields.`);
		}
		if (column.tasks.length > 1000) throw new WorkspaceApiError(413, `${field}[${columnIndex}] has too many tasks.`);
		taskCount += column.tasks.length;
		for (const [taskIndex, task] of column.tasks.entries()) {
			if (!isRecord(task) || typeof task.id !== 'string' || task.id.length === 0 || task.id.length > 128 || typeof task.title !== 'string' || task.title.length > 1000) {
				throw new WorkspaceApiError(400, `${field}[${columnIndex}].tasks[${taskIndex}] is malformed.`);
			}
			if (typeof task.description === 'string' && task.description.length > 100_000) {
				throw new WorkspaceApiError(413, `${field}[${columnIndex}].tasks[${taskIndex}].description is too large.`);
			}
			if (!isOptionalString(task.color, 128) || !isOptionalString(task.assignedTo, 128) ||
				(task.hasCheckbox !== undefined && typeof task.hasCheckbox !== 'boolean') ||
				(task.checked !== undefined && typeof task.checked !== 'boolean') ||
				!isFiniteOptionalNumber(task.createdAt) || !isFiniteOptionalNumber(task.updatedAt) ||
				!isFiniteOptionalNumber(task.completedAt) || !isFiniteOptionalNumber(task.countdownAt) ||
				!isFiniteOptionalNumber(task.alarmAt)) {
				throw new WorkspaceApiError(400, `${field}[${columnIndex}].tasks[${taskIndex}] has invalid fields.`);
			}
			if (!Array.isArray(task.tags) || task.tags.length > 50 || task.tags.some((tag) =>
				!isRecord(tag) || typeof tag.id !== 'string' || tag.id.length === 0 || tag.id.length > 128 ||
				typeof tag.label !== 'string' || tag.label.length > 200 || typeof tag.color !== 'string' || tag.color.length > 128
			)) {
				throw new WorkspaceApiError(400, `${field}[${columnIndex}].tasks[${taskIndex}].tags is invalid.`);
			}
			if (task.linkedTaskIds !== undefined && (!Array.isArray(task.linkedTaskIds) || task.linkedTaskIds.length > 100 || task.linkedTaskIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128))) {
				throw new WorkspaceApiError(400, `${field}[${columnIndex}].tasks[${taskIndex}].linkedTaskIds is invalid.`);
			}
		}
	}
	if (taskCount > 10_000) throw new WorkspaceApiError(413, `${field} contains too many tasks.`);
	return value as KanbanData;
};

const sanitizeProjectPageContent = (content: unknown) => {
	if (typeof content !== 'string') return '';
	return content.replace(/\0/g, '').slice(0, 500_000);
};

/** Find a project child (board/page/…) by its app-level client_id, scoped to the project. */
const findProjectChildByClientId = async (
	admin: PocketBase,
	collection: string,
	projectPbId: string,
	clientId: string
) => {
	try {
		return await admin
			.collection(collection)
			.getFirstListItem(
				`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(clientId)}"`
			);
	} catch {
		return null;
	}
};

export const handleWorkspaceBoardSyncRequest = async (
	body: WorkspaceBoardSyncRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const boardId = requireString(body.boardId, 'boardId');
	const previous = requireKanbanData(body.previous, 'previous');
	const next = requireKanbanData(body.next, 'next');

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const board = await findProjectChildByClientId(admin, 'project_boards', projectPbId, boardId);
	if (!board) {
		throw new WorkspaceApiError(404, 'Board not found.');
	}

	await syncBoardWithPb(admin, projectId, boardId, previous, next);
	return { ok: true };
};

export const handleWorkspaceBoardCreateRequest = async (
	body: WorkspaceBoardCreateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const name = requireString(body.name, 'name');
	const position =
		typeof body.position === 'number' && Number.isFinite(body.position) ? body.position : 0;

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const clientId = createId();
	const record = await admin.collection('project_boards').create({
		project: projectPbId,
		client_id: clientId,
		name,
		position,
		preferences: normalizeBoardPreferences(undefined)
	});

	return { ok: true, id: clientId, name: String(record.name || name) };
};

export const handleWorkspaceBoardRenameRequest = async (
	body: WorkspaceBoardMutateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const boardId = requireString(body.boardId, 'boardId');
	const name = requireString(body.name, 'name');

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const board = await findProjectChildByClientId(admin, 'project_boards', projectPbId, boardId);
	if (!board) throw new WorkspaceApiError(404, 'Board not found.');

	await admin.collection('project_boards').update(board.id, { name });
	return { ok: true, id: boardId, name };
};

export const handleWorkspaceBoardDeleteRequest = async (
	body: WorkspaceBoardMutateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const boardId = requireString(body.boardId, 'boardId');

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const board = await findProjectChildByClientId(admin, 'project_boards', projectPbId, boardId);
	if (!board) return { ok: true };

	await admin.collection('project_boards').delete(board.id);
	return { ok: true };
};

export const handleWorkspacePageCreateRequest = async (
	body: WorkspacePageCreateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const name = requireString(body.name, 'name');
	const position =
		typeof body.position === 'number' && Number.isFinite(body.position) ? body.position : 0;

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const clientId = createId();
	const record = await admin.collection('project_pages').create({
		project: projectPbId,
		client_id: clientId,
		name,
		content: sanitizeProjectPageContent(body.content ?? ''),
		position
	});

	return { ok: true, id: clientId, name: String(record.name || name) };
};

export const handleWorkspacePageRenameRequest = async (
	body: WorkspacePageMutateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const pageId = requireString(body.pageId, 'pageId');
	const name = requireString(body.name, 'name');

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const page = await findProjectChildByClientId(admin, 'project_pages', projectPbId, pageId);
	if (!page) throw new WorkspaceApiError(404, 'Page not found.');

	await admin.collection('project_pages').update(page.id, { name });
	return { ok: true, id: pageId, name };
};

export const handleWorkspacePageContentRequest = async (
	body: WorkspacePageMutateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const pageId = requireString(body.pageId, 'pageId');
	if (typeof body.content !== 'string') {
		throw new WorkspaceApiError(400, 'content is required.');
	}

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const page = await findProjectChildByClientId(admin, 'project_pages', projectPbId, pageId);
	if (!page) throw new WorkspaceApiError(404, 'Page not found.');

	await admin.collection('project_pages').update(page.id, {
		content: sanitizeProjectPageContent(body.content)
	});
	return { ok: true };
};

export const handleWorkspacePageDeleteRequest = async (
	body: WorkspacePageMutateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const pageId = requireString(body.pageId, 'pageId');

	await ensureMembership(admin, projectId, userId);

	const projectPbId = await getProjectPbId(admin, projectId);
	const page = await findProjectChildByClientId(admin, 'project_pages', projectPbId, pageId);
	if (!page) return { ok: true };

	await admin.collection('project_pages').delete(page.id);
	return { ok: true };
};

export const handleWorkspaceScratchpadGetRequest = async (
	projectId: string | undefined,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const id = requireString(projectId, 'projectId');

	await ensureMembership(admin, id, userId);

	const project = await getProjectOrThrow(admin, id);
	return {
		id: project.id,
		name: project.name,
		scratchpadData: normalizeScratchpadData(project.scratchpad_data),
		scratchpadRev: project.scratchpad_rev
	};
};

export const handleWorkspaceProjectRenameRequest = async (
	body: WorkspaceProjectRenameRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const projectId = requireString(body.projectId, 'projectId');
	const name = requireString(body.name, 'name');

	await ensureMembership(admin, projectId, userId);

	const project = await getProjectOrThrow(admin, projectId);
	await admin.collection('projects').update(project._pbId, { name });
	return { ok: true, id: projectId, name };
};

export const handleWorkspaceProjectCreateRequest = async (
	body: WorkspaceProjectCreateRequest,
	authorization: string | undefined
) => {
	const userId = (await resolveAuthenticatedUserId(authorization)).userId;
	const admin = await createAdminPb();
	const name =
		typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New Project';

	// The API is the authoritative create transaction. Preserve browser-provided
	// client IDs so restore/import callers can reconcile their local state with
	// the records created here, while still forcing ownership to the caller.
	const requestedSeed = isRecord(body.seedProject) ? body.seedProject : {};
	const seed = normalizeProjectStructure({
		...EMPTY_PROJECT(userId, name),
		...requestedSeed,
		id: typeof requestedSeed.id === 'string' && requestedSeed.id.trim() ? requestedSeed.id : createId(),
		name,
		ownerUserId: userId,
		accessRole: 'owner' as const
	} as Project);
	const now = new Date().toISOString();

	const projectRecord = await admin.collection('projects').create({
		client_id: seed.id,
		owner: userId,
		name: seed.name,
		background_theme: seed.backgroundTheme,
		scratchpad_data: serializeScratchpadData(seed.scratchpadData),
		scratchpad_rev: seed.scratchpadRev,
		last_opened_at: now
	});

	const rollback = async () => {
		const failures: unknown[] = [];
		for (const collection of ['project_tasks', 'project_columns', 'project_tags', 'project_pages', 'project_ai_sessions', 'project_user_state', 'project_boards', 'project_memberships']) {
			try {
				const records = await admin.collection(collection).getFullList({ filter: `project = "${pbEscapeFilter(projectRecord.id)}"` });
				for (const record of records) await admin.collection(collection).delete(record.id);
			} catch (error) { if (!(error instanceof ClientResponseError && error.status === 404)) failures.push(error); }
		}
		try { await admin.collection('projects').delete(projectRecord.id); } catch (error) {
			if (!(error instanceof ClientResponseError && error.status === 404)) failures.push(error);
		}
		if (failures.length) throw new AggregateError(failures, 'Project rollback failed');
	};

	const initialize = async () => {
		try {
			await admin.collection('project_memberships').create({
				project: projectRecord.id,
				user: userId,
				role: 'owner',
				joined_at: now,
				last_opened_at: now
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!/unique|validation_not_unique/i.test(message)) throw error;
		}

	for (const board of seed.boards) {
		await admin.collection('project_boards').create({
			project: projectRecord.id,
			client_id: board.id,
			name: board.name,
			position: board.position,
			preferences: normalizeBoardPreferences(board.preferences)
		});
	}

	for (const page of seed.pages) {
		await admin.collection('project_pages').create({
			project: projectRecord.id,
			client_id: page.id,
			name: page.name,
			content: sanitizeProjectPageContent(page.content),
			position: page.position
		});
	}

	for (const board of seed.boards) {
		await syncBoardWithPb(admin, seed.id, board.id, [], board.kanbanData);
	}

	const activeSession = seed.aiSessions[0];
	if (activeSession) {
		await admin.collection('project_ai_sessions').create({
			project: projectRecord.id,
			client_id: activeSession.id,
			user: userId,
			title: activeSession.title,
			model_id: activeSession.modelId,
			history: activeSession.history,
			last_message_at: new Date(activeSession.lastMessageAt).toISOString()
		});
		await admin.collection('project_user_state').create({
			project: projectRecord.id,
			user: userId,
			active_ai_session_id: activeSession.id,
			chat_history: []
		});
	}
	};

	await runProjectInitialization(initialize, rollback);

	return { ok: true, id: seed.id, name: seed.name, project: seed };
};
