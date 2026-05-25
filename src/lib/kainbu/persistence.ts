import {
	DEFAULT_AI_SESSION_TITLE,
	DEFAULT_CHAT_HISTORY,
	DEFAULT_COLUMN_WIDTH,
	EMPTY_PROJECT
} from '$lib/kainbu/constants';
import { DEFAULT_AI_MODEL_ID } from '$lib/kainbu/models';
import { normalizeNullableBackgroundTheme } from '$lib/kainbu/backgrounds';
import { invokeWorkspaceApi } from '$lib/kainbu/workspaceApi';
import { createId } from '$lib/kainbu/id';
import { normalizeProjectStructure } from '$lib/kainbu/projectStructure';
import { normalizeScratchpadData, serializeScratchpadData } from '$lib/kainbu/scratchpad';
import { normalizeUserSettings } from '$lib/kainbu/settings';
import { pbNoAutoCancel } from '$lib/kainbu/pbRequest';
import { isPocketBaseRecordId } from '$lib/kainbu/recordIds';
import { normalizeDueTimestamp } from '$lib/kainbu/timing';
import { getPb } from '$lib/kainbu/pocketbaseContext';
import {
	deleteByProjectAndClientIds,
	getBoardPbId,
	getProjectPbId,
	listByProjectIds,
	upsertProjectChild
} from '$lib/kainbu/pbHelpers';
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
	pbEscapeFilter,
	projectClientFilter,
	projectRelationFilter
} from '$lib/kainbu/pbRecords';
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toNumber = (value: unknown) => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

export const supportsProfileBackgroundTheme = () => true;

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
	'thinking',
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
	viewingBoardId: row.viewing_board_client_id || undefined,
	presenceAt: row.presence_at ? new Date(row.presence_at).getTime() : undefined,
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

const compareProjects = (left: Project, right: Project) => {
	const leftPinned = left.viewerPinnedAt ?? 0;
	const rightPinned = right.viewerPinnedAt ?? 0;
	if (leftPinned !== rightPinned) return rightPinned - leftPinned;

	return (
		left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
		right.updatedAt - left.updatedAt ||
		left.id.localeCompare(right.id)
	);
};

const normalizeLinkedTaskIds = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter(
				(entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
			)
		)
	];
};

const mapTaskRow = (row: ProjectTaskRow): Task => ({
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
const linkSignature = (ids: string[] | undefined) => [...new Set(ids || [])].sort().join('|');

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
	if (linkSignature(left.linkedTaskIds) !== linkSignature(right.linkedTaskIds)) return false;

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
	countdown_at: normalizeDueTimestamp(task.countdownAt) ?? null,
	alarm_at: normalizeDueTimestamp(task.alarmAt) ?? null,
	assigned_to: isPocketBaseRecordId(task.assignedTo) ? task.assignedTo.trim() : null,
	linked_task_ids: normalizeLinkedTaskIds(task.linkedTaskIds),
	position
});

const upsertProjectTasks = async (
	projectId: string,
	rows: ReturnType<typeof mapTaskUpsertRow>[]
) => {
	const projectPbId = await getProjectPbId(projectId);
	const pb = getPb();
	const boardPbIdCache = new Map<string, string>();

	const resolveBoardPbId = async (boardClientId: string) => {
		if (!boardClientId) return '';
		const cached = boardPbIdCache.get(boardClientId);
		if (cached) return cached;
		const boardPbId = await getBoardPbId(projectId, boardClientId);
		boardPbIdCache.set(boardClientId, boardPbId);
		return boardPbId;
	};

	for (const row of rows) {
		const filter = `${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(row.id)}"`;
		const boardPbId = row.board_id ? await resolveBoardPbId(row.board_id) : '';
		const body = {
			board: boardPbId,
			column_id: row.column_id,
			title: row.title,
			description: row.description,
			color: row.color,
			tags: row.tags,
			has_checkbox: row.has_checkbox,
			checked: row.checked,
			completed_at: row.completed_at,
			countdown_at: row.countdown_at,
			alarm_at: row.alarm_at,
			assigned_to: row.assigned_to || '',
			linked_task_ids: row.linked_task_ids,
			position: row.position
		};

		try {
			const existing = await pb.collection('project_tasks').getFirstListItem(filter);
			await pb.collection('project_tasks').update(existing.id, body);
		} catch {
			await pb.collection('project_tasks').create({
				...body,
				project: projectPbId,
				client_id: row.id
			});
		}
	}
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
	const projectPbId = await getProjectPbId(projectId);
	const boardPbIdCache = new Map<string, string>();

	const resolveBoardPbId = async (boardClientId: string) => {
		if (!boardClientId) return '';
		const cached = boardPbIdCache.get(boardClientId);
		if (cached) return cached;
		const boardPbId = await getBoardPbId(projectId, boardClientId);
		boardPbIdCache.set(boardClientId, boardPbId);
		return boardPbId;
	};

	for (const row of mutations.upsertColumns) {
		const boardPbId = row.board_id ? await resolveBoardPbId(row.board_id) : '';
		await upsertProjectChild('project_columns', projectId, row.id, {
			board: boardPbId,
			title: row.title,
			color: row.color,
			width: row.width,
			position: row.position
		});
	}

	if (mutations.upsertTasks.length) {
		await upsertProjectTasks(projectId, mutations.upsertTasks);
	}

	if (mutations.deleteTaskIds.length) {
		await deleteByProjectAndClientIds('project_tasks', projectId, mutations.deleteTaskIds);
	}

	if (mutations.deleteColumnIds.length) {
		await deleteByProjectAndClientIds('project_columns', projectId, mutations.deleteColumnIds);
	}

	void projectPbId;
};

