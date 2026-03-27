export type ChatMode = 'auto' | 'chat' | 'edit';
export type ModelPreset = 'fast' | 'smart';
export type WorkspaceTab = 'dashboard' | 'kanban' | 'scratchpad' | 'chat' | 'settings';
export type SyncStatus = 'idle' | 'local' | 'syncing' | 'synced' | 'error';
export type WorkspaceAction = 'kanban' | 'scratchpad' | 'highlights';
export type ProposalTarget = 'kanban' | 'scratchpad';
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
	model: string;
	latencyMs: number;
	tokens?: number;
	mode?: ChatMode;
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
}

export interface ProjectMembership {
	projectId: string;
	userId: string;
	role: ProjectAccessRole;
	email?: string;
	joinedAt: number;
	lastOpenedAt: number;
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

export interface ProjectUserState {
	projectId: string;
	userId: string;
	chatHistory: ChatMessage[];
	updatedAt: number;
}

export interface Project {
	id: string;
	ownerUserId: string;
	accessRole: ProjectAccessRole;
	name: string;
	backgroundTheme: BackgroundTheme | null;
	kanbanData: KanbanData;
	scratchpadData: ScratchpadData;
	scratchpadRev: number;
	chatHistory: ChatMessage[];
	members: ProjectMembership[];
	invites: ProjectInvite[];
	createdAt: number;
	updatedAt: number;
	viewerLastOpenedAt: number;
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
	preferredModelPreset: ModelPreset;
	preferredChatMode: ChatMode;
	backgroundTheme: BackgroundTheme;
}

export interface ProjectRevisionState {
	kanban: number;
	scratchpad: number;
}

export interface AiProposal {
	kind: 'none' | 'kanban' | 'scratchpad';
	summary?: string;
	kanbanData?: KanbanData;
	scratchpadData?: string;
}

export interface PendingProposal {
	projectId: string;
	proposal: AiProposal;
	target: ProposalTarget;
	baseRevision: number;
	stale: boolean;
	originalKanbanData?: KanbanData;
	originalScratchpadData?: string;
	scratchpadPadId?: string;
}

export interface AiWorkspaceRequest {
	projectId: string;
	chatMode: ChatMode;
	modelPreset: ModelPreset;
	history: ChatMessage[];
	kanbanData: KanbanData;
	scratchpadData: string;
	attachments: ChatAttachment[];
}

export interface AiWorkspaceResponse {
	reply: string;
	mode: ChatMode;
	model: string;
	latencyMs: number;
	proposal: AiProposal;
	highlightedTaskIds: string[];
	annotations: CitationAnnotation[];
	toolActions: WorkspaceAction[];
}

export interface ProjectBackupFile {
	version: 1 | 2;
	projects: unknown[];
}

export interface LocalWorkspaceSnapshot {
	version: 2;
	userId: string;
	currentProjectId: string;
	projects: Project[];
	settings: UserSettings;
	dirtySettings: boolean;
	projectRevisions: Record<string, ProjectRevisionState>;
	lastProjectSyncAt: Record<string, number>;
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
	chat_history: ChatMessage[];
	created_at: string;
	updated_at: string;
}

export interface ProjectColumnRow {
	project_id: string;
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
	position: number;
	created_at: string;
	updated_at: string;
}

export interface ProfileRow {
	user_id: string;
	email: string | null;
	default_show_checkbox: boolean;
	preferred_model_preset: ModelPreset;
	preferred_chat_mode: ChatMode;
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
