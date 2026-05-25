export type AiModelId = string;
export type AiThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiThinkingConfig {
	type: 'enabled';
	budget_tokens: number;
	temperature?: number;
	level?: Exclude<AiThinkingLevel, 'none'>;
}
export type WorkspaceTab = 'dashboard' | 'kanban' | 'scratchpad' | 'chat' | 'settings';
export type SettingsSection = 'account' | 'appearance';
export type SyncStatus = 'idle' | 'local' | 'syncing' | 'synced' | 'error';
export type UsernameAvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
export type WorkspaceAction = 'kanban' | 'scratchpad' | 'highlights' | 'question';
export type ProposalTarget = 'kanban' | 'scratchpad';
export type ProposalScope = 'task' | 'column' | 'board' | 'pad' | 'scratchpad';
export type BoundTargetKind = 'task' | 'column' | 'pad' | 'none';
export type BoundTargetSource =
	| 'open_task'
	| 'queued_card'
	| 'selected_column'
	| 'active_pad'
	| 'resolved_name'
	| 'none';
export type ProjectAccessRole = 'owner' | 'member';
export type ProjectInviteStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type BackgroundTheme =
	| {
			kind: 'gradient';
			id: string;
	  }
	| {
			kind: 'solid';
			id: string;
	  }
	| {
			kind: 'image';
			path: string;
	  };

export interface Tag {
	id: string;
	label: string;
	color: string;
}

export interface Task {
	id: string;
	title: string;
	description?: string;
	color?: string;
	tags: Tag[];
	hasCheckbox?: boolean;
	checked?: boolean;
	completedAt?: number;
	countdownAt?: number;
	alarmAt?: number;
	assignedTo?: string;
	linkedTaskIds?: string[];
	createdAt?: number;
	updatedAt?: number;
}

export type TaskAssetKind = 'attachment' | 'embed';

export interface TaskAsset {
	id: string;
	projectId: string;
	taskId: string;
	kind: TaskAssetKind;
	name: string;
	mimeType: string;
	sizeBytes: number;
	storagePath: string;
	uploadedByUserId: string;
	createdAt: number;
}

export interface TaskComment {
	id: string;
	projectId: string;
	taskId: string;
	body: string;
	authorUserId: string;
	createdAt: number;
	updatedAt: number;
}

export interface Column {
	id: string;
	title: string;
	color?: string;
	width?: number;
	tasks: Task[];
}

export type KanbanData = Column[];

export interface ScratchpadPad {
	id: string;
	name: string;
	content: string;
}

export interface ScratchpadData {
	activePadId: string;
	pads: ScratchpadPad[];
}

export interface ChatAttachment {
	id: string;
	kind: 'image' | 'text';
	name: string;
	mimeType: string;
	content: string;
}

export interface ChatTaskCard {
	id: string;
	taskId: string;
	columnId: string;
	columnTitle: string;
	title: string;
	description?: string;
	tags: Tag[];
	checked?: boolean;
}

export interface MessageMetadata {
	modelId?: AiModelId;
	model: string;
	latencyMs: number;
	requestId?: string;
	tokens?: number;
}

export interface AiModelConfig {
	id: AiModelId;
	model: string;
	thinking: AiThinkingConfig | null;
	allowedThinkingLevels: AiThinkingLevel[];
	defaultThinkingLevel: AiThinkingLevel;
}

export interface CitationAnnotation {
	type?: string;
	title?: string;
	url?: string;
	siteName?: string;
	content?: string;
	startIndex?: number;
	endIndex?: number;
}

export interface AiUsage {
	modelTurnsUsed: number;
	modelTurnsMax: number;
	toolCallsUsed: number;
	toolCallsMax: number;
	kanbanReadsUsed: number;
	kanbanReadsMax: number;
	scratchpadReadsUsed: number;
	scratchpadReadsMax: number;
	capReached?: boolean;
}

export type AiProgressEventKind =
	| 'status'
	| 'thinking'
	| 'tool_call'
	| 'tool_result'
	| 'assistant_draft';

export interface AiProgressEvent {
	id: string;
	kind: AiProgressEventKind;
	message: string;
	detail?: string;
	timestamp: number;
}

export interface AiQuestionOption {
	id: string;
	label: string;
	description?: string;
}