const findProjectName = (projectRows: ProjectRow[], projectId: string) =>
	projectRows.find((project) => project.id === projectId)?.name;

const workspaceFetchByUser = new Map<
	string,
	Promise<Awaited<ReturnType<typeof loadWorkspaceFromRemote>>>
>();

const loadWorkspaceFromRemote = async (userId: string) => {
	const pb = getPb();

	const ownMembershipRecords = await pb.collection('project_memberships').getFullList({
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
		const projectRecords = await pb.collection('projects').getFullList({
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
			? pb.collection('projects').getFullList({
					filter: accessibleProjectIds
						.map((id) => `client_id = "${pbEscapeFilter(id)}"`)
						.join(' || '),
					...pbNoAutoCancel
				})
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds('project_memberships', accessibleProjectIds)
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds('project_boards', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds('project_pages', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds('project_columns', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? listByProjectIds('project_tasks', accessibleProjectIds, 'position')
			: Promise.resolve([]),
		accessibleProjectIds.length
			? pb.collection('project_user_state').getFullList({
					filter: `user = "${pbEscapeFilter(userId)}" && (${accessibleProjectIds
						.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
						.join(' || ')})`,
					expand: 'project',
					...pbNoAutoCancel
				})
			: Promise.resolve([]),
		accessibleProjectIds.length
			? pb.collection('project_ai_sessions').getFullList({
					filter: `user = "${pbEscapeFilter(userId)}" && (${accessibleProjectIds
						.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
						.join(' || ')})`,
					sort: '-last_message_at',
					expand: 'project',
					...pbNoAutoCancel
				})
			: Promise.resolve([]),
		pb.collection('project_invites').getFullList({
			filter: `invitee = "${pbEscapeFilter(userId)}" && status = "pending"`,
			expand: 'project',
			...pbNoAutoCancel
		})
	]);

	for (const record of projectRecords) {
		projectClientByPbId.set(String(record.id), String(record.client_id || record.id));
	}

	const projectRows = projectRecords.map((record) => mapProjectRecord(record));
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
	const aiSessionRows = aiSessionRecords.map((record) => {
		const projectClientId = String(
			(record.expand as { project?: { client_id?: string } })?.project?.client_id || record.project
		);
		return mapAiSessionRecord(record, projectClientId);
	});

	const ownedProjectIds = projectRows
		.filter((project) => project.user_id === userId)
		.map((project) => project.id);

	const ownerInviteRecords = ownedProjectIds.length
		? await pb.collection('project_invites').getFullList({
				filter: `status = "pending" && (${ownedProjectIds
					.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
					.join(' || ')})`,
				expand: 'project',
				...pbNoAutoCancel
			})
		: [];

	const profileIds = [...new Set(allMembershipRows.map((membership) => membership.user_id))];
	const profileRows: Pick<ProfileRow, 'user_id' | 'email' | 'username'>[] = [];
	if (profileIds.length) {
		const profiles = await pb.collection('users').getFullList({
			filter: profileIds.map((id) => `id = "${pbEscapeFilter(id)}"`).join(' || '),
			...pbNoAutoCancel
		});
		for (const profile of profiles) {
			const mapped = mapProfileRecord(profile, String(profile.id));
			profileRows.push({
				user_id: mapped.user_id,
				email: mapped.email,
				username: mapped.username
			});
		}
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
				viewerLastOpenedAt: new Date(ownMembership.last_opened_at).getTime(),
				viewerPinnedAt: ownMembership.pinned_at
					? new Date(ownMembership.pinned_at).getTime()
					: undefined
			});
			return [
				normalizedProject satisfies Project
			];
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

	return {
		projects,
		incomingInvites
	};
};

export const invalidateWorkspaceFetch = (userId: string) => {
	workspaceFetchByUser.delete(userId);
};

export const fetchWorkspace = async (
	userId: string,
	options?: {
		/** Bypass in-flight dedupe so callers see writes that finished just before this fetch. */
		fresh?: boolean;
	}
) => {
	if (options?.fresh) {
		const inflight = workspaceFetchByUser.get(userId);
		if (inflight) {
			try {
				await inflight;
			} catch {
				// A stale in-flight fetch may fail; the reload below is authoritative.
			}
		}
		invalidateWorkspaceFetch(userId);
	} else {
		const inflight = workspaceFetchByUser.get(userId);
		if (inflight) return inflight;
	}

	const promise = loadWorkspaceFromRemote(userId).finally(() => {
		if (workspaceFetchByUser.get(userId) === promise) {
			workspaceFetchByUser.delete(userId);
		}
	});
	workspaceFetchByUser.set(userId, promise);
	return promise;
};

export const createProject = async (
	userId: string,
	name = 'New Project',
	seedProject?: Partial<Project>,
	options?: {
		/** Skip the post-create workspace reload (batch restore does one fresh fetch at the end). */
		skipWorkspaceFetch?: boolean;
	}
) => {
	const seedBase = normalizeProjectStructure(EMPTY_PROJECT(userId, name));
	const seedInput = seedProject || {};
	const seed = normalizeProjectStructure({
		...seedBase,
		...seedInput,
		id: createId(),
		name: seedInput.name || name,
		ownerUserId: userId,
		accessRole: 'owner' as const,
		boards: seedInput.boards?.length ? seedInput.boards : seedBase.boards,
		pages: seedInput.pages?.length ? seedInput.pages : seedBase.pages
	});
	const normalizedSeed = normalizeProjectStructure(seed as Project);

	const pb = getPb();
	const projectRecord = await pb.collection('projects').create({
		client_id: normalizedSeed.id,
		owner: userId,
		name: normalizedSeed.name,
		background_theme: normalizedSeed.backgroundTheme,
		scratchpad_data: serializeScratchpadData(normalizedSeed.scratchpadData),
		scratchpad_rev: normalizedSeed.scratchpadRev,
		last_opened_at: new Date(normalizedSeed.viewerLastOpenedAt).toISOString()
	});

	try {
		await pb.collection('project_memberships').create({
			project: projectRecord.id,
			user: userId,
			role: 'owner',
			joined_at: new Date().toISOString(),
			last_opened_at: new Date().toISOString()
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const alreadyExists =
			message.includes('UNIQUE') ||
			message.includes('unique') ||
			message.includes('validation_not_unique');
		if (!alreadyExists) {
			throw error;
		}
	}

	for (const board of normalizedSeed.boards) {
		await pb.collection('project_boards').create({
			project: projectRecord.id,
			client_id: board.id,
			name: board.name,
			position: board.position
		});
	}

	for (const page of normalizedSeed.pages) {
		await pb.collection('project_pages').create({
			project: projectRecord.id,
			client_id: page.id,
			name: page.name,
			content: page.content,
			position: page.position
		});
	}

	for (const board of normalizedSeed.boards) {
		await applyBoardMutations(
			normalizedSeed.id,
			deriveBoardMutations(normalizedSeed.id, board.id, [], board.kanbanData)
		);
	}
	invalidateWorkspaceFetch(userId);
	await saveProjectAiState(
		normalizedSeed.id,
		userId,
		normalizedSeed.aiSessions,
		normalizedSeed.activeAiSessionId
	);
	try {
		await touchProjectLastOpened(normalizedSeed.id);
	} catch (error) {
		console.error('[kainbu] touchProjectLastOpened failed after createProject', {
			projectId: normalizedSeed.id,
			error
		});
	}

	if (options?.skipWorkspaceFetch) {
		return normalizedSeed;
	}

	const workspace = await fetchWorkspace(userId, { fresh: true });
	return workspace.projects.find((project) => project.id === normalizedSeed.id) || normalizedSeed;
};

export const renameProject = async (projectId: string, nextName: string) => {
	const pb = getPb();
	const project = await pb.collection('projects').getFirstListItem(projectClientFilter(projectId));
	await pb.collection('projects').update(project.id, { name: nextName });
};

export const fetchProjectBoardKanban = async (
	projectId: string,
	boardId: string
): Promise<Project['kanbanData']> => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);
	const [columnRecords, taskRecords] = await Promise.all([
		pb.collection('project_columns').getFullList({
			filter: `${projectRelationFilter(projectPbId)} && board.client_id = "${pbEscapeFilter(boardId)}"`,
			sort: 'position',
			...pbNoAutoCancel
		}),
		pb.collection('project_tasks').getFullList({
			filter: `${projectRelationFilter(projectPbId)} && board.client_id = "${pbEscapeFilter(boardId)}"`,
			sort: 'position',
			...pbNoAutoCancel
		})
	]);

	return buildKanbanData(
		columnRecords.map((record) => mapColumnRecord(record, projectId, boardId)),
		taskRecords.map((record) => mapTaskRecord(record, projectId, boardId))
	);
};

export const fetchProjectScratchpadMeta = async (projectId: string) => {
	const pb = getPb();
	const data = await pb.collection('projects').getFirstListItem(projectClientFilter(projectId));

	return {
		id: String(data.client_id || data.id),
		name: String(data.name || ''),
		scratchpadData: normalizeScratchpadData(data.scratchpad_data),
		scratchpadRev: typeof data.scratchpad_rev === 'number' ? data.scratchpad_rev : 0
	};
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
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);
	const clientId = createId();
	const data = await pb.collection('project_boards').create({
		project: projectPbId,
		client_id: clientId,
		name,
		position
	});
	return mapBoardRow(mapBoardRecord(data, projectId), [], []);
};

export const createProjectPage = async (
	projectId: string,
	name: string,
	position: number,
	options?: { clientId?: string; content?: string }
) => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);
	const clientId = options?.clientId?.trim() || createId();
	const data = await pb.collection('project_pages').create({
		project: projectPbId,
		client_id: clientId,
		name,
		content: sanitizeProjectPageContent(options?.content ?? ''),
		position
	});
	return mapPageRow(mapPageRecord(data, projectId));
};

const updateProjectChildByClientId = async (
	collection: string,
	projectId: string,
	clientId: string,
	body: Record<string, unknown>
) => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);
	const record = await pb
		.collection(collection)
		.getFirstListItem(
			`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(clientId)}"`
		);
	await pb.collection(collection).update(record.id, body);
};

