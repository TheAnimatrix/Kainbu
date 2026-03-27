import { DEFAULT_CHAT_HISTORY, DEFAULT_COLUMN_WIDTH, EMPTY_PROJECT } from '$lib/kainbu/constants';
import { normalizeNullableBackgroundTheme } from '$lib/kainbu/backgrounds';
import { invokeWorkspaceApi } from '$lib/kainbu/api';
import { createId } from '$lib/kainbu/id';
import { normalizeScratchpadData, serializeScratchpadData } from '$lib/kainbu/scratchpad';
import { normalizeUserSettings } from '$lib/kainbu/settings';
import { supabase } from '$lib/supabaseClient';
import type {
	BackgroundTheme,
	ChatAttachment,
	ChatMessage,
	ChatTaskCard,
	ProfileRow,
	Project,
	ProjectColumnRow,
	ProjectInvite,
	ProjectInviteRow,
	ProjectMembership,
	ProjectMembershipRow,
	ProjectRow,
	ProjectTaskRow,
	ProjectUserStateRow,
	Tag,
	Task,
	UserSettings,
	WorkspaceAction
} from '$lib/kainbu/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const PROFILE_SETTINGS_COLUMNS =
	'user_id,email,default_show_checkbox,preferred_model_preset,preferred_chat_mode,background_theme';
const PROFILE_SETTINGS_COLUMNS_LEGACY =
	'user_id,email,default_show_checkbox,preferred_model_preset,preferred_chat_mode';

let profileBackgroundThemeSupported: boolean | null = null;
let projectTaskAssignmentsSupported: boolean | null = null;

const toNumber = (value: unknown) => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

const isMissingSchemaColumnError = (error: unknown, table: string, column: string) =>
	isObject(error) &&
	error.code === 'PGRST204' &&
	typeof error.message === 'string' &&
	error.message.includes(`'${column}'`) &&
	error.message.includes(`'${table}'`);

export const supportsProfileBackgroundTheme = () => profileBackgroundThemeSupported !== false;

const normalizeAttachments = (message: Record<string, unknown>): ChatAttachment[] => {
	if (Array.isArray(message.attachments)) {
		return message.attachments.flatMap((attachment) => {
			if (!isObject(attachment)) return [];
			if (attachment.kind !== 'image' && attachment.kind !== 'text') return [];
			if (
				typeof attachment.name !== 'string' ||
				typeof attachment.mimeType !== 'string' ||
				typeof attachment.content !== 'string'
			) {
				return [];
			}

			return [
				{
					id:
						typeof attachment.id === 'string' && attachment.id.trim() ? attachment.id : createId(),
					kind: attachment.kind,
					name: attachment.name,
					mimeType: attachment.mimeType,
					content: attachment.content
				}
			];
		});
	}

	if (Array.isArray(message.images)) {
		return message.images.flatMap((image, index) =>
			typeof image === 'string'
				? [
						{
							id: createId(),
							kind: 'image',
							name: `legacy-image-${index + 1}.png`,
							mimeType: 'image/png',
							content: image
						}
					]
				: []
		);
	}

	return [];
};

const normalizeTags = (value: unknown): Tag[] =>
	Array.isArray(value)
		? value.flatMap((tag) =>
				isObject(tag) &&
				typeof tag.id === 'string' &&
				typeof tag.label === 'string' &&
				typeof tag.color === 'string'
					? [{ id: tag.id, label: tag.label, color: tag.color }]
					: []
			)
		: [];

const normalizeTaskCards = (value: unknown): ChatTaskCard[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((taskCard) => {
		if (!isObject(taskCard)) return [];
		if (
			typeof taskCard.taskId !== 'string' ||
			typeof taskCard.columnId !== 'string' ||
			typeof taskCard.columnTitle !== 'string' ||
			typeof taskCard.title !== 'string'
		) {
			return [];
		}

		return [
			{
				id: typeof taskCard.id === 'string' && taskCard.id.trim() ? taskCard.id : createId(),
				taskId: taskCard.taskId,
				columnId: taskCard.columnId,
				columnTitle: taskCard.columnTitle,
				title: taskCard.title,
				description: typeof taskCard.description === 'string' ? taskCard.description : undefined,
				tags: normalizeTags(taskCard.tags),
				checked: typeof taskCard.checked === 'boolean' ? taskCard.checked : undefined
			}
		];
	});
};

