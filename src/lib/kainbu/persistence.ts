import {
	DEFAULT_AI_SESSION_TITLE,
	DEFAULT_CHAT_HISTORY,
	DEFAULT_COLUMN_WIDTH,
	EMPTY_PROJECT
} from '$lib/kainbu/constants';
import { DEFAULT_AI_MODEL_ID } from '$lib/kainbu/models';
import { normalizeNullableBackgroundTheme } from '$lib/kainbu/backgrounds';
import { invokeWorkspaceApi } from '$lib/kainbu/api';
import { createId } from '$lib/kainbu/id';
import { normalizeProjectStructure } from '$lib/kainbu/projectStructure';
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
	ProjectAiSession,
	ProjectAiSessionRow,
	ProjectBoard,
	ProjectBoardRow,
	ProjectColumnRow,
	ProjectInvite,
	ProjectInviteRow,
	ProjectMembership,
	ProjectMembershipRow,
	ProjectPage,
	ProjectPageRow,
	ProjectRow,
	ProjectTaskRow,
	ProjectUserStateRow,
	Tag,
	Task,
	UserProfile,
	UserSettings,
	WorkspaceAction,
	AiProgressEvent,
	AiProgressEventKind
} from '$lib/kainbu/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const PROFILE_SETTINGS_COLUMNS =
	'user_id,email,default_show_checkbox,preferred_ai_model_id,preferred_model_preset,background_theme';
const PROFILE_SETTINGS_COLUMNS_LEGACY =
	'user_id,email,default_show_checkbox,preferred_model_preset';
const PROFILE_IDENTITY_COLUMNS = 'user_id,email,username';
const PROFILE_IDENTITY_COLUMNS_LEGACY = 'user_id,email';

let profileBackgroundThemeSupported: boolean | null = null;
let profileUsernameSupported: boolean | null = null;
let projectTaskAssignmentsSupported: boolean | null = null;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
					action === 'kanban' ||
					action === 'scratchpad' ||
					action === 'highlights' ||
					action === 'question'
			)
		: [];

const VALID_PROGRESS_KINDS = new Set<AiProgressEventKind>([
	'status',
	'tool_call',
	'tool_result',
	'assistant_draft'
]);

const normalizeProgressEvents = (value: unknown): AiProgressEvent[] => {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!isObject(entry)) return [];
		if (typeof entry.id !== 'string' || typeof entry.message !== 'string') return [];
		if (!VALID_PROGRESS_KINDS.has(entry.kind as AiProgressEventKind)) return [];
		return [
			{
				id: entry.id,
				kind: entry.kind as AiProgressEventKind,
				message: entry.message,
				...(typeof entry.detail === 'string' ? { detail: entry.detail } : {}),
				timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : 0
			}
		];
	});
};

const normalizeQuestion = (value: unknown): ChatMessage['question'] | undefined => {
	if (!isObject(value) || typeof value.prompt !== 'string' || !Array.isArray(value.options)) {
		return undefined;
	}

	const options = value.options.flatMap((option, index) => {
		if (!isObject(option) || typeof option.label !== 'string') {
			return [];
		}

		return [
			{
				id: typeof option.id === 'string' && option.id.trim() ? option.id : `option-${index + 1}`,
				label: option.label,
				description:
					typeof option.description === 'string' && option.description.trim()
						? option.description
						: undefined
			}
		];
	});

	if (!options.length) {
		return undefined;
	}

	return {
		id: typeof value.id === 'string' && value.id.trim() ? value.id : createId(),
		prompt: value.prompt,
		options,
		allowFreeform: typeof value.allowFreeform === 'boolean' ? value.allowFreeform : undefined,
		reason: typeof value.reason === 'string' ? value.reason : undefined,
		status: value.status === 'answered' ? 'answered' : 'open',
		answeredOptionId:
			typeof value.answeredOptionId === 'string' ? value.answeredOptionId : undefined,
		answerText: typeof value.answerText === 'string' ? value.answerText : undefined,
		answeredAt: toNumber(value.answeredAt)
	};
};

