import { isPocketBaseRecordId } from '$lib/kainbu/recordIds';
import { normalizeDueTimestamp } from '$lib/kainbu/timing';
import type {
	ProfileRow,
	ProjectAiSessionRow,
	ProjectBoardRow,
	ProjectColumnRow,
	ProjectInviteRow,
	ProjectMembershipRow,
	ProjectPageRow,
	ProjectRow,
	ProjectTaskRow,
	ProjectUserStateRow
} from '$lib/kainbu/types';

type PbRecord = Record<string, unknown>;

const relationId = (value: unknown) => {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && typeof (value as PbRecord).id === 'string') {
		return (value as PbRecord).id as string;
	}
	return '';
};

const iso = (value: unknown, fallback = new Date().toISOString()) => {
	if (typeof value === 'string' && value.trim()) return value;
	return fallback;
};

export const pbEscapeFilter = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const projectClientFilter = (clientId: string) =>
	`client_id = "${pbEscapeFilter(clientId)}"`;

export const projectRecordFilter = (projectClientId: string) =>
	`project.client_id = "${pbEscapeFilter(projectClientId)}"`;

export const projectRelationFilter = (projectPbId: string) => `project = "${pbEscapeFilter(projectPbId)}"`;

export const compositeClientFilter = (projectClientId: string, clientId: string) =>
	`project.client_id = "${pbEscapeFilter(projectClientId)}" && client_id = "${pbEscapeFilter(clientId)}"`;