export interface AiQuestion {
	id: string;
	prompt: string;
	options: AiQuestionOption[];
	allowFreeform?: boolean;
	reason?: string;
	status: 'open' | 'answered';
	answeredOptionId?: string;
	answerText?: string;
	answeredAt?: number;
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	text: string;
	timestamp: number;
	attachments?: ChatAttachment[];
	taskCards?: ChatTaskCard[];
	metadata?: MessageMetadata;
	annotations?: CitationAnnotation[];
	toolActions?: WorkspaceAction[];
	progressEvents?: AiProgressEvent[];
	question?: AiQuestion;
	usage?: AiUsage;
	stoppedReason?: string;
}

export interface ProjectMembership {
	projectId: string;
	userId: string;
	role: ProjectAccessRole;
	email?: string;
	username?: string | null;
	joinedAt: number;
	lastOpenedAt: number;
	viewingBoardId?: string;
	presenceAt?: number;
	isCurrentUser?: boolean;
}

export interface ProjectInvite {
	id: string;
	projectId: string;
	inviteeUserId: string;
	inviteeEmail: string;
	invitedByUserId: string;
	status: ProjectInviteStatus;
	projectName?: string;
	createdAt: number;
	updatedAt: number;
	respondedAt?: number;
}

export interface ProjectBoard {
	id: string;
	projectId: string;
	name: string;
	position: number;
	kanbanData: KanbanData;
	createdAt: number;
	updatedAt: number;
}

export interface ProjectPage {
	id: string;
	projectId: string;
	name: string;
	content: string;
	position: number;
	createdAt: number;
	updatedAt: number;
}

export interface ProjectAiSession {
	id: string;
	projectId: string;
	title: string;
	modelId: AiModelId;
	history: ChatMessage[];
	createdAt: number;
	updatedAt: number;
	lastMessageAt: number;
}

export interface ProjectUserState {
	projectId: string;
	userId: string;
	activeAiSessionId?: string;
	updatedAt: number;
}

export interface Project {
	id: string;
	ownerUserId: string;
	accessRole: ProjectAccessRole;
	name: string;
	backgroundTheme: BackgroundTheme | null;
	boards: ProjectBoard[];
	pages: ProjectPage[];
	activeBoardId: string;
	activePageId: string;
	kanbanData: KanbanData;
	scratchpadData: ScratchpadData;
	scratchpadRev: number;
	aiSessions: ProjectAiSession[];
	activeAiSessionId: string;
	chatHistory: ChatMessage[];
	members: ProjectMembership[];
	invites: ProjectInvite[];
	createdAt: number;
	updatedAt: number;
	viewerLastOpenedAt: number;
	viewerPinnedAt?: number;
}

export interface DashboardTimedTask {
	projectId: string;
	projectName: string;
	accessRole: ProjectAccessRole;
	columnId: string;
	columnTitle: string;
	task: Task;
	dueAt: number;
}

export interface UserSettings {
	defaultShowCheckbox: boolean;
	preferredAiModelId: AiModelId;
	backgroundTheme: BackgroundTheme;
}

export interface UserProfile {
	userId: string;
	email: string | null;
	username: string | null;
}

export interface ProjectRevisionState {
	kanban: number;
	scratchpad: number;
}

export interface WorkspaceSummary {
	columnCount: number;
	taskCount: number;
	padCount: number;
	memberCount: number;
	kanbanFullAllowed: boolean;
	scratchpadAllAllowed: boolean;
}

export interface BoundTarget {
	kind: BoundTargetKind;
	id?: string;
	source: BoundTargetSource;
	locked: boolean;
}

export interface AiScopeHint {
	currentTab: WorkspaceTab;
	selectedTaskIds: string[];
	selectedColumnIds: string[];
	activeBoardId?: string;
	activeTaskId?: string;
	activeColumnId?: string;
	activePadId: string;
	clientNowIso?: string;
	clientTimezone?: string;
	boundTarget?: BoundTarget;
	queuedTaskCards: ChatTaskCard[];
	revisions: ProjectRevisionState;
	workspaceSummary: WorkspaceSummary;
	activeViewContent?: {
		kind: 'board' | 'page' | 'none';
		name: string;
		content: string;
	};
}

export interface AiQuestionAnswer {
	questionId: string;
	optionId?: string;
	text?: string;
}

export interface AiTagInput {
	id?: string;
	label: string;
	color?: string;
}

