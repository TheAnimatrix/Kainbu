import type PocketBase from 'pocketbase';
import { pbNoAutoCancel } from './pbRequest.js';
import {
	mapAiSessionRecord,
	mapBoardRecord,
	mapColumnRecord,
	mapInviteRecord,
	mapMembershipRecord,
	mapPageRecord,
	mapProfileRecord,
	mapProjectRecord,
	mapTaskRecord,
	mapUserStateRecord,
	pbEscapeFilter
} from './pbRecords.js';
import { getAvatarUrlFromClient } from './avatarUrl.js';
import { DEFAULT_AI_SESSION_TITLE, DEFAULT_CHAT_HISTORY } from './constants.js';
import { DEFAULT_AI_MODEL_ID } from './models.js';
import { normalizeBoardPreferences } from './boardPreferences.js';
import { normalizeNullableBackgroundTheme } from './backgrounds.js';
import { normalizeChatHistory } from './chatNormalization.js';
import { normalizeProjectStructure } from './projectStructure.js';
import { normalizeScratchpadData } from './scratchpad.js';
import { normalizeUsernameValue } from './usernames.js';
import { normalizeDueTimestamp } from './timing.js';
import { fetchSharedMemberProfiles } from './memberProfiles.js';
import { mapMembershipRow, mapInviteRow, compareProjects, findProjectName } from './workspaceMapping.js';
import type {
	Project,
	ProjectAiSession,
	ProjectAiSessionRow,
	ProjectColumnRow,
	ProjectMembership,
	ProjectBoardRow as ProjectBoardRowLocal,
	ProjectInvite,
	ProjectPageRow,
	ProjectRow,
	ProjectTaskRow,
	Tag
} from './types.js';

export type LoadWorkspaceOptions = {
	authEmail?: string;
};

const DEFAULT_COLUMN_WIDTH = 240;

const normalizeAiModelId = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_AI_MODEL_ID;

const normalizeTags = (value: unknown): Tag[] =>
	Array.isArray(value)
		? value.flatMap((tag) =>
				tag &&
				typeof tag === 'object' &&
				typeof (tag as Tag).id === 'string' &&
				typeof (tag as Tag).label === 'string' &&
				typeof (tag as Tag).color === 'string'
					? [{ id: (tag as Tag).id, label: (tag as Tag).label, color: (tag as Tag).color }]
					: []
			)
		: [];

const normalizeLinkedTaskIds = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
		)
	];
};

