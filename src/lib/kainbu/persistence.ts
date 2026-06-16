import { getUserAvatarUrl } from '$lib/kainbu/avatar';
import {
	DEFAULT_AI_SESSION_TITLE,
	DEFAULT_CHAT_HISTORY,
	DEFAULT_COLUMN_WIDTH,
	EMPTY_PROJECT
} from '$lib/kainbu/constants';
import { DEFAULT_AI_MODEL_ID } from '$lib/kainbu/models';
import { normalizeBoardPreferences } from '$lib/kainbu/boardPreferences';
import { normalizeNullableBackgroundTheme } from '$lib/kainbu/backgrounds';
import { invokeWorkspaceApi } from '$lib/kainbu/workspaceApi';
import { createId } from '$lib/kainbu/id';
import { normalizeProjectStructure } from '$lib/kainbu/projectStructure';
import { normalizeScratchpadData, serializeScratchpadData } from '$lib/kainbu/scratchpad';
import { normalizeUserSettings } from '$lib/kainbu/settings';
import { pbNoAutoCancel } from '$lib/kainbu/pbRequest';
import { isPocketBaseNotFound, isProjectPagesStrayIdFieldError } from '$lib/pocketbaseErrors';
import { syncBoardWithPb } from '$lib/kainbu/boardSyncCore';
import { normalizeDueTimestamp } from '$lib/kainbu/timing';
import { getPb } from '$lib/kainbu/pocketbaseContext';
import { mapMembershipRow, mapInviteRow, compareProjects, findProjectName } from '$lib/kainbu/workspaceMapping';
import { fetchSharedMemberProfiles } from '$lib/kainbu/memberProfiles';
import {
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
	AiProgressEventKind,
	AiProposal,
	ProposalTarget
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

const isProposalTarget = (value: unknown): value is ProposalTarget =>
	value === 'kanban' || value === 'scratchpad';

const normalizeStagedProposals = (value: unknown): AiProposal[] | undefined => {
	if (!Array.isArray(value)) return undefined;

	const proposals = value.flatMap((entry) => {
		if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id.trim()) return [];
		if (!isProposalTarget(entry.target) || !isObject(entry.preview)) return [];

		if (entry.target === 'kanban') {
			const preview = entry.preview;
			if (!Array.isArray(preview.kanbanData)) return [];
		} else if (!isObject(entry.preview.scratchpadState)) {
			return [];
		}

		return [entry as unknown as AiProposal];
	});

	return proposals.length ? proposals : undefined;
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
	const modelId =
		typeof value.modelId === 'string' && value.modelId.trim() ? value.modelId : undefined;
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
		const stagedProposals = normalizeStagedProposals(entry.stagedProposals);
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
				...(stagedProposals?.length ? { stagedProposals } : {}),
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
	contextSummary: row.context_summary ?? undefined,
	summarizedUpToMessageId: row.summarized_up_to_message_id ?? null,
	...(typeof row.context_tokens === 'number' ? { contextTokens: row.context_tokens } : {}),
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
					backgroundTheme: row.background_theme,
					colorMode: row.color_mode
				}
			: null
	);

const normalizeUsernameValue = (value: string | null | undefined) =>
	typeof value === 'string' && value.trim().length ? value.trim() : null;

const mapProfileRow = (
	row: Pick<ProfileRow, 'user_id' | 'email' | 'username' | 'avatar_url'> | null,
	userId: string
): UserProfile => ({
	userId: row?.user_id || userId,
	email: row?.email || null,
	username: normalizeUsernameValue(row?.username),
	avatarUrl: row?.avatar_url ?? null
});

const normalizeLinkedTaskIds = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
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
	preferences: normalizeBoardPreferences(row.preferences),
	shareSlug: row.share_slug ?? null,
	sharePublic: row.share_public === true,
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

const mapAiSessionUpsertRow = (projectId: string, userId: string, session: ProjectAiSession) => ({
	id: session.id,
	project_id: projectId,
	user_id: userId,
	title: session.title,
	model_id: normalizeAiModelId(session.modelId),
	history: session.history,
	context_summary: session.contextSummary ?? null,
	summarized_up_to_message_id: session.summarizedUpToMessageId ?? null,
	context_tokens: typeof session.contextTokens === 'number' ? session.contextTokens : null,
	created_at: new Date(session.createdAt).toISOString(),
	updated_at: new Date(session.updatedAt).toISOString(),
	last_message_at: new Date(session.lastMessageAt).toISOString()
});

const workspaceFetchByUser = new Map<
	string,
	Promise<Awaited<ReturnType<typeof fetchWorkspaceFromApi>>>
>();