const normalizeToolActions = (value: unknown): WorkspaceAction[] =>
	Array.isArray(value)
		? value.filter(
				(action): action is WorkspaceAction =>
					action === 'kanban' || action === 'scratchpad' || action === 'highlights'
			)
		: [];

const normalizeMetadata = (value: unknown): ChatMessage['metadata'] | undefined => {
	if (!isObject(value)) return undefined;

	const model = typeof value.model === 'string' && value.model.trim() ? value.model : 'Legacy';
	const directLatency = toNumber(value.latencyMs);
	const legacyLatency = toNumber(value.latency);
	const latencyMs =
		directLatency !== undefined
			? Math.round(directLatency)
			: legacyLatency !== undefined
				? Math.round(legacyLatency * 1000)
				: 0;
	const tokens = toNumber(value.tokens);
	const mode =
		value.mode === 'auto' || value.mode === 'chat' || value.mode === 'edit'
			? value.mode
			: undefined;

	return {
		model,
		latencyMs,
		...(tokens !== undefined ? { tokens } : {}),
		...(mode ? { mode } : {})
	};
};

const normalizeChatHistory = (history: unknown): ChatMessage[] => {
	if (!Array.isArray(history)) return [];

	return history.flatMap((entry, index) => {
		if (!isObject(entry)) return [];

		const timestamp = toNumber(entry.timestamp) ?? Date.now() + index;
		const toolActions = normalizeToolActions(entry.toolActions);
		const attachments = normalizeAttachments(entry);
		const taskCards = normalizeTaskCards(entry.taskCards);
		const metadata = normalizeMetadata(entry.metadata);
		const annotations = Array.isArray(entry.annotations)
			? entry.annotations.filter(isObject).map((annotation) => ({
					type: typeof annotation.type === 'string' ? annotation.type : undefined,
					title: typeof annotation.title === 'string' ? annotation.title : undefined,
					url: typeof annotation.url === 'string' ? annotation.url : undefined,
					siteName: typeof annotation.siteName === 'string' ? annotation.siteName : undefined,
					content: typeof annotation.content === 'string' ? annotation.content : undefined,
					startIndex: toNumber(annotation.startIndex),
					endIndex: toNumber(annotation.endIndex)
				}))
			: [];

		return [
			{
				id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : createId(),
				role: entry.role === 'assistant' || entry.role === 'model' ? 'assistant' : 'user',
				text: typeof entry.text === 'string' ? entry.text : '',
				timestamp,
				...(attachments.length ? { attachments } : {}),
				...(taskCards.length ? { taskCards } : {}),
				...(metadata ? { metadata } : {}),
				...(annotations.length ? { annotations } : {}),
				...(toolActions.length ? { toolActions } : {})
			}
		];
	});
};

const mapSettingsRow = (row: ProfileRow | null): UserSettings =>
	normalizeUserSettings(
		row
			? {
					defaultShowCheckbox: row.default_show_checkbox,
					preferredModelPreset: row.preferred_model_preset,
					preferredChatMode: row.preferred_chat_mode,
					backgroundTheme: row.background_theme
				}
			: null
	);

const mapMembershipRow = (
	row: ProjectMembershipRow,
	email: string | undefined,
	currentUserId: string
): ProjectMembership => ({
	projectId: row.project_id,
	userId: row.user_id,
	role: row.role,
	email,
	joinedAt: new Date(row.joined_at).getTime(),
	lastOpenedAt: new Date(row.last_opened_at).getTime(),
	isCurrentUser: row.user_id === currentUserId
});