const mapTaskRow = (row: ProjectTaskRow) => ({
	id: row.id,
	title: row.title,
	description: row.description,
	color: row.color || undefined,
	tags: normalizeTags(row.tags),
	hasCheckbox: row.has_checkbox,
	checked: row.checked,
	completedAt: row.completed_at ?? undefined,
	countdownAt: normalizeDueTimestamp(row.countdown_at),
	alarmAt: normalizeDueTimestamp(row.alarm_at),
	assignedTo: row.assigned_to ?? undefined,
	linkedTaskIds: normalizeLinkedTaskIds(row.linked_task_ids),
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

const buildKanbanData = (columns: ProjectColumnRow[], tasks: ProjectTaskRow[]) => {
	const tasksByColumn = new Map<string, ReturnType<typeof mapTaskRow>[]>();

	for (const row of [...tasks].sort((left, right) => left.position - right.position)) {
		const current = tasksByColumn.get(row.column_id) || [];
		current.push(mapTaskRow(row));
		tasksByColumn.set(row.column_id, current);
	}

	return [...columns]
		.sort((left, right) => left.position - right.position)
		.map((row) => ({
			id: row.id,
			title: row.title,
			color: row.color || undefined,
			width: row.width || DEFAULT_COLUMN_WIDTH,
			tasks: tasksByColumn.get(row.id) || []
		}));
};

const mapBoardRow = (
	row: ProjectBoardRowLocal,
	columns: ProjectColumnRow[],
	tasks: ProjectTaskRow[]
) => ({
	id: row.id,
	projectId: row.project_id,
	name: row.name,
	position: row.position,
	kanbanData: buildKanbanData(columns, tasks),
	preferences: normalizeBoardPreferences(row.preferences),
	shareSlug: row.share_slug ?? null,
	sharePublic: row.share_public === true,
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

const mapPageRow = (row: ProjectPageRow) => ({
	id: row.id,
	projectId: row.project_id,
	name: row.name,
	content: row.content || '',
	position: row.position,
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

const mapAiSessionRow = (row: ProjectAiSessionRow): ProjectAiSession => ({
	id: row.id,
	projectId: row.project_id,
	title: row.title?.trim() || DEFAULT_AI_SESSION_TITLE,
	modelId: normalizeAiModelId(row.model_id),
	history: normalizeChatHistory(row.history),
	contextSummary: row.context_summary ?? undefined,
	summarizedUpToMessageId: row.summarized_up_to_message_id ?? null,
	...(typeof row.context_tokens === 'number' ? { contextTokens: row.context_tokens } : {}),
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime(),
	lastMessageAt: new Date(row.last_message_at).getTime()
});

const listByProjectIds = async (
	pb: PocketBase,
	collection: string,
	clientIds: string[],
	sort?: string
): Promise<Array<Record<string, unknown>>> => {
	if (clientIds.length === 0) return [];
	return pb.collection(collection).getFullList<Record<string, unknown>>({
		filter: `project.client_id = "${clientIds.map((id) => pbEscapeFilter(id)).join('" || project.client_id = "')}"`,
		...(sort ? { sort } : {}),
		...pbNoAutoCancel
	});
};

/**
 * Shared workspace loader. Used by both the web app (via `fetchWorkspace`
 * in `persistence.ts`, which calls this with the client-side PocketBase
 * client) and the server (via `handleWorkspaceSnapshot`, which calls this
 * with the admin PocketBase client and the user's email read from PB).
 */
export const loadWorkspaceFromPb = async (
	pb: PocketBase,
	userId: string,
	options: LoadWorkspaceOptions = {}
) => {
	const authEmail = (options.authEmail || '').trim().toLowerCase();

	const ownMembershipRecords = await pb
		.collection('project_memberships')
		.getFullList<Record<string, unknown>>({
			filter: `user = "${pbEscapeFilter(userId)}"`,
			sort: '-last_opened_at',
			expand: 'project',
			...pbNoAutoCancel
		});

	const projectClientByPbId = new Map<string, string>();
	for (const record of ownMembershipRecords) {
		const expanded = (record.expand as { project?: { client_id?: string } })?.project;
		if (expanded?.client_id) {
			projectClientByPbId.set(String(record.project), String(expanded.client_id));
		}
	}

	const missingProjectPbIds = [
		...new Set(
			ownMembershipRecords
				.map((record) => String(record.project))
				.filter((projectPbId) => !projectClientByPbId.has(projectPbId))
		)
	];

	if (missingProjectPbIds.length) {
		const projectRecords = await pb.collection('projects').getFullList<Record<string, unknown>>({
			filter: missingProjectPbIds.map((id) => `id = "${pbEscapeFilter(id)}"`).join(' || '),
			...pbNoAutoCancel
		});
		for (const record of projectRecords) {
			projectClientByPbId.set(String(record.id), String(record.client_id || record.id));
		}
	}

	const ownMembershipRows = ownMembershipRecords.map((record) => {
		const projectClientId =
			projectClientByPbId.get(String(record.project)) || String(record.project);
		return mapMembershipRecord(record, projectClientId);
	});

	const accessibleProjectIds = ownMembershipRows.map((membership) => membership.project_id);

	const [
		projectRecords,
		allMembershipRecords,
		boardRecords,
		pageRecords,
		columnRecords,
		taskRecords,
		userStateRecords,
		aiSessionRecords,
		incomingInviteRecords
	] = await Promise.all([
		accessibleProjectIds.length
			? pb.collection('projects').getFullList<Record<string, unknown>>({
					filter: accessibleProjectIds
						.map((id) => `client_id = "${pbEscapeFilter(id)}"`)
						.join(' || '),
					...pbNoAutoCancel
				})
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds(pb, 'project_memberships', accessibleProjectIds)
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds(pb, 'project_boards', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds(pb, 'project_pages', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds(pb, 'project_columns', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds(pb, 'project_tasks', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? pb.collection('project_user_state').getFullList<Record<string, unknown>>({
					filter: `user = "${pbEscapeFilter(userId)}" && (${accessibleProjectIds
						.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
						.join(' || ')})`,
					expand: 'project',
					...pbNoAutoCancel
				})
			: Promise.resolve([]),
		accessibleProjectIds.length
			? pb.collection('project_ai_sessions').getFullList<Record<string, unknown>>({
					filter: `user = "${pbEscapeFilter(userId)}" && (${accessibleProjectIds
						.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
						.join(' || ')})`,
					sort: '-last_message_at',
					expand: 'project',
					...pbNoAutoCancel
				})
			: Promise.resolve([]),
		pb.collection('project_invites').getFullList<Record<string, unknown>>({
			filter: authEmail
				? `(invitee = "${pbEscapeFilter(userId)}" || invitee_email = "${pbEscapeFilter(authEmail)}") && status = "pending"`
				: `invitee = "${pbEscapeFilter(userId)}" && status = "pending"`,
			expand: 'project',
			...pbNoAutoCancel
		})
	]);

	for (const record of projectRecords) {
		projectClientByPbId.set(String(record.id), String(record.client_id || record.id));
	}

	const projectRows: ProjectRow[] = projectRecords.map((record) => mapProjectRecord(record));
	const allMembershipRows = allMembershipRecords.map((record) => {
		const projectPbId = String(record.project);
		const projectClientId = projectClientByPbId.get(projectPbId) || projectPbId;
		return mapMembershipRecord(record, projectClientId);
	});
	const boardRows = boardRecords.map((record) => {
		const projectPbId = String(record.project);
		const projectClientId = projectClientByPbId.get(projectPbId) || projectPbId;
		return mapBoardRecord(record, projectClientId);
	});
	const boardClientIdByPbId = new Map(
		boardRecords.map((record) => [String(record.id), String(record.client_id || record.id)])
	);
	const pageRows = pageRecords.map((record) => {
		const projectPbId = String(record.project);
		const projectClientId = projectClientByPbId.get(projectPbId) || projectPbId;
		return mapPageRecord(record, projectClientId);
	});
	const columnRows = columnRecords.map((record) => {
		const projectPbId = String(record.project);
		const projectClientId = projectClientByPbId.get(projectPbId) || projectPbId;
		const boardClientId = boardClientIdByPbId.get(String(record.board || '')) || '';
		return mapColumnRecord(record, projectClientId, boardClientId);
	});
	const taskRows = taskRecords.map((record) => {
		const projectPbId = String(record.project);
		const projectClientId = projectClientByPbId.get(projectPbId) || projectPbId;
		const boardClientId = boardClientIdByPbId.get(String(record.board || '')) || '';
		return mapTaskRecord(record, projectClientId, boardClientId);
	});
	const userStateRows = userStateRecords.map((record) => {
		const projectClientId = String(
			(record.expand as { project?: { client_id?: string } })?.project?.client_id || record.project
		);
		return mapUserStateRecord(record, projectClientId);
	});
	const aiSessionRows: ProjectAiSessionRow[] = aiSessionRecords.map((record) => {
		const projectClientId = String(
			(record.expand as { project?: { client_id?: string } })?.project?.client_id || record.project
		);
		return mapAiSessionRecord(record, projectClientId);
	});

	const ownedProjectIds = projectRows
		.filter((project) => project.user_id === userId)
		.map((project) => project.id);

	const ownerInviteRecords = ownedProjectIds.length
		? await pb.collection('project_invites').getFullList<Record<string, unknown>>({
				filter: `status = "pending" && (${ownedProjectIds
					.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
					.join(' || ')})`,
				expand: 'project',
				...pbNoAutoCancel
			})
		: [];

	const profileIds = [...new Set(allMembershipRows.map((membership) => membership.user_id))];
	const profileRows: Array<{
		user_id: string;
		email: string | null;
		username: string | null;
		avatar_url: string | null;
	}> = [];
	if (profileIds.length) {
		let profiles: Array<Record<string, unknown>> = [];
		try {
			profiles = await pb.collection('users').getFullList<Record<string, unknown>>({
				filter: profileIds.map((id) => `id = "${pbEscapeFilter(id)}"`).join(' || '),
				...pbNoAutoCancel
			});
		} catch {
			profiles = [];
		}
		for (const profile of profiles) {
			const profileId = String(profile.id);
			const avatarUrl = getAvatarUrlFromClient(
				pb as never,
				{
					id: profileId,
					avatar: profile.avatar as string | null
				},
				null
			);
			const mapped = mapProfileRecord(profile, profileId, avatarUrl);
			profileRows.push({
				user_id: mapped.user_id,
				email: mapped.email,
				username: mapped.username,
				avatar_url: avatarUrl
			});
		}
		const resolvedProfileIds = new Set(profileRows.map((profile) => profile.user_id));
		const missingProfileIds = profileIds.filter((id) => !resolvedProfileIds.has(id));
		if (missingProfileIds.length) {
			try {
				const sharedProfiles = await fetchSharedMemberProfiles(missingProfileIds);
				for (const profile of sharedProfiles) {
					profileRows.push({
						user_id: profile.user_id,
						email: profile.email,
						username: profile.username,
						avatar_url: profile.avatar_url ?? null
					});
				}
			} catch {
				// Member names are a display enhancement; keep workspace fetch usable if API is offline.
			}
		}

		try {
			const selfRecord = await pb.collection('users').getOne<Record<string, unknown>>(userId, {
				fields: 'id,email,username,avatar'
			});
			const selfId = String(selfRecord.id || userId);
			const selfAvatarUrl = getAvatarUrlFromClient(
				pb as never,
				{
					id: selfId,
					avatar: selfRecord.avatar as string | null
				},
				null
			);
			const selfProfile = profileRows.find((row) => row.user_id === userId);
			if (selfProfile) {
				selfProfile.avatar_url = selfAvatarUrl ?? selfProfile.avatar_url;
			} else {
				profileRows.push({
					user_id: userId,
					email: typeof selfRecord.email === 'string' ? selfRecord.email : null,
					username: normalizeUsernameValue(
						selfRecord.username as string | null | undefined
					),
					avatar_url: selfAvatarUrl
				});
			}
		} catch {
			// Keep workspace usable if the self profile read fails.
		}
	}

	const profileIdentityById = new Map(
		profileRows.map((profile) => [
			profile.user_id,
			{
				email: profile.email || undefined,
				username: normalizeUsernameValue(profile.username),
				avatarUrl: profile.avatar_url ?? null
			}
		])
	);
	const ownMembershipByProjectId = new Map(
		ownMembershipRows.map((membership) => [membership.project_id, membership])
	);
	const membershipsByProjectId = new Map<string, ProjectMembership[]>();

	for (const row of allMembershipRows) {
		const current = membershipsByProjectId.get(row.project_id) || [];
		const profileIdentity = profileIdentityById.get(row.user_id);
		current.push(
			mapMembershipRow(
				row,
				profileIdentity?.email,
				profileIdentity?.username || null,
				profileIdentity?.avatarUrl,
				userId
			)
		);
		membershipsByProjectId.set(row.project_id, current);
	}

	const columnsByProjectId = new Map<string, ProjectColumnRow[]>();
	for (const row of columnRows) {
		const current = columnsByProjectId.get(row.project_id) || [];
		current.push(row);
		columnsByProjectId.set(row.project_id, current);
	}

	const boardsByProjectId = new Map<string, ProjectBoardRowLocal[]>();
	for (const row of boardRows) {
		const current = boardsByProjectId.get(row.project_id) || [];
		current.push(row);
		boardsByProjectId.set(row.project_id, current);
	}

	const pagesByProjectId = new Map<string, ProjectPageRow[]>();
	for (const row of pageRows) {
		const current = pagesByProjectId.get(row.project_id) || [];
		current.push(row);
		pagesByProjectId.set(row.project_id, current);
	}

	const tasksByProjectId = new Map<string, ProjectTaskRow[]>();
	for (const row of taskRows) {
		const current = tasksByProjectId.get(row.project_id) || [];
		current.push(row);
		tasksByProjectId.set(row.project_id, current);
	}

	const userStateByProjectId = new Map(
		userStateRows.map((row) => [
			row.project_id,
			{
				activeAiSessionId: row.active_ai_session_id || undefined,
				updatedAt: new Date(row.updated_at).getTime()
			}
		])
	);

	const aiSessionsByProjectId = new Map<string, ProjectAiSession[]>();
	for (const row of aiSessionRows) {
		const current = aiSessionsByProjectId.get(row.project_id) || [];
		current.push(mapAiSessionRow(row));
		aiSessionsByProjectId.set(row.project_id, current);
	}

	const ownerInvitesByProjectId = new Map<string, ProjectInvite[]>();
	for (const record of ownerInviteRecords) {
		const projectClientId = String(
			(record.expand as { project?: { client_id?: string } })?.project?.client_id || record.project
		);
		const row = mapInviteRecord(record, projectClientId);
		const current = ownerInvitesByProjectId.get(row.project_id) || [];
		current.push(mapInviteRow(row, findProjectName(projectRows, row.project_id)));
		ownerInvitesByProjectId.set(row.project_id, current);
	}

	const projects: Project[] = projectRows
		.flatMap((row) => {
			const ownMembership = ownMembershipByProjectId.get(row.id);
			if (!ownMembership) return [];

			const userState = userStateByProjectId.get(row.id);
			const projectBoards = (boardsByProjectId.get(row.id) || []).sort(
				(left, right) =>
					left.position - right.position || left.created_at.localeCompare(right.created_at)
			);
			const fallbackBoard = projectBoards[0]?.id || '';
			const boards = projectBoards.length
				? projectBoards.map((boardRow) =>
						mapBoardRow(
							boardRow,
							(columnsByProjectId.get(row.id) || []).filter(
								(columnRow) => (columnRow.board_id || fallbackBoard) === boardRow.id
							),
							(tasksByProjectId.get(row.id) || []).filter(
								(taskRow) => (taskRow.board_id || fallbackBoard) === boardRow.id
							)
						)
					)
				: [];
			const pages = (pagesByProjectId.get(row.id) || []).map((page) => mapPageRow(page));
			const aiSessions = aiSessionsByProjectId.get(row.id) || [];
			const normalizedProject = normalizeProjectStructure({
				id: row.id,
				ownerUserId: row.user_id,
				accessRole: ownMembership.role,
				name: row.name,
				backgroundTheme: normalizeNullableBackgroundTheme(row.background_theme),
				boards,
				pages,
				activeBoardId: boards[0]?.id || '',
				activePageId: pages[0]?.id || '',
				kanbanData: boards[0]?.kanbanData || [],
				scratchpadData: normalizeScratchpadData(pages[0]?.content || row.scratchpad_data),
				scratchpadRev: row.scratchpad_rev,
				aiSessions,
				activeAiSessionId: userState?.activeAiSessionId || aiSessions[0]?.id || '',
				chatHistory: structuredClone(DEFAULT_CHAT_HISTORY),
				members: (membershipsByProjectId.get(row.id) || []).sort(
					(left, right) => right.lastOpenedAt - left.lastOpenedAt
				),
				invites: (ownerInvitesByProjectId.get(row.id) || []).sort(
					(left, right) => right.createdAt - left.createdAt
				),
				createdAt: new Date(row.created_at).getTime(),
				updatedAt: new Date(row.updated_at).getTime(),
				viewerLastOpenedAt: new Date(ownMembership.last_opened_at).getTime(),
				viewerPinnedAt: ownMembership.pinned_at
					? new Date(ownMembership.pinned_at).getTime()
					: undefined
			});
			return [normalizedProject];
		})
		.sort(compareProjects);

	const incomingInvites = incomingInviteRecords
		.map((record) => {
			const projectClientId = String(
				(record.expand as { project?: { client_id?: string; name?: string } })?.project
					?.client_id || record.project
			);
			const projectName =
				(record.expand as { project?: { name?: string } })?.project?.name || undefined;
			return mapInviteRow(mapInviteRecord(record, projectClientId), projectName);
		})
		.sort((left, right) => right.createdAt - left.createdAt);

	return { projects, incomingInvites };
};