const fetchWorkspaceFromApi = async (userId: string) => {
	return invokeWorkspaceApi<{
		projects: Project[];
		incomingInvites: ProjectInvite[];
	}>('/api/workspace/snapshot', { method: 'GET' });
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

	const promise = fetchWorkspaceFromApi(userId).finally(() => {
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
			position: board.position,
			preferences: normalizeBoardPreferences(board.preferences)
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
		await syncBoardWithPb(getPb(), normalizedSeed.id, board.id, [], board.kanbanData);
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
	await syncBoardWithPb(getPb(), projectId, boardId, previous, next);
};

export const replaceProjectBoard = async (
	projectId: string,
	boardId: string,
	next: Project['kanbanData']
) => {
	await syncBoardWithPb(getPb(), projectId, boardId, [], next);
};

export const createProjectBoard = async (projectId: string, name: string, position: number) => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectId);
	const clientId = createId();
	const data = await pb.collection('project_boards').create({
		project: projectPbId,
		client_id: clientId,
		name,
		position,
		preferences: normalizeBoardPreferences(undefined)
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
	const body = {
		project: projectPbId,
		client_id: clientId,
		name,
		content: sanitizeProjectPageContent(options?.content ?? ''),
		position
	};

	let data;
	try {
		data = await pb.collection('project_pages').create(body);
	} catch (error) {
		if (!isProjectPagesStrayIdFieldError(error)) throw error;
		data = await pb.collection('project_pages').create({ ...body, id: clientId });
	}

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
	let recordId: string;
	try {
		const record = await pb
			.collection(collection)
			.getFirstListItem(
				`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(clientId)}"`
			);
		recordId = record.id;
	} catch (error) {
		if (isPocketBaseNotFound(error)) return;
		throw error;
	}

	try {
		await pb.collection(collection).delete(recordId);
	} catch (error) {
		if (isPocketBaseNotFound(error)) return;
		throw error;
	}
};

export const renameProjectBoard = async (projectId: string, boardId: string, name: string) => {
	await updateProjectChildByClientId('project_boards', projectId, boardId, { name });
};

export const updateProjectBoardPreferences = async (
	projectId: string,
	boardId: string,
	preferences: ProjectBoard['preferences']
) => {
	await updateProjectChildByClientId('project_boards', projectId, boardId, {
		preferences: normalizeBoardPreferences(preferences)
	});
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
		const userState = await pb
			.collection('project_user_state')
			.getFirstListItem(
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
			const membership = await pb
				.collection('project_memberships')
				.getFirstListItem(
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
	const pinnedAt = pinned ? new Date().toISOString() : '';

	try {
		await invokeWorkspaceApi('/api/workspace/projects/pin', {
			body: {
				projectId,
				pinned
			}
		});
		return;
	} catch (apiError) {
		const pb = getPb();
		const userId = pb.authStore.model?.id;
		if (!userId) throw apiError;

		try {
			const membership = await pb
				.collection('project_memberships')
				.getFirstListItem(
					`user = "${pbEscapeFilter(userId)}" && project.client_id = "${pbEscapeFilter(projectId)}"`
				);
			await pb.collection('project_memberships').update(membership.id, {
				pinned_at: pinnedAt
			});
		} catch (directError) {
			console.error('[kainbu] project pin API and direct PocketBase update failed', {
				apiError,
				directError
			});
			throw apiError;
		}
	}
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
	return invokeWorkspaceApi<{
		ok: boolean;
		emailSent?: boolean;
		emailConfigured?: boolean;
		emailError?: string;
	}>('/api/workspace/invites/create', {
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
	const avatarUrl = getUserAvatarUrl(data);
	return mapProfileRow(
		{
			user_id: userId,
			email: typeof data.email === 'string' ? data.email : null,
			username: typeof data.username === 'string' ? data.username : null,
			avatar_url: avatarUrl
		},
		userId
	);
};

export const uploadUserAvatar = async (userId: string, file: File) => {
	const pb = getPb();
	const data = await pb.collection('users').update(userId, { avatar: file });
	const avatarUrl = getUserAvatarUrl(data);
	return mapProfileRow(
		{
			user_id: userId,
			email: typeof data.email === 'string' ? data.email : null,
			username: typeof data.username === 'string' ? data.username : null,
			avatar_url: avatarUrl
		},
		userId
	);
};

export const removeUserAvatar = async (userId: string) => {
	const pb = getPb();
	const data = await pb.collection('users').update(userId, { avatar: null });
	return mapProfileRow(
		{
			user_id: userId,
			email: typeof data.email === 'string' ? data.email : null,
			username: typeof data.username === 'string' ? data.username : null,
			avatar_url: null
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
	const avatarUrl = getUserAvatarUrl(data);
	return mapProfileRow(
		{
			user_id: userId,
			email: typeof data.email === 'string' ? data.email : null,
			username: typeof data.username === 'string' ? data.username : null,
			avatar_url: avatarUrl
		},
		userId
	);
};

export const upsertUserSettings = async (userId: string, settings: UserSettings) => {
	const pb = getPb();
	const payload = {
		default_show_checkbox: settings.defaultShowCheckbox,
		preferred_ai_model_id: settings.preferredAiModelId,
		background_theme: settings.backgroundTheme,
		color_mode: settings.colorMode
	};

	try {
		await pb.collection('users').update(userId, payload);
	} catch (error) {
		const { color_mode: _colorMode, ...withoutColorMode } = payload;
		if (_colorMode) {
			try {
				await pb.collection('users').update(userId, withoutColorMode);
				return;
			} catch {
				// fall through to original error
			}
		}
		throw error;
	}
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