const mapInviteRow = (row: ProjectInviteRow, projectName?: string): ProjectInvite => ({
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

const mapTaskRow = (row: ProjectTaskRow): Task => ({
	id: row.id,
	title: row.title,
	description: row.description,
	color: row.color || undefined,
	tags: normalizeTags(row.tags),
	hasCheckbox: row.has_checkbox,
	checked: row.checked,
	completedAt: row.completed_at ?? undefined,
	countdownAt: row.countdown_at ?? undefined,
	alarmAt: row.alarm_at ?? undefined,
	assignedTo: row.assigned_to ?? undefined
});

const buildKanbanData = (columns: ProjectColumnRow[], tasks: ProjectTaskRow[]) => {
	const tasksByColumn = new Map<string, Task[]>();

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

const tagSignature = (tag: Tag) => `${tag.id}|${tag.label}|${tag.color}`;

const areTasksEqual = (left: Task, right: Task) => {
	if (left.title !== right.title) return false;
	if ((left.description || '') !== (right.description || '')) return false;
	if ((left.color || '') !== (right.color || '')) return false;
	if ((left.hasCheckbox || false) !== (right.hasCheckbox || false)) return false;
	if ((left.checked || false) !== (right.checked || false)) return false;
	if (left.completedAt !== right.completedAt) return false;
	if (left.countdownAt !== right.countdownAt) return false;
	if (left.alarmAt !== right.alarmAt) return false;
	if ((left.assignedTo || '') !== (right.assignedTo || '')) return false;

	const leftTags = (left.tags || []).map(tagSignature).sort();
	const rightTags = (right.tags || []).map(tagSignature).sort();
	if (leftTags.length !== rightTags.length) return false;
	return leftTags.every((entry, index) => entry === rightTags[index]);
};

const mapColumnUpsertRow = (
	projectId: string,
	column: Project['kanbanData'][number],
	position: number
) => ({
	project_id: projectId,
	id: column.id,
	title: column.title,
	color: column.color || null,
	width: column.width ?? DEFAULT_COLUMN_WIDTH,
	position
});

const mapTaskUpsertRow = (projectId: string, columnId: string, task: Task, position: number) => ({
	project_id: projectId,
	id: task.id,
	column_id: columnId,
	title: task.title,
	description: task.description || '',
	color: task.color || null,
	tags: task.tags || [],
	has_checkbox: Boolean(task.hasCheckbox),
	checked: Boolean(task.checked),
	completed_at: task.completedAt ?? null,
	countdown_at: task.countdownAt ?? null,
	alarm_at: task.alarmAt ?? null,
	assigned_to: task.assignedTo ?? null,
	position
});

const stripAssignedToFromTaskUpserts = (
	rows: ReturnType<typeof mapTaskUpsertRow>[]
) =>
	rows.map(({ assigned_to: _assignedTo, ...row }) => row);

const upsertProjectTasks = async (rows: ReturnType<typeof mapTaskUpsertRow>[]) => {
	const shouldIncludeAssignments = projectTaskAssignmentsSupported !== false;
	const payload = shouldIncludeAssignments ? rows : stripAssignedToFromTaskUpserts(rows);
	const result = await supabase.from('project_tasks').upsert(payload, {
		onConflict: 'project_id,id'
	});

	if (!result.error) {
		if (shouldIncludeAssignments) {
			projectTaskAssignmentsSupported = true;
		}
		return;
	}

	if (
		shouldIncludeAssignments &&
		isMissingSchemaColumnError(result.error, 'project_tasks', 'assigned_to')
	) {
		projectTaskAssignmentsSupported = false;
		const retry = await supabase.from('project_tasks').upsert(
			stripAssignedToFromTaskUpserts(rows),
			{
				onConflict: 'project_id,id'
			}
		);

		if (retry.error) throw retry.error;
		return;
	}

	throw result.error;
};

const deriveBoardMutations = (
	projectId: string,
	previous: Project['kanbanData'],
	next: Project['kanbanData']
) => {
	const upsertColumns: ReturnType<typeof mapColumnUpsertRow>[] = [];
	const upsertTasks: ReturnType<typeof mapTaskUpsertRow>[] = [];
	const deleteColumnIds: string[] = [];
	const deleteTaskIds: string[] = [];
	const previousColumns = new Map(previous.map((column, index) => [column.id, { column, index }]));
	const previousTasks = new Map(
		previous.flatMap((column) =>
			column.tasks.map(
				(task, index) =>
					[
						task.id,
						{
							task,
							columnId: column.id,
							position: index
						}
					] as const
			)
		)
	);
	const nextTaskIds = new Set<string>();

	for (const [index, column] of next.entries()) {
		const previousColumn = previousColumns.get(column.id);
		if (
			!previousColumn ||
			previousColumn.index !== index ||
			previousColumn.column.title !== column.title ||
			(previousColumn.column.color || '') !== (column.color || '') ||
			(previousColumn.column.width ?? DEFAULT_COLUMN_WIDTH) !==
				(column.width ?? DEFAULT_COLUMN_WIDTH)
		) {
			upsertColumns.push(mapColumnUpsertRow(projectId, column, index));
		}

		for (const [taskIndex, task] of column.tasks.entries()) {
			nextTaskIds.add(task.id);
			const previousTask = previousTasks.get(task.id);
			if (
				!previousTask ||
				previousTask.columnId !== column.id ||
				previousTask.position !== taskIndex ||
				!areTasksEqual(previousTask.task, task)
			) {
				upsertTasks.push(mapTaskUpsertRow(projectId, column.id, task, taskIndex));
			}
		}
	}

	for (const column of previous) {
		if (!next.some((entry) => entry.id === column.id)) {
			deleteColumnIds.push(column.id);
		}
	}

	for (const [taskId, previousTask] of previousTasks.entries()) {
		if (!nextTaskIds.has(taskId) && !deleteColumnIds.includes(previousTask.columnId)) {
			deleteTaskIds.push(taskId);
		}
	}

	return { upsertColumns, upsertTasks, deleteColumnIds, deleteTaskIds };
};

const applyBoardMutations = async (
	projectId: string,
	mutations: ReturnType<typeof deriveBoardMutations>
) => {
	if (mutations.upsertColumns.length) {
		const { error } = await supabase.from('project_columns').upsert(mutations.upsertColumns, {
			onConflict: 'project_id,id'
		});
		if (error) throw error;
	}

	if (mutations.upsertTasks.length) {
		await upsertProjectTasks(mutations.upsertTasks);
	}

	if (mutations.deleteTaskIds.length) {
		const { error } = await supabase
			.from('project_tasks')
			.delete()
			.eq('project_id', projectId)
			.in('id', mutations.deleteTaskIds);
		if (error) throw error;
	}

	if (mutations.deleteColumnIds.length) {
		const { error } = await supabase
			.from('project_columns')
			.delete()
			.eq('project_id', projectId)
			.in('id', mutations.deleteColumnIds);
		if (error) throw error;
	}
};

const findProjectName = (projectRows: ProjectRow[], projectId: string) =>
	projectRows.find((project) => project.id === projectId)?.name;

export const fetchWorkspace = async (userId: string) => {
	const membershipsResult = await supabase
		.from('project_memberships')
		.select('*')
		.eq('user_id', userId)
		.order('last_opened_at', { ascending: false });

	if (membershipsResult.error) {
		throw membershipsResult.error;
	}

	const ownMembershipRows = (membershipsResult.data || []) as ProjectMembershipRow[];
	const accessibleProjectIds = ownMembershipRows.map((membership) => membership.project_id);

	const [
		projectsResult,
		allMembershipsResult,
		columnsResult,
		tasksResult,
		userStatesResult,
		incomingInvitesResult
	] = await Promise.all([
		accessibleProjectIds.length
			? supabase.from('projects').select('*').in('id', accessibleProjectIds)
			: Promise.resolve({ data: [], error: null }),
		accessibleProjectIds.length
			? supabase.from('project_memberships').select('*').in('project_id', accessibleProjectIds)
			: Promise.resolve({ data: [], error: null }),
		accessibleProjectIds.length
			? supabase
					.from('project_columns')
					.select('*')
					.in('project_id', accessibleProjectIds)
					.order('position', { ascending: true })
			: Promise.resolve({ data: [], error: null }),
		accessibleProjectIds.length
			? supabase
					.from('project_tasks')
					.select('*')
					.in('project_id', accessibleProjectIds)
					.order('position', { ascending: true })
			: Promise.resolve({ data: [], error: null }),
		accessibleProjectIds.length
			? supabase
					.from('project_user_state')
					.select('*')
					.eq('user_id', userId)
					.in('project_id', accessibleProjectIds)
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('project_invites')
			.select('*, projects(name)')
			.eq('invitee_user_id', userId)
			.eq('status', 'pending')
	]);

	if (projectsResult.error) throw projectsResult.error;
	if (allMembershipsResult.error) throw allMembershipsResult.error;
	if (columnsResult.error) throw columnsResult.error;
	if (tasksResult.error) throw tasksResult.error;
	if (userStatesResult.error) throw userStatesResult.error;
	if (incomingInvitesResult.error) throw incomingInvitesResult.error;

	const projectRows = (projectsResult.data || []) as ProjectRow[];
	const allMembershipRows = (allMembershipsResult.data || []) as ProjectMembershipRow[];
	const columnRows = (columnsResult.data || []) as ProjectColumnRow[];
	const taskRows = (tasksResult.data || []) as ProjectTaskRow[];
	const userStateRows = (userStatesResult.data || []) as ProjectUserStateRow[];
	const ownedProjectIds = projectRows
		.filter((project) => project.user_id === userId)
		.map((project) => project.id);
	const ownerInvitesResult = ownedProjectIds.length
		? await supabase
				.from('project_invites')
				.select('*')
				.in('project_id', ownedProjectIds)
				.eq('status', 'pending')
		: { data: [], error: null };

	if (ownerInvitesResult.error) throw ownerInvitesResult.error;

	const profileIds = [...new Set(allMembershipRows.map((membership) => membership.user_id))];
	const profilesResult = profileIds.length
		? await supabase.from('profiles').select('user_id,email').in('user_id', profileIds)
		: { data: [], error: null };

	if (profilesResult.error) throw profilesResult.error;

	const profileEmailById = new Map(
		((profilesResult.data || []) as Pick<ProfileRow, 'user_id' | 'email'>[]).map((profile) => [
			profile.user_id,
			profile.email || undefined
		])
	);
	const ownMembershipByProjectId = new Map(
		ownMembershipRows.map((membership) => [membership.project_id, membership])
	);
	const membershipsByProjectId = new Map<string, ProjectMembership[]>();

	for (const row of allMembershipRows) {
		const current = membershipsByProjectId.get(row.project_id) || [];
		current.push(mapMembershipRow(row, profileEmailById.get(row.user_id), userId));
		membershipsByProjectId.set(row.project_id, current);
	}

	const columnsByProjectId = new Map<string, ProjectColumnRow[]>();
	for (const row of columnRows) {
		const current = columnsByProjectId.get(row.project_id) || [];
		current.push(row);
		columnsByProjectId.set(row.project_id, current);
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
				chatHistory: normalizeChatHistory(row.chat_history),
				updatedAt: new Date(row.updated_at).getTime()
			}
		])
	);

	const ownerInvitesByProjectId = new Map<string, ProjectInvite[]>();
	for (const row of (ownerInvitesResult.data || []) as ProjectInviteRow[]) {
		const current = ownerInvitesByProjectId.get(row.project_id) || [];
		current.push(mapInviteRow(row, findProjectName(projectRows, row.project_id)));
		ownerInvitesByProjectId.set(row.project_id, current);
	}

	const projects: Project[] = projectRows
		.flatMap((row) => {
			const ownMembership = ownMembershipByProjectId.get(row.id);
			if (!ownMembership) return [];

			const userState = userStateByProjectId.get(row.id);
			return [
				{
					id: row.id,
					ownerUserId: row.user_id,
					accessRole: ownMembership.role,
					name: row.name,
					backgroundTheme: normalizeNullableBackgroundTheme(row.background_theme),
					kanbanData: buildKanbanData(
						columnsByProjectId.get(row.id) || [],
						tasksByProjectId.get(row.id) || []
					),
					scratchpadData: normalizeScratchpadData(row.scratchpad_data),
					scratchpadRev: row.scratchpad_rev,
					chatHistory: userState ? userState.chatHistory : structuredClone(DEFAULT_CHAT_HISTORY),
					members: (membershipsByProjectId.get(row.id) || []).sort(
						(left, right) => right.lastOpenedAt - left.lastOpenedAt
					),
					invites: (ownerInvitesByProjectId.get(row.id) || []).sort(
						(left, right) => right.createdAt - left.createdAt
					),
					createdAt: new Date(row.created_at).getTime(),
					updatedAt: new Date(row.updated_at).getTime(),
					viewerLastOpenedAt: new Date(ownMembership.last_opened_at).getTime()
				} satisfies Project
			];
		})
		.sort(
			(left, right) =>
				right.viewerLastOpenedAt - left.viewerLastOpenedAt || right.updatedAt - left.updatedAt
		);

	const incomingInvites = (
		(incomingInvitesResult.data || []) as Array<
			ProjectInviteRow & {
				projects?: { name?: string | null } | null;
			}
		>
	)
		.map((row) => mapInviteRow(row, row.projects?.name || undefined))
		.sort((left, right) => right.createdAt - left.createdAt);

	return {
		projects,
		incomingInvites
	};
};