export interface AiTaskDraft {
	id?: string;
	title: string;
	description?: string;
	color?: string;
	tags?: AiTagInput[];
	hasCheckbox?: boolean;
	checked?: boolean;
	countdownAt?: number | null;
	assignedTo?: string | null;
}

export interface AiTaskUpdate {
	title?: string;
	description?: string;
	color?: string | null;
	tags?: AiTagInput[];
	hasCheckbox?: boolean;
	checked?: boolean;
	countdownAt?: number | null;
	assignedTo?: string | null;
}

export interface AiColumnDraft {
	id?: string;
	title: string;
	color?: string;
	width?: number;
}

export interface AiColumnUpdate {
	title?: string;
	color?: string | null;
	width?: number;
}

export type KanbanPatchOperation =
	| {
			type: 'add_column';
			column: AiColumnDraft;
			index?: number;
	  }
	| {
			type: 'update_column';
			columnId: string;
			fields: AiColumnUpdate;
	  }
	| {
			type: 'delete_column';
			columnId: string;
	  }
	| {
			type: 'reorder_columns';
			columnIds: string[];
	  }
	| {
			type: 'add_task';
			columnId: string;
			task: AiTaskDraft;
			index?: number;
	  }
	| {
			type: 'update_task';
			taskId: string;
			fields: AiTaskUpdate;
	  }
	| {
			type: 'move_task';
			taskId: string;
			targetColumnId: string;
			index?: number;
	  }
	| {
			type: 'delete_task';
			taskId: string;
	  }
	| {
			type: 'reorder_tasks';
			columnId: string;
			taskIds: string[];
	  };

export type ScratchpadPatchOperation =
	| {
			type: 'create_pad';
			pad?: {
				id?: string;
				name?: string;
				content?: string;
			};
			index?: number;
	  }
	| {
			type: 'rename_pad';
			padId: string;
			name: string;
	  }
	| {
			type: 'delete_pad';
			padId: string;
	  }
	| {
			type: 'set_active_pad';
			padId: string;
	  }
	| {
			type: 'replace_pad_content';
			padId: string;
			content: string;
	  }
	| {
			type: 'replace_pad_lines';
			padId: string;
			startLine: number;
			deleteCount: number;
			lines: string[];
	  };

export interface AiProposalSafety {
	touchedTaskIds: string[];
	touchedColumnIds: string[];
	touchedPadIds?: string[];
	moveCount: number;
	deleteCount: number;
	reorderCount: number;
	outOfScope: boolean;
}

export interface AiKanbanProposal {
	id: string;
	target: 'kanban';
	summary: string;
	scope: Extract<ProposalScope, 'task' | 'column' | 'board'>;
	editCallCount: number;
	ops: KanbanPatchOperation[];
	proposalSafety: AiProposalSafety;
	preview: {
		kanbanData: KanbanData;
	};
	baseRevision: number;
	baseFingerprint: string;
}

export interface AiScratchpadProposal {
	id: string;
	target: 'scratchpad';
	summary: string;
	scope: Extract<ProposalScope, 'pad' | 'scratchpad'>;
	editCallCount: number;
	ops: ScratchpadPatchOperation[];
	proposalSafety: AiProposalSafety;
	preview: {
		scratchpadState: ScratchpadData;
	};
	baseRevision: number;
	baseFingerprint: string;
	padId?: string;
}

export type AiProposal = AiKanbanProposal | AiScratchpadProposal;

export type PendingProposal =
	| (AiKanbanProposal & {
			projectId: string;
			stale: boolean;
			originalKanbanData: KanbanData;
	  })
	| (AiScratchpadProposal & {
			projectId: string;
			stale: boolean;
			originalScratchpadState: ScratchpadData;
	  });

export interface AiWorkspaceRequest {
	projectId: string;
	sessionId: string;
	modelId: AiModelId;
	thinkingLevel?: AiThinkingLevel;
	history: ChatMessage[];
	scope: AiScopeHint;
	continuation?: AiQuestionAnswer;
}

export interface AiWorkspaceResponse {
	reply: string;
	modelId: AiModelId;
	model: string;
	latencyMs: number;
	requestId: string;
	question?: AiQuestion;
	proposals: AiProposal[];
	usage: AiUsage;
	highlightedTaskIds: string[];
	annotations: CitationAnnotation[];
	toolActions: WorkspaceAction[];
	stoppedReason?: string;
}