const normalizeUsage = (value: unknown): ChatMessage['usage'] | undefined => {
	if (!isObject(value)) return undefined;

	const modelTurnsUsed = toNumber(value.modelTurnsUsed);
	const modelTurnsMax = toNumber(value.modelTurnsMax);
	const toolCallsUsed = toNumber(value.toolCallsUsed);
	const toolCallsMax = toNumber(value.toolCallsMax);
	const kanbanReadsUsed = toNumber(value.kanbanReadsUsed);
	const kanbanReadsMax = toNumber(value.kanbanReadsMax);
	const scratchpadReadsUsed = toNumber(value.scratchpadReadsUsed);
	const scratchpadReadsMax = toNumber(value.scratchpadReadsMax);

	if (
		modelTurnsUsed === undefined ||
		modelTurnsMax === undefined ||
		toolCallsUsed === undefined ||
		toolCallsMax === undefined ||
		kanbanReadsUsed === undefined ||
		kanbanReadsMax === undefined ||
		scratchpadReadsUsed === undefined ||
		scratchpadReadsMax === undefined
	) {
		return undefined;
	}

	return {
		modelTurnsUsed,
		modelTurnsMax,
		toolCallsUsed,
		toolCallsMax,
		kanbanReadsUsed,
		kanbanReadsMax,
		scratchpadReadsUsed,
		scratchpadReadsMax,
		capReached: typeof value.capReached === 'boolean' ? value.capReached : undefined
	};
};

const normalizeMetadata = (value: unknown): ChatMessage['metadata'] | undefined => {
	if (!isObject(value)) return undefined;

	const model = typeof value.model === 'string' && value.model.trim() ? value.model : 'Legacy';
	const modelId = typeof value.modelId === 'string' && value.modelId.trim() ? value.modelId : undefined;
	const directLatency = toNumber(value.latencyMs);
	const legacyLatency = toNumber(value.latency);
	const latencyMs =
		directLatency !== undefined
			? Math.round(directLatency)
			: legacyLatency !== undefined
				? Math.round(legacyLatency * 1000)
				: 0;
	const tokens = toNumber(value.tokens);

	return {
		...(modelId ? { modelId } : {}),
		model,
		latencyMs,
		...(typeof value.requestId === 'string' && value.requestId.trim()
			? { requestId: value.requestId }
			: {}),
		...(tokens !== undefined ? { tokens } : {})
	};
};

const normalizeChatHistory = (history: unknown): ChatMessage[] => {
	if (!Array.isArray(history)) return [];

	return history.flatMap((entry, index) => {
		if (!isObject(entry)) return [];

		const timestamp = toNumber(entry.timestamp) ?? Date.now() + index;
		const toolActions = normalizeToolActions(entry.toolActions);
		const progressEvents = normalizeProgressEvents(entry.progressEvents);
		const attachments = normalizeAttachments(entry);
		const taskCards = normalizeTaskCards(entry.taskCards);
		const metadata = normalizeMetadata(entry.metadata);
		const question = normalizeQuestion(entry.question);
		const usage = normalizeUsage(entry.usage);
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
				...(question ? { question } : {}),
				...(usage ? { usage } : {}),
				...(typeof entry.stoppedReason === 'string' && entry.stoppedReason.trim()
					? { stoppedReason: entry.stoppedReason }
					: {}),
				...(annotations.length ? { annotations } : {}),
				...(toolActions.length ? { toolActions } : {}),
				...(progressEvents.length ? { progressEvents } : {})
			}
		];
	});
};

const normalizeAiModelId = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_AI_MODEL_ID;

const mapAiSessionRow = (row: ProjectAiSessionRow): ProjectAiSession => ({
	id: row.id,
	projectId: row.project_id,
	title: row.title?.trim() || DEFAULT_AI_SESSION_TITLE,
	modelId: normalizeAiModelId(row.model_id),
	history: normalizeChatHistory(row.history),
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime(),
	lastMessageAt: new Date(row.last_message_at).getTime()
});

const mapSettingsRow = (row: ProfileRow | null): UserSettings =>
	normalizeUserSettings(
		row
			? {
					defaultShowCheckbox: row.default_show_checkbox,
					preferredAiModelId: row.preferred_ai_model_id || row.preferred_model_preset,
					backgroundTheme: row.background_theme
				}
			: null
	);