export const createProject = async (
	userId: string,
	name = 'New Project',
	seedProject?: Partial<Project>
) => {
	const seed = {
		...EMPTY_PROJECT(userId, name),
		...(seedProject || {}),
		name: seedProject?.name || name,
		ownerUserId: userId,
		accessRole: 'owner' as const
	};

	const { error } = await supabase.from('projects').insert({
		id: seed.id,
		user_id: userId,
		name: seed.name,
		background_theme: seed.backgroundTheme,
		scratchpad_data: serializeScratchpadData(seed.scratchpadData),
		scratchpad_rev: seed.scratchpadRev,
		created_at: new Date(seed.createdAt).toISOString(),
		updated_at: new Date(seed.updatedAt).toISOString(),
		last_opened_at: new Date(seed.viewerLastOpenedAt).toISOString()
	});

	if (error) throw error;

	await applyBoardMutations(seed.id, deriveBoardMutations(seed.id, [], seed.kanbanData));
	await saveProjectChatHistory(seed.id, userId, seed.chatHistory);
	await touchProjectLastOpened(seed.id);

	const workspace = await fetchWorkspace(userId);
	return workspace.projects.find((project) => project.id === seed.id) || seed;
};

export const renameProject = async (projectId: string, nextName: string) => {
	const { error } = await supabase.from('projects').update({ name: nextName }).eq('id', projectId);
	if (error) throw error;
};