const deleteProjectChildByClientId = async (
	collection: string,
	projectId: string,
	clientId: string
) => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);
	const record = await pb
		.collection(collection)
		.getFirstListItem(
			`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(clientId)}"`
		);
	await pb.collection(collection).delete(record.id);
};

export const renameProjectBoard = async (projectId: string, boardId: string, name: string) => {
	await updateProjectChildByClientId('project_boards', projectId, boardId, { name });
};

export const deleteProjectBoard = async (projectId: string, boardId: string) => {
	await deleteProjectChildByClientId('project_boards', projectId, boardId);
};

export const renameProjectPage = async (projectId: string, pageId: string, name: string) => {
	await updateProjectChildByClientId('project_pages', projectId, pageId, { name });
};

export const deleteProjectPage = async (projectId: string, pageId: string) => {
	await deleteProjectChildByClientId('project_pages', projectId, pageId);
};

export const sanitizeProjectPageContent = (content: unknown) => {
	if (typeof content !== 'string') return '';
	return content.replace(/\0/g, '').slice(0, 500_000);
};

export const updateProjectPageContent = async (
	projectId: string,
	pageId: string,
	content: string
) => {
	await updateProjectChildByClientId('project_pages', projectId, pageId, {
		content: sanitizeProjectPageContent(content)
	});
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
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);

	try {
		const userState = await pb.collection('project_user_state').getFirstListItem(
			`${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`
		);
		await pb.collection('project_user_state').update(userState.id, {
			active_ai_session_id: activeAiSessionId
		});
	} catch {
		await pb.collection('project_user_state').create({
			project: projectPbId,
			user: userId,
			active_ai_session_id: activeAiSessionId,
			chat_history: []
		});
	}

	const normalizedSessions = aiSessions.length
		? aiSessions
		: [
				{
					...EMPTY_PROJECT(userId).aiSessions[0],
					projectId
				}
			];

	for (const session of normalizedSessions) {
		const row = mapAiSessionUpsertRow(projectId, userId, session);
		await upsertProjectChild('project_ai_sessions', projectId, session.id, {
			user: userId,
			title: row.title,
			model_id: row.model_id,
			history: row.history,
			last_message_at: row.last_message_at
		});
	}

	const existingSessions = await pb.collection('project_ai_sessions').getFullList({
		filter: `${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`,
		...pbNoAutoCancel
	});
	const nextSessionIds = new Set(normalizedSessions.map((session) => session.id));
	const staleSessions = existingSessions.filter(
		(session) => !nextSessionIds.has(String(session.client_id || session.id))
	);
	await Promise.all(
		staleSessions.map((session) => pb.collection('project_ai_sessions').delete(session.id))
	);
};