const normalizeUsernameValue = (value: string | null | undefined) =>
	typeof value === 'string' && value.trim().length ? value.trim() : null;

const mapProfileRow = (
	row: Pick<ProfileRow, 'user_id' | 'email' | 'username'> | null,
	userId: string
): UserProfile => ({
	userId: row?.user_id || userId,
	email: row?.email || null,
	username: normalizeUsernameValue(row?.username)
});

const mapMembershipRow = (
	row: ProjectMembershipRow,
	email: string | undefined,
	username: string | null,
	currentUserId: string
): ProjectMembership => ({
	projectId: row.project_id,
	userId: row.user_id,
	role: row.role,
	email,
	username,
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

const compareProjects = (left: Project, right: Project) =>
	left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
	right.updatedAt - left.updatedAt ||
	left.id.localeCompare(right.id);

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
	assignedTo: row.assigned_to ?? undefined,
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
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

const mapBoardRow = (
	row: ProjectBoardRow,
	columns: ProjectColumnRow[],
	tasks: ProjectTaskRow[]
): ProjectBoard => ({
	id: row.id,
	projectId: row.project_id,
	name: row.name,
	position: row.position,
	kanbanData: buildKanbanData(columns, tasks),
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

const mapPageRow = (row: ProjectPageRow): ProjectPage => ({
	id: row.id,
	projectId: row.project_id,
	name: row.name,
	content: row.content || '',
	position: row.position,
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime()
});

const mapAiSessionUpsertRow = (
	projectId: string,
	userId: string,
	session: ProjectAiSession
) => ({
	id: session.id,
	project_id: projectId,
	user_id: userId,
	title: session.title,
	model_id: normalizeAiModelId(session.modelId),
	history: session.history,
	created_at: new Date(session.createdAt).toISOString(),
	updated_at: new Date(session.updatedAt).toISOString(),
	last_message_at: new Date(session.lastMessageAt).toISOString()
});

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
	boardId: string,
	column: Project['kanbanData'][number],
	position: number
) => ({
	project_id: projectId,
	board_id: boardId,
	id: column.id,
	title: column.title,
	color: column.color || null,
	width: column.width ?? DEFAULT_COLUMN_WIDTH,
	position
});

const mapTaskUpsertRow = (
	projectId: string,
	boardId: string,
	columnId: string,
	task: Task,
	position: number
) => ({
	project_id: projectId,
	board_id: boardId,
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
	assigned_to:
		typeof task.assignedTo === 'string' && UUID_PATTERN.test(task.assignedTo.trim())
			? task.assignedTo.trim()
			: null,
	position
});

const stripAssignedToFromTaskUpserts = (rows: ReturnType<typeof mapTaskUpsertRow>[]) =>
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
		const retry = await supabase
			.from('project_tasks')
			.upsert(stripAssignedToFromTaskUpserts(rows), {
				onConflict: 'project_id,id'
			});

		if (retry.error) throw retry.error;
		return;
	}

	throw result.error;
};

const deriveBoardMutations = (
	projectId: string,
	boardId: string,
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
			upsertColumns.push(mapColumnUpsertRow(projectId, boardId, column, index));
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
				upsertTasks.push(mapTaskUpsertRow(projectId, boardId, column.id, task, taskIndex));
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
		boardsResult,
		pagesResult,
		columnsResult,
		tasksResult,
		userStatesResult,
		aiSessionsResult,
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
					.from('project_boards')
					.select('*')
					.in('project_id', accessibleProjectIds)
					.order('position', { ascending: true })
			: Promise.resolve({ data: [], error: null }),
		accessibleProjectIds.length
			? supabase
					.from('project_pages')
					.select('*')
					.in('project_id', accessibleProjectIds)
					.order('position', { ascending: true })
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
		accessibleProjectIds.length
			? supabase
					.from('project_ai_sessions')
					.select('*')
					.eq('user_id', userId)
					.in('project_id', accessibleProjectIds)
					.order('updated_at', { ascending: true })
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('project_invites')
			.select('*, projects(name)')
			.eq('invitee_user_id', userId)
			.eq('status', 'pending')
	]);

	if (projectsResult.error) throw projectsResult.error;
	if (allMembershipsResult.error) throw allMembershipsResult.error;
	if (boardsResult.error) throw boardsResult.error;
	if (pagesResult.error) throw pagesResult.error;
	if (columnsResult.error) throw columnsResult.error;
	if (tasksResult.error) throw tasksResult.error;
	if (userStatesResult.error) throw userStatesResult.error;
	if (aiSessionsResult.error) throw aiSessionsResult.error;
	if (incomingInvitesResult.error) throw incomingInvitesResult.error;

	const projectRows = (projectsResult.data || []) as ProjectRow[];
	const allMembershipRows = (allMembershipsResult.data || []) as ProjectMembershipRow[];
	const boardRows = (boardsResult.data || []) as ProjectBoardRow[];
	const pageRows = (pagesResult.data || []) as ProjectPageRow[];
	const columnRows = (columnsResult.data || []) as ProjectColumnRow[];
	const taskRows = (tasksResult.data || []) as ProjectTaskRow[];
	const userStateRows = (userStatesResult.data || []) as ProjectUserStateRow[];
	const aiSessionRows = (aiSessionsResult.data || []) as ProjectAiSessionRow[];
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
	const useLegacyProfileColumns = profileUsernameSupported === false;
	let loadedProfileUsernames = !useLegacyProfileColumns;
	let profileRows: Pick<ProfileRow, 'user_id' | 'email' | 'username'>[] = [];
	if (profileIds.length) {
		let profilesQuery = (await supabase
			.from('profiles')
			.select(useLegacyProfileColumns ? PROFILE_IDENTITY_COLUMNS_LEGACY : PROFILE_IDENTITY_COLUMNS)
			.in('user_id', profileIds)) as { data: unknown[] | null; error: unknown | null };

		if (
			profilesQuery.error &&
			!useLegacyProfileColumns &&
			isMissingSchemaColumnError(profilesQuery.error, 'profiles', 'username')
		) {
			profileUsernameSupported = false;
			loadedProfileUsernames = false;
			profilesQuery = (await supabase
				.from('profiles')
				.select(PROFILE_IDENTITY_COLUMNS_LEGACY)
				.in('user_id', profileIds)) as { data: unknown[] | null; error: unknown | null };
		}

		if (profilesQuery.error) throw profilesQuery.error;
		if (loadedProfileUsernames) profileUsernameSupported = true;
		profileRows = (profilesQuery.data || []) as Pick<ProfileRow, 'user_id' | 'email' | 'username'>[];
	}

	const profileIdentityById = new Map(
		profileRows.map((profile) => [
			profile.user_id,
			{
				email: profile.email || undefined,
				username: normalizeUsernameValue(profile.username)
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

	const boardsByProjectId = new Map<string, ProjectBoardRow[]>();
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
			const projectBoards = (boardsByProjectId.get(row.id) || []).sort(
				(left, right) => left.position - right.position || left.created_at.localeCompare(right.created_at)
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
			const pages = (pagesByProjectId.get(row.id) || []).map(mapPageRow);
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
				viewerLastOpenedAt: new Date(ownMembership.last_opened_at).getTime()
			});
			return [
				normalizedProject satisfies Project
			];
		})
		.sort(compareProjects);

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
		...normalizeProjectStructure(EMPTY_PROJECT(userId, name)),
		...(seedProject || {}),
		name: seedProject?.name || name,
		ownerUserId: userId,
		accessRole: 'owner' as const
	};
	const normalizedSeed = normalizeProjectStructure(seed as Project);

	const { error } = await supabase.from('projects').insert({
		id: normalizedSeed.id,
		user_id: userId,
		name: normalizedSeed.name,
		background_theme: normalizedSeed.backgroundTheme,
		scratchpad_data: serializeScratchpadData(normalizedSeed.scratchpadData),
		scratchpad_rev: normalizedSeed.scratchpadRev,
		created_at: new Date(normalizedSeed.createdAt).toISOString(),
		updated_at: new Date(normalizedSeed.updatedAt).toISOString(),
		last_opened_at: new Date(normalizedSeed.viewerLastOpenedAt).toISOString()
	});

	if (error) throw error;

	const boardPayload = normalizedSeed.boards.map((board) => ({
		id: board.id,
		project_id: normalizedSeed.id,
		name: board.name,
		position: board.position,
		created_at: new Date(board.createdAt).toISOString(),
		updated_at: new Date(board.updatedAt).toISOString()
	}));
	if (boardPayload.length) {
		const boardInsert = await supabase.from('project_boards').insert(boardPayload);
		if (boardInsert.error) throw boardInsert.error;
	}

	const pagePayload = normalizedSeed.pages.map((page) => ({
		id: page.id,
		project_id: normalizedSeed.id,
		name: page.name,
		content: page.content,
		position: page.position,
		created_at: new Date(page.createdAt).toISOString(),
		updated_at: new Date(page.updatedAt).toISOString()
	}));
	if (pagePayload.length) {
		const pageInsert = await supabase.from('project_pages').insert(pagePayload);
		if (pageInsert.error) throw pageInsert.error;
	}

	for (const board of normalizedSeed.boards) {
		await applyBoardMutations(
			normalizedSeed.id,
			deriveBoardMutations(normalizedSeed.id, board.id, [], board.kanbanData)
		);
	}
	await saveProjectAiState(
		normalizedSeed.id,
		userId,
		normalizedSeed.aiSessions,
		normalizedSeed.activeAiSessionId
	);
	await touchProjectLastOpened(normalizedSeed.id);

	const workspace = await fetchWorkspace(userId);
	return workspace.projects.find((project) => project.id === normalizedSeed.id) || normalizedSeed;
};