export const syncProjectBoard = async (
	projectId: string,
	previous: Project['kanbanData'],
	next: Project['kanbanData']
) => {
	const mutations = deriveBoardMutations(projectId, previous, next);
	await applyBoardMutations(projectId, mutations);
};

export const replaceProjectBoard = async (projectId: string, next: Project['kanbanData']) => {
	await applyBoardMutations(projectId, deriveBoardMutations(projectId, [], next));
};

export const updateProjectScratchpad = async (
	projectId: string,
	scratchpadData: Project['scratchpadData'],
	expectedRevision: number
) => {
	const result = await invokeWorkspaceApi<{
		ok: boolean;
		scratchpadData: string;
		scratchpadRev: number;
		updatedAt: number;
	}>('/api/workspace/projects/scratchpad', {
		body: {
			projectId,
			scratchpadData: serializeScratchpadData(scratchpadData),
			expectedRevision
		}
	});

	return {
		ok: result.ok,
		scratchpadData: normalizeScratchpadData(result.scratchpadData),
		scratchpadRev: result.scratchpadRev,
		updatedAt: result.updatedAt
	};
};

export const saveProjectChatHistory = async (
	projectId: string,
	userId: string,
	history: ChatMessage[]
) => {
	const { error } = await supabase.from('project_user_state').upsert({
		project_id: projectId,
		user_id: userId,
		chat_history: history,
		updated_at: new Date().toISOString()
	});

	if (error) throw error;
};