export const touchProjectLastOpened = async (projectId: string) => {
	await invokeWorkspaceApi('/api/workspace/projects/touch', {
		body: {
			projectId
		}
	});
};

export const reportBoardPresence = async (projectId: string, boardId: string | null) => {
	const now = new Date().toISOString();
	const normalizedBoardId = boardId?.trim() || '';

	try {
		await invokeWorkspaceApi('/api/workspace/boards/presence', {
			body: {
				projectId,
				boardId: normalizedBoardId || null
			}
		});
		return;
	} catch (apiError) {
		const pb = getPb();
		const userId = pb.authStore.model?.id;
		if (!userId) throw apiError;

		try {
			const membership = await pb.collection('project_memberships').getFirstListItem(
				`user = "${pbEscapeFilter(userId)}" && project.client_id = "${pbEscapeFilter(projectId)}"`
			);
			await pb.collection('project_memberships').update(membership.id, {
				last_opened_at: now,
				viewing_board_client_id: normalizedBoardId,
				presence_at: normalizedBoardId ? now : ''
			});
		} catch (directError) {
			console.error('[kainbu] board presence API and direct PocketBase update failed', {
				apiError,
				directError
			});
			throw apiError;
		}
	}
};

export const setProjectPinned = async (projectId: string, pinned: boolean) => {
	await invokeWorkspaceApi('/api/workspace/projects/pin', {
		body: {
			projectId,
			pinned
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
	const pb = getPb();
	const project = await pb.collection('projects').getFirstListItem(projectClientFilter(projectId));
	await pb.collection('projects').delete(project.id);
};

export const fetchUserSettings = async (userId: string) => {
	const pb = getPb();
	const data = await pb.collection('users').getOne(userId);
	return mapSettingsRow(mapProfileRecord(data, userId));
};

export const fetchUserProfile = async (userId: string) => {
	const pb = getPb();
	const data = await pb.collection('users').getOne(userId);
	return mapProfileRow(
		{
			user_id: userId,
			email: typeof data.email === 'string' ? data.email : null,
			username: typeof data.username === 'string' ? data.username : null
		},
		userId
	);
};

export const checkUsernameAvailability = async (username: string) => {
	const pb = getPb();
	const authUser = pb.authStore.model;
	const filter = `username = "${pbEscapeFilter(username)}"${
		authUser?.id ? ` && id != "${pbEscapeFilter(authUser.id)}"` : ''
	}`;
	try {
		await pb.collection('users').getFirstListItem(filter);
		return false;
	} catch {
		return true;
	}
};

export const updateUsername = async (userId: string, username: string) => {
	const pb = getPb();
	const data = await pb.collection('users').update(userId, { username });
	return mapProfileRow(
		{
			user_id: userId,
			email: typeof data.email === 'string' ? data.email : null,
			username: typeof data.username === 'string' ? data.username : null
		},
		userId
	);
};

export const upsertUserSettings = async (userId: string, settings: UserSettings) => {
	const pb = getPb();
	await pb.collection('users').update(userId, {
		default_show_checkbox: settings.defaultShowCheckbox,
		preferred_ai_model_id: settings.preferredAiModelId,
		background_theme: settings.backgroundTheme
	});
};

export const subscribeToWorkspaceChanges = (_userId: string, onChange: () => void) => {
	const pb = getPb();
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	const debounced = () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => onChange(), 250);
	};

	const collections = [
		'projects',
		'project_memberships',
		'project_invites',
		'project_boards',
		'project_pages',
		'project_columns',
		'project_tasks',
		'project_user_state',
		'project_ai_sessions'
	];

	const unsubscribers: Array<() => void> = [];
	void (async () => {
		for (const collection of collections) {
			if (disposed) return;
			try {
				const unsubscribe = await pb.collection(collection).subscribe('*', debounced);
				unsubscribers.push(unsubscribe);
			} catch (error) {
				console.warn(`[kainbu] realtime subscribe failed for ${collection}`, error);
			}
			await new Promise((resolve) => setTimeout(resolve, 40));
		}
	})();

	return () => {
		disposed = true;
		if (debounceTimer) clearTimeout(debounceTimer);
		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
	};
};