export const renameProject = async (projectId: string, nextName: string) => {
	const { error } = await supabase.from('projects').update({ name: nextName }).eq('id', projectId);
	if (error) throw error;
};

export const syncProjectBoard = async (
	projectId: string,
	boardId: string,
	previous: Project['kanbanData'],
	next: Project['kanbanData']
) => {
	const mutations = deriveBoardMutations(projectId, boardId, previous, next);
	await applyBoardMutations(projectId, mutations);
};

export const replaceProjectBoard = async (
	projectId: string,
	boardId: string,
	next: Project['kanbanData']
) => {
	await applyBoardMutations(projectId, deriveBoardMutations(projectId, boardId, [], next));
};

export const createProjectBoard = async (projectId: string, name: string, position: number) => {
	const { data, error } = await supabase
		.from('project_boards')
		.insert({
			project_id: projectId,
			name,
			position
		})
		.select('*')
		.single();

	if (error) throw error;
	return mapBoardRow(data as ProjectBoardRow, [], []);
};

export const createProjectPage = async (projectId: string, name: string, position: number) => {
	const { data, error } = await supabase
		.from('project_pages')
		.insert({
			project_id: projectId,
			name,
			content: '',
			position
		})
		.select('*')
		.single();

	if (error) throw error;
	return mapPageRow(data as ProjectPageRow);
};