export const touchProjectLastOpened = async (projectId: string) => {
	await invokeWorkspaceApi('/api/workspace/projects/touch', {
		body: {
			projectId
		}
	});
};

export const updateProjectBackground = async (
	projectId: string,
	backgroundTheme: BackgroundTheme | null
) => {
	await invokeWorkspaceApi('/api/workspace/projects/background', {
		body: {
			projectId,
			backgroundTheme
		}
	});
};

export const createProjectInvite = async (projectId: string, inviteeEmail: string) => {
	await invokeWorkspaceApi('/api/workspace/invites/create', {
		body: {
			projectId,
			inviteeEmail
		}
	});
};

export const respondToProjectInvite = async (inviteId: string, accept: boolean) => {
	await invokeWorkspaceApi('/api/workspace/invites/respond', {
		body: {
			inviteId,
			accept
		}
	});
};

export const cancelProjectInvite = async (inviteId: string) => {
	await invokeWorkspaceApi('/api/workspace/invites/cancel', {
		body: {
			inviteId
		}
	});
};

export const removeProjectMember = async (projectId: string, memberUserId: string) => {
	await invokeWorkspaceApi('/api/workspace/members/remove', {
		body: {
			projectId,
			memberUserId
		}
	});
};

export const leaveProject = async (projectId: string) => {
	await invokeWorkspaceApi('/api/workspace/members/leave', {
		body: {
			projectId
		}
	});
};