export const mapProjectRecord = (record: PbRecord): ProjectRow & { _pbId: string } => ({
	_pbId: String(record.id),
	id: String(record.client_id || record.id),
	user_id: relationId(record.owner),
	name: String(record.name || ''),
	background_theme: (record.background_theme as ProjectRow['background_theme']) ?? null,
	scratchpad_data: String(record.scratchpad_data || ''),
	scratchpad_rev: typeof record.scratchpad_rev === 'number' ? record.scratchpad_rev : 0,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapMembershipRecord = (
	record: PbRecord,
	projectClientId: string
): ProjectMembershipRow => ({
	project_id: projectClientId,
	user_id: relationId(record.user),
	role: record.role === 'owner' ? 'owner' : 'member',
	joined_at: iso(record.joined_at, iso(record.created)),
	last_opened_at: iso(record.last_opened_at, iso(record.created)),
	pinned_at: record.pinned_at ? iso(record.pinned_at) : null,
	viewing_board_client_id:
		typeof record.viewing_board_client_id === 'string' && record.viewing_board_client_id.trim()
			? record.viewing_board_client_id.trim()
			: null,
	presence_at: record.presence_at ? iso(record.presence_at) : null,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapInviteRecord = (record: PbRecord, projectClientId: string): ProjectInviteRow => ({
	id: String(record.id),
	project_id: projectClientId,
	invitee_user_id: relationId(record.invitee),
	invitee_email: String(record.invitee_email || ''),
	invited_by_user_id: relationId(record.invited_by),
	status:
		record.status === 'accepted' ||
		record.status === 'rejected' ||
		record.status === 'cancelled'
			? record.status
			: 'pending',
	created_at: iso(record.created),
	updated_at: iso(record.updated),
	responded_at: record.responded_at ? iso(record.responded_at) : null
});

export const mapBoardRecord = (record: PbRecord, projectClientId: string): ProjectBoardRow => ({
	id: String(record.client_id || record.id),
	project_id: projectClientId,
	name: String(record.name || ''),
	position: typeof record.position === 'number' ? record.position : 0,
	preferences:
		record.preferences && typeof record.preferences === 'object'
			? (record.preferences as ProjectBoardRow['preferences'])
			: null,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapPageRecord = (record: PbRecord, projectClientId: string): ProjectPageRow => ({
	id: String(record.client_id || record.id),
	project_id: projectClientId,
	name: String(record.name || ''),
	content: String(record.content || ''),
	position: typeof record.position === 'number' ? record.position : 0,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapColumnRecord = (
	record: PbRecord,
	projectClientId: string,
	boardClientId?: string | null
): ProjectColumnRow => ({
	project_id: projectClientId,
	board_id: boardClientId ?? null,
	id: String(record.client_id || record.id),
	title: String(record.title || ''),
	color: typeof record.color === 'string' ? record.color : null,
	width: typeof record.width === 'number' ? record.width : 268,
	position: typeof record.position === 'number' ? record.position : 0,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapTaskRecord = (
	record: PbRecord,
	projectClientId: string,
	boardClientId?: string | null
): ProjectTaskRow => ({
	project_id: projectClientId,
	board_id: boardClientId ?? null,
	id: String(record.client_id || record.id),
	column_id: String(record.column_id || ''),
	title: String(record.title || ''),
	description: String(record.description || ''),
	color: typeof record.color === 'string' ? record.color : null,
	tags: Array.isArray(record.tags) ? (record.tags as ProjectTaskRow['tags']) : [],
	has_checkbox: Boolean(record.has_checkbox),
	checked: Boolean(record.checked),
	completed_at: typeof record.completed_at === 'number' ? record.completed_at : null,
	countdown_at: normalizeDueTimestamp(record.countdown_at) ?? null,
	alarm_at: normalizeDueTimestamp(record.alarm_at) ?? null,
	assigned_to: (() => {
		const id = record.assigned_to ? relationId(record.assigned_to) : '';
		return id && isPocketBaseRecordId(id) ? id : null;
	})(),
	linked_task_ids: Array.isArray(record.linked_task_ids)
		? (record.linked_task_ids as string[])
		: null,
	position: typeof record.position === 'number' ? record.position : 0,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapUserStateRecord = (
	record: PbRecord,
	projectClientId: string
): ProjectUserStateRow => ({
	project_id: projectClientId,
	user_id: relationId(record.user),
	active_ai_session_id:
		typeof record.active_ai_session_id === 'string' ? record.active_ai_session_id : null,
	chat_history: Array.isArray(record.chat_history) ? record.chat_history : [],
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const mapAiSessionRecord = (
	record: PbRecord,
	projectClientId: string
): ProjectAiSessionRow => ({
	id: String(record.client_id || record.id),
	project_id: projectClientId,
	user_id: relationId(record.user),
	title: String(record.title || ''),
	model_id: String(record.model_id || ''),
	history: Array.isArray(record.history) ? record.history : [],
	context_summary: record.context_summary ?? null,
	summarized_up_to_message_id:
		typeof record.summarized_up_to_message_id === 'string'
			? record.summarized_up_to_message_id
			: null,
	context_tokens: typeof record.context_tokens === 'number' ? record.context_tokens : null,
	created_at: iso(record.created),
	updated_at: iso(record.updated),
	last_message_at: iso(record.last_message_at, iso(record.updated))
});

export const mapProfileRecord = (
	record: PbRecord,
	userId: string,
	avatarUrl: string | null = null
): ProfileRow => ({
	user_id: userId,
	email: typeof record.email === 'string' ? record.email : null,
	username: typeof record.username === 'string' ? record.username : null,
	avatar_url: avatarUrl,
	default_show_checkbox:
		typeof record.default_show_checkbox === 'boolean' ? record.default_show_checkbox : true,
	preferred_ai_model_id:
		typeof record.preferred_ai_model_id === 'string' ? record.preferred_ai_model_id : null,
	preferred_model_preset:
		record.preferred_model_preset === 'smart' ? 'smart' : 'fast',
	background_theme: (record.background_theme as ProfileRow['background_theme']) ?? null,
	color_mode:
		record.color_mode === 'light' || record.color_mode === 'dark' ? record.color_mode : null,
	created_at: iso(record.created),
	updated_at: iso(record.updated)
});

export const resolveProjectRef = async (
	pb: import('pocketbase').default,
	projectRef: string
) => {
	try {
		const byClient = await pb
			.collection('projects')
			.getFirstListItem(projectClientFilter(projectRef));
		return {
			pbId: String(byClient.id),
			clientId: String(byClient.client_id || byClient.id)
		};
	} catch {
		const byId = await pb.collection('projects').getOne(projectRef);
		return {
			pbId: String(byId.id),
			clientId: String(byId.client_id || byId.id)
		};
	}
};