export type AiWorkspaceStreamEvent =
	| {
			type: 'progress';
			progress: AiProgressEvent;
	  }
	| {
			type: 'final';
			response: AiWorkspaceResponse;
	  }
	| {
			type: 'error';
			error: string;
	  };

export interface ProjectBackupFile {
	version: 1 | 2;
	projects: unknown[];
}

export interface LocalWorkspaceSnapshot {
	version: 3;
	userId: string;
	currentProjectId: string;
	projects: Project[];
	settings: UserSettings;
	dirtySettings: boolean;
	projectRevisions: Record<string, ProjectRevisionState>;
	lastProjectSyncAt: Record<string, number>;
	desktopWorkspaceTab?: WorkspaceTab;
	mobileTab?: WorkspaceTab;
	lastSettingsSyncAt?: number;
	lastSuccessfulSyncAt?: number;
}

export interface LegacySession {
	id: string;
	name: string;
	kanbanData: KanbanData;
	scratchpadData: string;
	chatHistory: Array<{
		role: 'user' | 'model';
		text: string;
		images?: string[];
		timestamp: number;
		metadata?: MessageMetadata;
		toolActions?: WorkspaceAction[];
		groundingMetadata?: unknown;
	}>;
	createdAt: number;
	lastModified: number;
}

export interface ProjectRow {
	id: string;
	user_id: string;
	name: string;
	background_theme: BackgroundTheme | null;
	scratchpad_data: string;
	scratchpad_rev: number;
	created_at: string;
	updated_at: string;
}

export interface ProjectMembershipRow {
	project_id: string;
	user_id: string;
	role: ProjectAccessRole;
	joined_at: string;
	last_opened_at: string;
	pinned_at: string | null;
	viewing_board_client_id: string | null;
	presence_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface ProjectInviteRow {
	id: string;
	project_id: string;
	invitee_user_id: string;
	invitee_email: string;
	invited_by_user_id: string;
	status: ProjectInviteStatus;
	created_at: string;
	updated_at: string;
	responded_at: string | null;
}

export interface ProjectUserStateRow {
	project_id: string;
	user_id: string;
	chat_history?: ChatMessage[] | null;
	active_ai_session_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface ProjectAiSessionRow {
	id: string;
	project_id: string;
	user_id: string;
	title: string;
	model_id: AiModelId;
	history: ChatMessage[];
	created_at: string;
	updated_at: string;
	last_message_at: string;
}

export interface ProjectColumnRow {
	project_id: string;
	board_id?: string | null;
	id: string;
	title: string;
	color: string | null;
	width: number;
	position: number;
	created_at: string;
	updated_at: string;
}

export interface ProjectTaskRow {
	project_id: string;
	board_id?: string | null;
	id: string;
	column_id: string;
	title: string;
	description: string;
	color: string | null;
	tags: Tag[];
	has_checkbox: boolean;
	checked: boolean;
	completed_at: number | null;
	countdown_at: number | null;
	alarm_at: number | null;
	assigned_to?: string | null;
	linked_task_ids?: string[] | null;
	position: number;
	created_at: string;
	updated_at: string;
}

export interface ProjectBoardRow {
	id: string;
	project_id: string;
	name: string;
	position: number;
	created_at: string;
	updated_at: string;
}

export interface ProjectPageRow {
	id: string;
	project_id: string;
	name: string;
	content: string;
	position: number;
	created_at: string;
	updated_at: string;
}

export interface ProjectTaskAssetRow {
	id: string;
	project_id: string;
	task_id: string;
	kind: TaskAssetKind;
	name: string;
	mime_type: string;
	size_bytes: number;
	storage_path: string;
	uploaded_by_user_id: string;
	created_at: string;
}

export interface ProjectTaskCommentRow {
	id: string;
	project_id: string;
	task_id: string;
	body: string;
	author_user_id: string;
	created_at: string;
	updated_at: string;
}

export interface ProfileRow {
	user_id: string;
	email: string | null;
	username: string | null;
	default_show_checkbox: boolean;
	preferred_ai_model_id?: AiModelId | null;
	preferred_model_preset?: string | null;
	background_theme: BackgroundTheme;
	created_at: string;
	updated_at: string;
}

export interface ScratchpadUpdateResultRow {
	ok: boolean;
	scratchpad_data: string;
	scratchpad_rev: number;
	updated_at: string;
}