export const deleteProjectRemote = async (projectId: string) => {
	const { error } = await supabase.from('projects').delete().eq('id', projectId);
	if (error) throw error;
};

export const fetchUserSettings = async (userId: string) => {
	const useLegacyColumns = profileBackgroundThemeSupported === false;
	const { data, error } = await supabase
		.from('profiles')
		.select(useLegacyColumns ? PROFILE_SETTINGS_COLUMNS_LEGACY : PROFILE_SETTINGS_COLUMNS)
		.eq('user_id', userId)
		.maybeSingle();

	if (
		error &&
		!useLegacyColumns &&
		isMissingSchemaColumnError(error, 'profiles', 'background_theme')
	) {
		profileBackgroundThemeSupported = false;
		const legacyResult = await supabase
			.from('profiles')
			.select(PROFILE_SETTINGS_COLUMNS_LEGACY)
			.eq('user_id', userId)
			.maybeSingle();

		if (legacyResult.error) throw legacyResult.error;
		return mapSettingsRow(legacyResult.data as ProfileRow | null);
	}

	if (error) throw error;
	if (!useLegacyColumns) profileBackgroundThemeSupported = true;
	return mapSettingsRow(data as ProfileRow | null);
};

export const upsertUserSettings = async (userId: string, settings: UserSettings) => {
	const basePayload = {
		user_id: userId,
		default_show_checkbox: settings.defaultShowCheckbox,
		preferred_model_preset: settings.preferredModelPreset,
		preferred_chat_mode: settings.preferredChatMode,
		updated_at: new Date().toISOString()
	};
	const useLegacyPayload = profileBackgroundThemeSupported === false;
	const { error } = await supabase.from('profiles').upsert(
		useLegacyPayload
			? basePayload
			: {
					...basePayload,
					background_theme: settings.backgroundTheme
				}
	);

	if (
		error &&
		!useLegacyPayload &&
		isMissingSchemaColumnError(error, 'profiles', 'background_theme')
	) {
		profileBackgroundThemeSupported = false;
		const legacyResult = await supabase.from('profiles').upsert(basePayload);
		if (legacyResult.error) throw legacyResult.error;
		return;
	}

	if (error) throw error;
	if (!useLegacyPayload) profileBackgroundThemeSupported = true;
};

export const subscribeToWorkspaceChanges = (userId: string, onChange: () => void) => {
	const channel = supabase
		.channel(`workspace-${userId}-${createId()}`)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onChange)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'project_memberships' },
			onChange
		)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_invites' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_columns' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, onChange)
		.subscribe();

	return () => {
		void supabase.removeChannel(channel);
	};
};