export const renameProjectBoard = async (projectId: string, boardId: string, name: string) => {
	const { error } = await supabase
		.from('project_boards')
		.update({ name, updated_at: new Date().toISOString() })
		.eq('project_id', projectId)
		.eq('id', boardId);

	if (error) throw error;
};

export const deleteProjectBoard = async (projectId: string, boardId: string) => {
	const { error } = await supabase
		.from('project_boards')
		.delete()
		.eq('project_id', projectId)
		.eq('id', boardId);

	if (error) throw error;
};

export const renameProjectPage = async (projectId: string, pageId: string, name: string) => {
	const { error } = await supabase
		.from('project_pages')
		.update({ name, updated_at: new Date().toISOString() })
		.eq('project_id', projectId)
		.eq('id', pageId);

	if (error) throw error;
};

export const deleteProjectPage = async (projectId: string, pageId: string) => {
	const { error } = await supabase
		.from('project_pages')
		.delete()
		.eq('project_id', projectId)
		.eq('id', pageId);

	if (error) throw error;
};

export const updateProjectPageContent = async (
	projectId: string,
	pageId: string,
	content: string
) => {
	const { error } = await supabase
		.from('project_pages')
		.update({
			content,
			updated_at: new Date().toISOString()
		})
		.eq('project_id', projectId)
		.eq('id', pageId);

	if (error) throw error;
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

export const saveProjectAiState = async (
	projectId: string,
	userId: string,
	aiSessions: ProjectAiSession[],
	activeAiSessionId: string
) => {
	const { error: userStateError } = await supabase.from('project_user_state').upsert({
		project_id: projectId,
		user_id: userId,
		active_ai_session_id: activeAiSessionId,
		updated_at: new Date().toISOString()
	});

	if (userStateError) throw userStateError;

	const normalizedSessions = aiSessions.length
		? aiSessions
		: [
				{
					...EMPTY_PROJECT(userId).aiSessions[0],
					projectId
				}
			];

	const { error: upsertSessionsError } = await supabase.from('project_ai_sessions').upsert(
		normalizedSessions.map((session) => mapAiSessionUpsertRow(projectId, userId, session)),
		{
			onConflict: 'id'
		}
	);

	if (upsertSessionsError) throw upsertSessionsError;

	const { data: existingSessions, error: existingSessionsError } = await supabase
		.from('project_ai_sessions')
		.select('id')
		.eq('project_id', projectId)
		.eq('user_id', userId);

	if (existingSessionsError) throw existingSessionsError;

	const nextSessionIds = new Set(normalizedSessions.map((session) => session.id));
	const staleSessionIds = ((existingSessions || []) as Array<{ id: string }>).flatMap((session) =>
		nextSessionIds.has(session.id) ? [] : [session.id]
	);

	if (staleSessionIds.length) {
		const { error: deleteSessionsError } = await supabase
			.from('project_ai_sessions')
			.delete()
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.in('id', staleSessionIds);

		if (deleteSessionsError) throw deleteSessionsError;
	}
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

export const fetchUserProfile = async (userId: string) => {
	const useLegacyColumns = profileUsernameSupported === false;
	const { data, error } = await supabase
		.from('profiles')
		.select(useLegacyColumns ? PROFILE_IDENTITY_COLUMNS_LEGACY : PROFILE_IDENTITY_COLUMNS)
		.eq('user_id', userId)
		.maybeSingle();

	if (error && !useLegacyColumns && isMissingSchemaColumnError(error, 'profiles', 'username')) {
		profileUsernameSupported = false;
		const legacyResult = await supabase
			.from('profiles')
			.select(PROFILE_IDENTITY_COLUMNS_LEGACY)
			.eq('user_id', userId)
			.maybeSingle();

		if (legacyResult.error) throw legacyResult.error;
		return mapProfileRow(
			legacyResult.data as Pick<ProfileRow, 'user_id' | 'email' | 'username'> | null,
			userId
		);
	}

	if (error) throw error;
	if (!useLegacyColumns) profileUsernameSupported = true;
	return mapProfileRow(data as Pick<ProfileRow, 'user_id' | 'email' | 'username'> | null, userId);
};

export const checkUsernameAvailability = async (username: string) => {
	const { data, error } = await supabase.rpc('check_username_available', {
		candidate_username: username
	});

	if (error) throw error;
	return data === true;
};

export const updateUsername = async (userId: string, username: string) => {
	const { data, error } = await supabase
		.from('profiles')
		.update({
			username,
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId)
		.select(PROFILE_IDENTITY_COLUMNS)
		.single();

	if (error) throw error;
	profileUsernameSupported = true;
	return mapProfileRow(data as Pick<ProfileRow, 'user_id' | 'email' | 'username'>, userId);
};

export const upsertUserSettings = async (userId: string, settings: UserSettings) => {
	const basePayload = {
		user_id: userId,
		default_show_checkbox: settings.defaultShowCheckbox,
		preferred_ai_model_id: settings.preferredAiModelId,
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
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_boards' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_pages' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_columns' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_user_state' }, onChange)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'project_ai_sessions' }, onChange)
		.subscribe();

	return () => {
		void supabase.removeChannel(channel);
	};
};
