<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	type AuthChangeEvent =
		| 'INITIAL_SESSION'
		| 'SIGNED_IN'
		| 'SIGNED_OUT'
		| 'USER_UPDATED'
		| 'PASSWORD_RECOVERY'
		| 'TOKEN_REFRESHED';
	type AuthUser = {
		id: string;
		email?: string;
	};
	import {
		LayoutDashboard,
		LoaderCircle,
		LogOut,
		Menu,
		MessageSquare,
		NotebookPen,
		Redo2,
		Search,
		Settings2,
		Sparkles,
		Undo2
	} from 'lucide-svelte';
	import Icon from '@iconify/svelte';
	import AuthView from '$lib/components/AuthView.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ChatPane from '$lib/components/ChatPane.svelte';
	import DashboardView from '$lib/components/DashboardView.svelte';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import PagePane from '$lib/components/PagePane.svelte';
	import ProjectRail from '$lib/components/ProjectRail.svelte';
	import ProjectSheet from '$lib/components/ProjectSheet.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import SyncBadge from '$lib/components/SyncBadge.svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import UsernameModal from '$lib/components/UsernameModal.svelte';
	import {
		BACKGROUND_SIGNED_URL_REFRESH_BUFFER_MS,
		BACKGROUND_SIGNED_URL_TTL_SECONDS,
		getBackgroundThemeKey,
		getBackgroundUploadError,
		isImageBackgroundTheme
	} from '$lib/kainbu/backgrounds';
	import {
		createBackgroundSignedUrl,
		deleteBackgroundImage,
		uploadBackgroundImage
	} from '$lib/kainbu/backgroundStorage';
	import {
		DEFAULT_CHAT_HISTORY,
		DEFAULT_SETTINGS,
		DESKTOP_CHAT_MAX,
		DESKTOP_CHAT_MIN,
		DESKTOP_CHAT_WIDTH
	} from '$lib/kainbu/constants';
	import { fetchWorkspaceAiModels, generateSessionTitle, invokeWorkspaceAi } from '$lib/kainbu/ai';
	import { exportProjectsToFile, parseProjectsImport } from '$lib/kainbu/backup';
	import {
		getKanbanFingerprint,
		getProjectPagesFingerprint,
		getScratchpadFingerprint
	} from '$lib/kainbu/fingerprint';
	import { createId } from '$lib/kainbu/id';
	import {
		addProjectAiSession,
		buildAiSessionTitle,
		deleteProjectAiSession,
		getActiveProjectAiSession,
		isDefaultAiSessionTitle,
		renameProjectAiSession,
		resolveAiModelId,
		setActiveProjectAiSession,
		syncProjectAiModelIds,
		updateActiveProjectAiSession
	} from '$lib/kainbu/aiSessions';
	import {
		clearWorkspaceSnapshot,
		loadWorkspaceSnapshot,
		saveWorkspaceSnapshot
	} from '$lib/kainbu/localSnapshot';
	import {
		DEFAULT_AI_MODEL_CONFIGS,
		DEFAULT_AI_MODEL_ID,
		defaultThinkingLevelForModel
	} from '$lib/kainbu/models';
	import {
		checkUsernameAvailability,
		cancelProjectInvite,
		createProject as createProjectRemote,
		createProjectBoard,
		createProjectPage,
		createProjectInvite,
		deleteProjectBoard as deleteProjectBoardRemote,
		deleteProjectPage as deleteProjectPageRemote,
		deleteProjectRemote,
		fetchUserProfile,
		fetchUserSettings,
		fetchWorkspace,
		leaveProject,
		removeProjectMember,
		renameProject as renameProjectRemote,
		renameProjectBoard as renameProjectBoardRemote,
		renameProjectPage as renameProjectPageRemote,
		reportBoardPresence,
		respondToProjectInvite,
		saveProjectAiState,
		supportsProfileBackgroundTheme,
		subscribeToWorkspaceChanges,
		syncProjectBoard,
		setProjectPinned,
		touchProjectLastOpened,
		updateProjectBackground,
		updateProjectPageContent as syncProjectPageContent,
		updateUsername,
		upsertUserSettings
	} from '$lib/kainbu/persistence';
	import { BOARD_PRESENCE_INTERVAL_MS } from '$lib/kainbu/boardPresence';
	import {
		buildWorkspaceSearchParams,
		buildWorkspaceShareUrl,
		parseWorkspaceUrl,
		workspaceSearchParamsEqual,
		type WorkspaceUrlState
	} from '$lib/kainbu/workspaceUrl';
	import { getProjectMemberDisplayName, getProjectMemberSearchText } from '$lib/kainbu/members';
	import {
		getProjectBoard,
		getProjectPage,
		normalizeProjectStructure,
		pageToScratchpadData,
		setProjectActiveBoard,
		setProjectActivePage,
		updateProjectBoardData,
		updateProjectPageContent as updateProjectPageState
	} from '$lib/kainbu/projectStructure';
	import { getActiveScratchpadPad, getScratchpadPad } from '$lib/kainbu/scratchpad';
	import type { TaskReferenceOption } from '$lib/kainbu/taskMarkdown';
	import { buildTimedTasks, clearTaskDueAt } from '$lib/kainbu/timing';
	import type {
		AiModelConfig,
		AiModelId,
		AiProposal,
		AiProgressEvent,
		AiQuestionAnswer,
		BoundTarget,
		BackgroundTheme,
		ChatAttachment,
		ChatMessage,
		ChatTaskCard,
		Column,
		LocalWorkspaceSnapshot,
		PendingProposal,
		Project,
		ProjectInvite,
		ProjectRevisionState,
		ProposalTarget,
		SettingsSection,
		SyncStatus,
		Task,
		UserProfile,
		UserSettings,
		UsernameAvailabilityState,
		WorkspaceSummary,
		WorkspaceTab
	} from '$lib/kainbu/types';
	import { isPocketBaseConfigured, pocketbase } from '$lib/pocketbaseClient';
	import {
		formatPocketBaseError,
		isOwnUserRecordNotFound,
		isPocketBaseNotFound
	} from '$lib/pocketbaseErrors';
	import { shouldIgnorePocketBaseError } from '$lib/kainbu/pbRequest';
	import { fetchAuthSettings, signupWithAuthSettings } from '$lib/kainbu/adminApi';

	const toAuthUser = (model: { id: string; email?: string } | null): AuthUser | null =>
		model ? { id: model.id, email: model.email } : null;

	type WorkspaceStateInput = {
		nextProjects: Project[];
		nextIncomingInvites?: ProjectInvite[];
		preferredProjectId?: string;
		nextSettings?: UserSettings;
		nextDirtySettings?: boolean;
		nextProjectRevisions?: Record<string, ProjectRevisionState>;
		nextLastProjectSyncAt?: Record<string, number>;
		nextLastSettingsSyncAt?: number;
		nextLastSuccessfulSyncAt?: number;
	};

	type BackgroundImageScope = 'personal' | 'project';
	type BoardHistoryState = {
		past: Project['kanbanData'][];
		future: Project['kanbanData'][];
	};

	let user: AuthUser | null = null;
	let projects: Project[] = [];
	let incomingInvites: ProjectInvite[] = [];
	let currentProjectId = '';
	let settings: UserSettings = structuredClone(DEFAULT_SETTINGS);
	let aiModels: AiModelConfig[] = structuredClone(DEFAULT_AI_MODEL_CONFIGS);
	let aiThinkingLevel: import('$lib/kainbu/types').AiThinkingLevel = 'none';
	let lastSyncedAiThinkingModelId = '';
	let profile: UserProfile | null = null;
	let profileLoaded = false;
	let desktopWorkspaceTab: WorkspaceTab = 'dashboard';
	let mobileTab: WorkspaceTab = 'dashboard';
	let settingsSection: SettingsSection = 'appearance';
	let authHydrating = true;
	let workspaceHydrating = false;
	let isRestoring = false;
	let isAiProcessing = false;
	let aiProgressEvents: AiProgressEvent[] = [];
	let isAuthLoading = false;
	let authInfoMessage = '';
	let authErrorMessage = '';
	let signupsEnabled = true;
	let emailConfigured = false;
	let workspaceError = '';
	let syncErrorMessage = '';
	let inviteFeedback: { projectId: string; kind: 'success' | 'error'; message: string } | null =
		null;
	let syncStatus: SyncStatus = 'idle';
	let pendingProposals: PendingProposal[] = [];
	let proposalApplyErrors: Record<string, string> = {};
	let applyingProposalId: string | null = null;
	let highlightedTaskIds: string[] = [];
	let boardSearchActive = false;
	let boardSearchQuery = '';
	let projectRailCompact = true;

	const projectSwitchFadeIn = { duration: 200 };
	const projectSwitchFadeOut = { duration: 150 };
	let showProjectSheet = false;
	let desktopChatWidth = DESKTOP_CHAT_WIDTH;
	let desktopChatCollapsed = true;
	let composerDraft = '';
	let queuedAttachments: ChatAttachment[] = [];
	let queuedTaskCards: ChatTaskCard[] = [];
	let activeTaskContext: { taskId: string; columnId: string } | null = null;
	let viewportWidth = 0;
	let saveFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
	let settingsSyncTimeout: ReturnType<typeof setTimeout> | null = null;
	let localSnapshotTimeout: ReturnType<typeof setTimeout> | null = null;
	let authStateReloadTimeout: ReturnType<typeof setTimeout> | null = null;
	let remoteRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let workspaceRefreshPromise: Promise<void> | null = null;
	let stopAuthListener: (() => void) | null = null;
	let stopVisibilityListener: (() => void) | null = null;
	let stopWorkspaceSubscription: (() => void) | null = null;
	let workspaceLoadVersion = 0;
	let dirtySettings = false;
	let projectRevisions: Record<string, ProjectRevisionState> = {};
	let lastProjectSyncAt: Record<string, number> = {};
	let lastSettingsSyncAt: number | undefined = undefined;
	let lastSuccessfulSyncAt: number | undefined = undefined;
	let activeSyncRequests = 0;
	let proposalPreviewTarget: ProposalTarget | null = null;
	let personalBackgroundImageUrl: string | null = null;
	let projectBackgroundImageUrl: string | null = null;
	let personalBackgroundUploading = false;
	let projectBackgroundUploading = false;
	let boardSessionHistory: Record<string, BoardHistoryState> = {};
	let usernameDraft = '';
	let usernameAvailability: UsernameAvailabilityState = 'idle';
	let usernameFeedback = '';
	let usernameSaving = false;
	let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;
	let usernameCheckSequence = 0;
	let projectRailActiveSurface: 'board' | 'page' | 'none' = 'none';

	let nameModalState: {
		kind: 'create-project' | 'create-board' | 'create-page' | 'rename-board' | 'rename-page';
		projectId?: string;
		itemId?: string;
		value: string;
	} | null = null;

	const STARTUP_TIMEOUT_MS = 12000;
	const LOCAL_SNAPSHOT_DEBOUNCE_MS = 140;
	const BOARD_HISTORY_LIMIT = 40;
	const BOARD_SYNC_DEBOUNCE_MS = 320;
	const SCRATCHPAD_SYNC_DEBOUNCE_MS = 440;
	const CHAT_SYNC_DEBOUNCE_MS = 520;
	const AI_HISTORY_WINDOW = 12;
	const SETTINGS_SYNC_DEBOUNCE_MS = 350;
	const REMOTE_REFRESH_DEBOUNCE_MS = 500;
	const SYNC_FEEDBACK_MS = 1400;
	const USERNAME_CHECK_DEBOUNCE_MS = 260;
	const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;

	const focusOnMount = (node: HTMLElement) => {
		node.focus();
	};

	let boardPresenceTimer: ReturnType<typeof setInterval> | null = null;
	let workspaceUrlReady = false;
	let suppressWorkspaceUrlSync = false;
	const boardSyncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingBoardSyncs = new Map<
		string,
		{
			projectId: string;
			boardId: string;
			previousKanbanData: Project['kanbanData'];
			nextKanbanData: Project['kanbanData'];
		}
	>();
	const scratchpadSyncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingScratchpadSyncs = new Map<
		string,
		{ projectId: string; pageId: string; content: string }
	>();
	const chatSyncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingChatSyncs = new Set<string>();
	const pendingBackgroundSignedUrlLoads = new Map<BackgroundImageScope, Promise<void>>();
	const backgroundSignedUrlMeta = new Map<
		BackgroundImageScope,
		{ themeKey: string; expiresAt: number }
	>();

	$: isMobile = viewportWidth > 0 && viewportWidth < 768;
	$: currentProject = projects.find((project) => project.id === currentProjectId) || null;
	$: activeAiSession = currentProject ? getActiveProjectAiSession(currentProject) : null;
	$: activeAiModelId =
		activeAiSession?.modelId || settings.preferredAiModelId || DEFAULT_AI_MODEL_ID;
	$: if (activeAiModelId && activeAiModelId !== lastSyncedAiThinkingModelId) {
		const model = aiModels.find((entry) => entry.id === activeAiModelId);
		if (model) {
			aiThinkingLevel = defaultThinkingLevelForModel(model);
			lastSyncedAiThinkingModelId = activeAiModelId;
		}
	}
	$: currentBoardId = currentProject?.activeBoardId || '';
	$: currentPageId = currentProject?.activePageId || '';
	$: currentPage = currentProject ? getProjectPage(currentProject, currentPageId) : null;
	$: if (
		activeTaskContext &&
		(!currentProject ||
			!currentProject.kanbanData.some(
				(column) =>
					column.id === activeTaskContext?.columnId &&
					column.tasks.some((task) => task.id === activeTaskContext?.taskId)
			))
	) {
		activeTaskContext = null;
	}
	$: currentBoardHistory =
		currentProject && currentBoardId
			? boardSessionHistory[getBoardHistoryKey(currentProject.id, currentBoardId)] || null
			: null;
	$: desktopTitle = getWorkspaceTitle(desktopWorkspaceTab, currentProject);
	$: mobileTitle = getWorkspaceTitle(mobileTab, currentProject);
	$: currentScratchpadPad = currentProject
		? getActiveScratchpadPad(currentProject.scratchpadData)
		: null;
	$: activePendingProposals = pendingProposals.filter(
		(proposal) => proposal.projectId === currentProjectId
	);
	$: if (
		proposalPreviewTarget &&
		!activePendingProposals.some((proposal) => proposal.target === proposalPreviewTarget)
	) {
		proposalPreviewTarget = null;
	}
	$: previewProposal = proposalPreviewTarget
		? activePendingProposals.find((proposal) => proposal.target === proposalPreviewTarget) || null
		: null;
	$: visibleScratchpadState =
		previewProposal?.target === 'scratchpad'
			? previewProposal.preview.scratchpadState
			: currentProject?.scratchpadData || null;
	$: visibleScratchpadPad =
		visibleScratchpadState && previewProposal?.target === 'scratchpad'
			? getScratchpadPad(
					visibleScratchpadState,
					previewProposal.padId || visibleScratchpadState.activePadId
				) || getActiveScratchpadPad(visibleScratchpadState)
			: currentScratchpadPad;
	$: scratchpadContent =
		previewProposal?.target === 'scratchpad' && visibleScratchpadPad
			? visibleScratchpadPad.content
			: currentScratchpadPad?.content || '';
	$: scratchpadComparisonContent =
		previewProposal?.target === 'scratchpad' && visibleScratchpadPad
			? getScratchpadPad(previewProposal.originalScratchpadState, visibleScratchpadPad.id)
					?.content || ''
			: undefined;
	$: kanbanData =
		previewProposal?.target === 'kanban'
			? previewProposal.preview.kanbanData
			: currentProject?.kanbanData || [];
	$: kanbanComparisonData =
		previewProposal?.target === 'kanban' ? previewProposal.originalKanbanData : undefined;
	$: timedTasks = buildTimedTasks(projects);
	$: visibleWorkspaceTab = isMobile ? mobileTab : desktopWorkspaceTab;
	$: workspaceUrlState = parseWorkspaceUrl($page.url.searchParams);
	$: workspaceShareUrl = buildWorkspaceShareUrl({
		projectId: currentProjectId || undefined,
		boardId: currentBoardId || undefined,
		pageId: visibleWorkspaceTab === 'scratchpad' ? currentPageId : undefined,
		view: visibleWorkspaceTab
	});
	$: presenceProjectId = workspaceUrlState.projectId || currentProjectId || '';
	$: presenceBoardId = visibleWorkspaceTab === 'kanban' ? currentBoardId : '';
	$: if (workspaceUrlReady && user && projects.length) {
		syncWorkspaceUrl();
	}
	$: projectRailActiveSurface =
		visibleWorkspaceTab === 'scratchpad'
			? 'page'
			: visibleWorkspaceTab === 'kanban' || visibleWorkspaceTab === 'chat'
				? 'board'
				: 'none';
	$: canUndoBoardHistory = Boolean(currentBoardHistory?.past.length);
	$: canRedoBoardHistory = Boolean(currentBoardHistory?.future.length);
	$: showBoardHistoryControls = Boolean(
		currentProject &&
		isBoardWorkspaceTab(visibleWorkspaceTab) &&
		currentBoardHistory &&
		(currentBoardHistory.past.length || currentBoardHistory.future.length)
	);
	$: showBoardSearchControls = Boolean(currentProject && visibleWorkspaceTab === 'kanban');
	$: boardBackgroundActive = Boolean(
		currentProject?.backgroundTheme && isBoardWorkspaceTab(visibleWorkspaceTab)
	);
	$: activeBackgroundTheme =
		boardBackgroundActive && currentProject?.backgroundTheme
			? currentProject.backgroundTheme
			: settings.backgroundTheme;
	$: activeBackgroundImageUrl = boardBackgroundActive
		? projectBackgroundImageUrl
		: personalBackgroundImageUrl;
	$: profileEmail = profile?.email || user?.email || null;
	$: scratchpadReferenceOptions = (() => {
		if (!currentProject) return [] as TaskReferenceOption[];
		const taskRefs: TaskReferenceOption[] = kanbanData.flatMap((column) =>
			column.tasks.map((task) => ({
				kind: 'task' as const,
				id: task.id,
				label: task.title,
				description: column.title,
				searchText: `${task.title} ${column.title} ${(task.tags || []).map((t) => t.label).join(' ')}`,
				columnId: column.id,
				columnTitle: column.title,
				tags: [...(task.tags || [])],
				checked: Boolean(task.checked)
			}))
		);
		const memberRefs: TaskReferenceOption[] = currentProject.members.map((member) => ({
			kind: 'member' as const,
			id: member.userId,
			label: getProjectMemberDisplayName(member),
			description: member.role,
			searchText: getProjectMemberSearchText(member)
		}));
		const columnRefs: TaskReferenceOption[] = kanbanData.map((column) => ({
			kind: 'column' as const,
			id: column.id,
			label: column.title,
			description: 'Column',
			searchText: `${column.title} column`
		}));
		return [...taskRefs, ...memberRefs, ...columnRefs];
	})();
	$: requiresUsername =
		Boolean(user) &&
		profileLoaded &&
		!authHydrating &&
		!workspaceHydrating &&
		!normalizeUsername(profile?.username);
	$: void ensureBackgroundSignedUrl('personal', settings.backgroundTheme);
	$: void ensureBackgroundSignedUrl('project', currentProject?.backgroundTheme ?? null);
	function isBoardWorkspaceTab(tab: WorkspaceTab) {
		return tab === 'kanban' || tab === 'scratchpad' || tab === 'chat';
	}

	const isEditableKeyboardTarget = (target: EventTarget | null) => {
		const element = target as HTMLElement | null;
		if (!element) return false;
		return Boolean(
			element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
		);
	};

	const closeBoardSearch = () => {
		boardSearchActive = false;
		boardSearchQuery = '';
	};

	$: if (!showBoardSearchControls && (boardSearchActive || boardSearchQuery)) {
		closeBoardSearch();
	}

	const handleWorkspaceKeydown = (event: KeyboardEvent) => {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
			if (!showBoardSearchControls) return;
			if (isEditableKeyboardTarget(event.target)) return;
			event.preventDefault();
			boardSearchActive = true;
		}
	};

	function getWorkspaceTitle(tab: WorkspaceTab, project: Project | null) {
		if (tab === 'dashboard') return 'Dashboard';
		if (tab === 'settings') return 'Settings';
		return project?.name || 'Pick a board';
	}
	const getProjectRevisionState = (projectId: string): ProjectRevisionState =>
		projectRevisions[projectId] || { kanban: 0, scratchpad: 0 };
	const getBoardHistoryKey = (projectId: string, boardId: string) =>
		`${projectId}::board::${boardId}`;
	const getPageSyncKey = (projectId: string, pageId: string) => `${projectId}::page::${pageId}`;
	const hasKeyWithPrefix = (keys: Iterable<string>, prefix: string) => {
		for (const key of keys) {
			if (key.startsWith(prefix)) {
				return true;
			}
		}

		return false;
	};
	const getBoardSyncKeysForProject = (projectId: string) => {
		const prefix = `${projectId}::board::`;
		return [...pendingBoardSyncs.keys()].filter((key) => key.startsWith(prefix));
	};
	const getPageSyncKeysForProject = (projectId: string) => {
		const prefix = `${projectId}::page::`;
		return [...pendingScratchpadSyncs.keys()].filter((key) => key.startsWith(prefix));
	};
	const hasPendingBoardSyncForProject = (projectId: string) =>
		hasKeyWithPrefix(pendingBoardSyncs.keys(), `${projectId}::board::`);
	const hasPendingPageSyncForProject = (projectId: string) =>
		hasKeyWithPrefix(pendingScratchpadSyncs.keys(), `${projectId}::page::`);
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
	const sortProjects = (nextProjects: Project[]) => [...nextProjects].sort(compareProjects);
	const resolveCurrentProjectId = (nextProjects: Project[], preferredProjectId: string) =>
		nextProjects.some((project) => project.id === preferredProjectId)
			? preferredProjectId
			: nextProjects[0]?.id || '';
	const isProjectPending = (projectId: string) =>
		hasPendingBoardSyncForProject(projectId) ||
		hasPendingPageSyncForProject(projectId) ||
		pendingChatSyncs.has(projectId);
	const hasPendingLocalChanges = () =>
		pendingBoardSyncs.size > 0 ||
		pendingScratchpadSyncs.size > 0 ||
		pendingChatSyncs.size > 0 ||
		dirtySettings;

	const clearComposerState = () => {
		composerDraft = '';
		queuedAttachments = [];
		queuedTaskCards = [];
	};

	const clearActiveViewState = () => {
		highlightedTaskIds = [];
		proposalPreviewTarget = null;
		activeTaskContext = null;
	};

	const getScratchpadPadForProject = (project: Project, padId?: string) =>
		(padId ? getScratchpadPad(project.scratchpadData, padId) : undefined) ||
		getActiveScratchpadPad(project.scratchpadData);

	const uniqueIds = (values: string[]) => [
		...new Set(values.map((value) => value.trim()).filter(Boolean))
	];
	const getAvailableAiModelIds = () => aiModels.map((model) => model.id);
	const getFallbackAiModelId = () => aiModels[0]?.id || DEFAULT_AI_MODEL_ID;
	const normalizePreferredAiModelId = (modelId: string | null | undefined) =>
		resolveAiModelId(modelId, getAvailableAiModelIds(), getFallbackAiModelId());
	const normalizeAiSettings = (nextSettings: UserSettings): UserSettings => ({
		...nextSettings,
		preferredAiModelId: normalizePreferredAiModelId(nextSettings.preferredAiModelId)
	});
	const normalizeUsername = (value: string | null | undefined) => value?.trim().toLowerCase() || '';
	const createFallbackUserProfile = (currentUser: AuthUser): UserProfile => ({
		userId: currentUser.id,
		email: currentUser.email || null,
		username: null
	});
	const resolveProfileAfterFetch = (
		currentUser: AuthUser,
		profileResult: PromiseSettledResult<UserProfile>
	) => {
		if (profileResult.status === 'fulfilled') {
			return profileResult.value;
		}

		if (profile?.userId === currentUser.id) {
			return profile;
		}

		return createFallbackUserProfile(currentUser);
	};
	const setUsernameStatus = (state: UsernameAvailabilityState, message: string) => {
		usernameAvailability = state;
		usernameFeedback = message;
	};
	const clearUsernameAvailabilityCheck = () => {
		if (usernameCheckTimeout) {
			clearTimeout(usernameCheckTimeout);
			usernameCheckTimeout = null;
		}
		usernameCheckSequence += 1;
	};
	const syncUsernameDraftFromProfile = (nextProfile: UserProfile | null) => {
		profile = nextProfile;
		const normalizedCurrent = normalizeUsername(nextProfile?.username);
		const normalizedDraft = normalizeUsername(usernameDraft);

		if (!normalizedDraft || normalizedDraft === normalizedCurrent) {
			usernameDraft = nextProfile?.username || '';
		}

		if (normalizedCurrent) {
			setUsernameStatus('idle', '');
			return;
		}

		if (!usernameDraft.trim()) {
			setUsernameStatus('idle', 'Use 3-32 lowercase letters, numbers, or underscores.');
		}
	};
	const validateUsernameDraft = (value: string) => {
		const normalized = normalizeUsername(value);
		if (!normalized) {
			setUsernameStatus('idle', 'Choose a username to continue.');
			return null;
		}

		if (!USERNAME_REGEX.test(normalized)) {
			setUsernameStatus('invalid', 'Use 3-32 lowercase letters, numbers, or underscores.');
			return null;
		}

		return normalized;
	};
	const scheduleUsernameAvailabilityCheck = (value: string) => {
		clearUsernameAvailabilityCheck();
		const normalized = validateUsernameDraft(value);
		if (!normalized) return;

		const currentUsername = normalizeUsername(profile?.username);
		if (normalized === currentUsername && currentUsername) {
			setUsernameStatus('available', 'This is your current username.');
			return;
		}

		setUsernameStatus('checking', 'Checking availability...');
		const requestSequence = usernameCheckSequence;
		usernameCheckTimeout = setTimeout(async () => {
			try {
				const isAvailable = await checkUsernameAvailability(normalized);
				if (requestSequence !== usernameCheckSequence) return;
				setUsernameStatus(
					isAvailable ? 'available' : 'taken',
					isAvailable ? 'Username is available.' : 'That username is already taken.'
				);
			} catch (error) {
				console.error(error);
				if (requestSequence !== usernameCheckSequence) return;
				setUsernameStatus('invalid', 'Unable to verify availability right now.');
			} finally {
				if (requestSequence === usernameCheckSequence) {
					usernameCheckTimeout = null;
				}
			}
		}, USERNAME_CHECK_DEBOUNCE_MS);
	};
	const handleUsernameDraftChange = (value: string) => {
		usernameDraft = value.toLowerCase();
		scheduleUsernameAvailabilityCheck(usernameDraft);
	};
	const handleUsernameSubmit = async () => {
		const currentUser = user;
		if (!currentUser) return;
		const normalized = validateUsernameDraft(usernameDraft);
		if (!normalized || usernameAvailability !== 'available') return;
		if (normalizeUsername(profile?.username) === normalized) return;

		usernameSaving = true;
		try {
			const updatedProfile = await runSyncAction(
				() => updateUsername(currentUser.id, normalized),
				'Unable to save your username right now.'
			);
			syncUsernameDraftFromProfile(updatedProfile);
			setUsernameStatus('available', 'Username saved.');
		} catch (error) {
			console.error(error);
			setUsernameStatus(
				'invalid',
				error instanceof Error ? error.message : 'Unable to save your username right now.'
			);
		} finally {
			usernameSaving = false;
		}
	};
	const handleSettingsSectionChange = (nextSection: SettingsSection) => {
		settingsSection = nextSection;
	};
	const isProposalStaleForProject = (proposal: PendingProposal, project: Project) => {
		if (proposal.target === 'kanban') {
			return getKanbanFingerprint(project.kanbanData) !== proposal.baseFingerprint;
		}

		return getProjectPagesFingerprint(project.pages) !== proposal.baseFingerprint;
	};
	const refreshPendingProposalStaleness = (nextProjects = projects) => {
		pendingProposals = pendingProposals.map((proposal) => {
			const project = nextProjects.find((entry) => entry.id === proposal.projectId);
			if (!project) {
				return proposal;
			}

			const stale = isProposalStaleForProject(proposal, project);
			return stale === proposal.stale ? proposal : { ...proposal, stale };
		});
	};
	const buildBoundTargetHint = (
		project: Project,
		taskCards: ChatTaskCard[],
		activeTask: { taskId: string; columnId: string } | null
	): BoundTarget => {
		if (activeTask?.taskId) {
			return {
				kind: 'task',
				id: activeTask.taskId,
				source: 'open_task',
				locked: true
			};
		}

		const selectedTaskIds = uniqueIds(taskCards.map((taskCard) => taskCard.taskId));
		if (selectedTaskIds.length === 1) {
			return {
				kind: 'task',
				id: selectedTaskIds[0],
				source: 'queued_card',
				locked: true
			};
		}

		const selectedColumnIds = uniqueIds(taskCards.map((taskCard) => taskCard.columnId));
		if (!selectedTaskIds.length && selectedColumnIds.length === 1) {
			return {
				kind: 'column',
				id: selectedColumnIds[0],
				source: 'selected_column',
				locked: true
			};
		}

		if (visibleWorkspaceTab === 'scratchpad') {
			const activePadId =
				getScratchpadPadForProject(project)?.id || project.scratchpadData.activePadId;
			if (activePadId) {
				return {
					kind: 'pad',
					id: activePadId,
					source: 'active_pad',
					locked: true
				};
			}
		}

		return {
			kind: 'none',
			source: 'none',
			locked: false
		};
	};
	const SELF_ASSIGNEE_ALIASES = new Set([
		'me',
		'you',
		'myself',
		'self',
		'current user',
		'current-user'
	]);

	const normalizeAssignedToForProject = (project: Project, assignedTo?: string) => {
		const normalizedAssignedTo = assignedTo?.trim();
		if (!normalizedAssignedTo) {
			return undefined;
		}

		const normalizedSearch = normalizedAssignedTo.toLowerCase();
		if (SELF_ASSIGNEE_ALIASES.has(normalizedSearch)) {
			const currentUserId = user?.id;
			return currentUserId && project.members.some((member) => member.userId === currentUserId)
				? currentUserId
				: undefined;
		}

		const directMemberMatch = project.members.find(
			(member) => member.userId === normalizedAssignedTo
		);
		if (directMemberMatch) {
			return directMemberMatch.userId;
		}

		const emailMatch = project.members.find(
			(member) => member.email?.trim().toLowerCase() === normalizedSearch
		);
		return emailMatch?.userId;
	};

	const normalizeKanbanAssignments = (project: Project, kanbanData: Project['kanbanData']) =>
		kanbanData.map((column) => ({
			...column,
			tasks: column.tasks.map((task) => ({
				...task,
				assignedTo: normalizeAssignedToForProject(project, task.assignedTo)
			}))
		}));

	const appendAiProgressEvent = (event: AiProgressEvent) => {
		if (event.kind === 'status') {
			aiProgressEvents = [
				...aiProgressEvents.filter((existingEvent) => existingEvent.kind !== 'status'),
				event
			].slice(-24);
			return;
		}

		if (event.kind === 'thinking' || event.kind === 'assistant_draft') {
			const withoutSame = aiProgressEvents.filter(
				(existingEvent) => !(existingEvent.kind === event.kind && existingEvent.id === event.id)
			);
			aiProgressEvents = [...withoutSame, event].slice(-24);
			return;
		}

		aiProgressEvents = [...aiProgressEvents, event].slice(-24);
	};

	const getAttachmentSignature = (attachment: ChatAttachment) =>
		[attachment.kind, attachment.name, attachment.mimeType, attachment.content].join(':');

	const mergeQueuedAttachments = (
		currentAttachments: ChatAttachment[],
		nextAttachments: ChatAttachment[]
	) => {
		const merged = [...currentAttachments];
		const seen = new Set(currentAttachments.map(getAttachmentSignature));

		for (const attachment of nextAttachments) {
			const signature = getAttachmentSignature(attachment);
			if (seen.has(signature)) continue;
			seen.add(signature);
			merged.push(attachment);
		}

		return merged;
	};

	const cloneKanbanData = (kanbanData: Project['kanbanData']) => structuredClone(kanbanData);
	const areKanbanDataEqual = (left: Project['kanbanData'], right: Project['kanbanData']) =>
		JSON.stringify(left) === JSON.stringify(right);
	const shortHash = (value: string) => {
		let hash = 2166136261;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}

		return (hash >>> 0).toString(16).padStart(8, '0');
	};
	const summarizeFingerprint = (value: string) => ({
		hash: shortHash(value),
		bytes: new TextEncoder().encode(value).length
	});
	const logWorkspaceAiProposalDebug = (
		phase: string,
		projectId: string,
		proposal: AiProposal | PendingProposal,
		extra: Record<string, unknown> = {}
	) => {
		if (proposal.target === 'kanban') {
			const previewFingerprint = getKanbanFingerprint(proposal.preview.kanbanData);
			console.info('[workspace-ai-proposal]', {
				phase,
				projectId,
				proposalId: proposal.id,
				target: proposal.target,
				scope: proposal.scope,
				summary: proposal.summary,
				editCallCount: proposal.editCallCount,
				opTypes: proposal.ops.map((op) => op.type),
				opCount: proposal.ops.length,
				baseRevision: proposal.baseRevision,
				baseFingerprint: summarizeFingerprint(proposal.baseFingerprint),
				previewFingerprint: summarizeFingerprint(previewFingerprint),
				proposalSafety: proposal.proposalSafety,
				columnCount: proposal.preview.kanbanData.length,
				taskCount: proposal.preview.kanbanData.reduce(
					(total, column) => total + column.tasks.length,
					0
				),
				ops: proposal.ops,
				...extra
			});
			return;
		}

		const targetPadId = proposal.padId || proposal.preview.scratchpadState.activePadId;
		const targetPad =
			getScratchpadPad(proposal.preview.scratchpadState, targetPadId) ||
			getActiveScratchpadPad(proposal.preview.scratchpadState);
		const previewFingerprint = getScratchpadFingerprint(proposal.preview.scratchpadState);
		console.info('[workspace-ai-proposal]', {
			phase,
			projectId,
			proposalId: proposal.id,
			target: proposal.target,
			scope: proposal.scope,
			summary: proposal.summary,
			editCallCount: proposal.editCallCount,
			opTypes: proposal.ops.map((op) => op.type),
			opCount: proposal.ops.length,
			baseRevision: proposal.baseRevision,
			baseFingerprint: summarizeFingerprint(proposal.baseFingerprint),
			previewFingerprint: summarizeFingerprint(previewFingerprint),
			proposalSafety: proposal.proposalSafety,
			padId: proposal.padId,
			activePadId: proposal.preview.scratchpadState.activePadId,
			targetPadId,
			targetPadName: targetPad?.name,
			targetPadContentLength: targetPad?.content.length || 0,
			ops: proposal.ops,
			...extra
		});
	};
	const getBoardHistoryState = (boardHistoryKey: string): BoardHistoryState =>
		boardSessionHistory[boardHistoryKey] || { past: [], future: [] };
	const setBoardHistoryState = (boardHistoryKey: string, nextHistory: BoardHistoryState) => {
		const remainingHistory = { ...boardSessionHistory };
		delete remainingHistory[boardHistoryKey];

		if (!nextHistory.past.length && !nextHistory.future.length) {
			boardSessionHistory = remainingHistory;
			return;
		}

		boardSessionHistory = {
			...remainingHistory,
			[boardHistoryKey]: nextHistory
		};
	};
	const recordBoardHistory = (
		boardHistoryKey: string,
		previousKanbanData: Project['kanbanData'],
		nextKanbanData: Project['kanbanData']
	) => {
		if (areKanbanDataEqual(previousKanbanData, nextKanbanData)) {
			return;
		}

		const currentHistory = getBoardHistoryState(boardHistoryKey);
		const latestPast = currentHistory.past.at(-1);
		const nextPast =
			latestPast && areKanbanDataEqual(latestPast, previousKanbanData)
				? currentHistory.past
				: [...currentHistory.past, cloneKanbanData(previousKanbanData)].slice(-BOARD_HISTORY_LIMIT);

		setBoardHistoryState(boardHistoryKey, {
			past: nextPast,
			future: []
		});
	};
	const applyLocalKanbanChange = (
		project: Project,
		nextKanbanData: Project['kanbanData'],
		options: {
			recordHistory?: boolean;
			syncDelay?: number;
		} = {}
	) => {
		const boardId = project.activeBoardId;
		if (!boardId) return false;

		const previousKanbanData = cloneKanbanData(project.kanbanData);
		const normalizedNextKanbanData = normalizeKanbanAssignments(
			project,
			cloneKanbanData(nextKanbanData)
		);

		if (areKanbanDataEqual(previousKanbanData, normalizedNextKanbanData)) {
			return false;
		}

		const updateResult = updateProjectLocal(project.id, (currentProject) =>
			updateProjectBoardData(currentProject, boardId, normalizedNextKanbanData)
		);

		if (!updateResult) return false;

		if (options.recordHistory !== false) {
			recordBoardHistory(
				getBoardHistoryKey(project.id, boardId),
				previousKanbanData,
				normalizedNextKanbanData
			);
		}

		highlightedTaskIds = [];
		bumpProjectRevision(project.id, 'kanban');
		scheduleBoardSync(
			project.id,
			boardId,
			previousKanbanData,
			normalizedNextKanbanData,
			options.syncDelay ?? BOARD_SYNC_DEBOUNCE_MS
		);
		return true;
	};

	const refreshSyncStatus = (showSynced = false) => {
		if (saveFeedbackTimeout) {
			clearTimeout(saveFeedbackTimeout);
			saveFeedbackTimeout = null;
		}

		if (syncErrorMessage) {
			syncStatus = 'error';
			return;
		}

		if (activeSyncRequests > 0) {
			syncStatus = 'syncing';
			return;
		}

		if (hasPendingLocalChanges()) {
			syncStatus = 'local';
			return;
		}

		if (showSynced) {
			syncStatus = 'synced';
			saveFeedbackTimeout = setTimeout(() => {
				if (!syncErrorMessage && activeSyncRequests === 0 && !hasPendingLocalChanges()) {
					syncStatus = 'idle';
				}
			}, SYNC_FEEDBACK_MS);
			return;
		}

		syncStatus = 'idle';
	};

	const buildLocalSnapshot = (): LocalWorkspaceSnapshot | null => {
		if (!user) return null;

		return {
			version: 3,
			userId: user.id,
			currentProjectId,
			projects,
			settings,
			dirtySettings,
			projectRevisions,
			lastProjectSyncAt,
			desktopWorkspaceTab,
			mobileTab,
			lastSettingsSyncAt,
			lastSuccessfulSyncAt
		};
	};

	const persistSnapshotNow = () => {
		const snapshot = buildLocalSnapshot();
		if (!snapshot) return;
		saveWorkspaceSnapshot(snapshot);
	};

	const scheduleSnapshotPersist = () => {
		if (!user) return;
		if (localSnapshotTimeout) clearTimeout(localSnapshotTimeout);
		localSnapshotTimeout = setTimeout(() => {
			localSnapshotTimeout = null;
			persistSnapshotNow();
		}, LOCAL_SNAPSHOT_DEBOUNCE_MS);
	};

	const applyWorkspaceState = ({
		nextProjects,
		nextIncomingInvites = incomingInvites,
		preferredProjectId = currentProjectId,
		nextSettings = settings,
		nextDirtySettings = dirtySettings,
		nextProjectRevisions = projectRevisions,
		nextLastProjectSyncAt = lastProjectSyncAt,
		nextLastSettingsSyncAt = lastSettingsSyncAt,
		nextLastSuccessfulSyncAt = lastSuccessfulSyncAt
	}: WorkspaceStateInput) => {
		const normalizedSettings = normalizeAiSettings(nextSettings);
		const sortedProjects = sortProjects(
			nextProjects.map((project) =>
				syncProjectAiModelIds(
					normalizeProjectStructure(project),
					getAvailableAiModelIds(),
					getFallbackAiModelId()
				)
			)
		);
		const resolvedProjectId = resolveCurrentProjectId(sortedProjects, preferredProjectId);
		const normalizedRevisions: Record<string, ProjectRevisionState> = {};
		const normalizedLastProjectSyncAt: Record<string, number> = {};
		const nextBoardSessionHistory: Record<string, BoardHistoryState> = {};

		for (const project of sortedProjects) {
			normalizedRevisions[project.id] = nextProjectRevisions[project.id] || {
				kanban: 0,
				scratchpad: 0
			};

			if (nextLastProjectSyncAt[project.id]) {
				normalizedLastProjectSyncAt[project.id] = nextLastProjectSyncAt[project.id];
			}

			for (const board of project.boards) {
				const boardHistoryKey = getBoardHistoryKey(project.id, board.id);
				if (boardSessionHistory[boardHistoryKey]) {
					nextBoardSessionHistory[boardHistoryKey] = boardSessionHistory[boardHistoryKey];
				}
			}
		}

		projects = sortedProjects;
		incomingInvites = nextIncomingInvites;
		currentProjectId = resolvedProjectId;
		settings = normalizedSettings;
		dirtySettings = nextDirtySettings;
		projectRevisions = normalizedRevisions;
		lastProjectSyncAt = normalizedLastProjectSyncAt;
		lastSettingsSyncAt = nextLastSettingsSyncAt;
		lastSuccessfulSyncAt = nextLastSuccessfulSyncAt;
		boardSessionHistory = nextBoardSessionHistory;

		const hasPendingProposalForMissingProject = pendingProposals.some(
			(proposal) => !sortedProjects.some((project) => project.id === proposal.projectId)
		);
		if (hasPendingProposalForMissingProject) {
			pendingProposals = pendingProposals.filter((proposal) =>
				sortedProjects.some((project) => project.id === proposal.projectId)
			);
			proposalPreviewTarget = null;
		}

		if (!pendingProposals.some((proposal) => proposal.projectId === resolvedProjectId)) {
			proposalPreviewTarget = null;
		}

		refreshPendingProposalStaleness(sortedProjects);

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const resetWorkspaceState = () => {
		clearUsernameAvailabilityCheck();
		if (authStateReloadTimeout) {
			clearTimeout(authStateReloadTimeout);
			authStateReloadTimeout = null;
		}
		if (remoteRefreshTimeout) {
			clearTimeout(remoteRefreshTimeout);
			remoteRefreshTimeout = null;
		}
		if (localSnapshotTimeout) {
			clearTimeout(localSnapshotTimeout);
			localSnapshotTimeout = null;
		}
		if (settingsSyncTimeout) {
			clearTimeout(settingsSyncTimeout);
			settingsSyncTimeout = null;
		}
		for (const timeout of boardSyncTimeouts.values()) clearTimeout(timeout);
		for (const timeout of scratchpadSyncTimeouts.values()) clearTimeout(timeout);
		for (const timeout of chatSyncTimeouts.values()) clearTimeout(timeout);
		boardSyncTimeouts.clear();
		pendingBoardSyncs.clear();
		scratchpadSyncTimeouts.clear();
		pendingScratchpadSyncs.clear();
		chatSyncTimeouts.clear();
		pendingChatSyncs.clear();
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = null;

		workspaceLoadVersion += 1;
		activeSyncRequests = 0;
		projects = [];
		incomingInvites = [];
		currentProjectId = '';
		settings = structuredClone(DEFAULT_SETTINGS);
		profile = null;
		profileLoaded = false;
		settingsSection = 'appearance';
		dirtySettings = false;
		usernameDraft = '';
		usernameAvailability = 'idle';
		usernameFeedback = '';
		usernameSaving = false;
		projectRevisions = {};
		lastProjectSyncAt = {};
		lastSettingsSyncAt = undefined;
		lastSuccessfulSyncAt = undefined;
		pendingProposals = [];
		boardSessionHistory = {};
		workspaceError = '';
		syncErrorMessage = '';
		clearBackgroundSignedUrl('personal');
		clearBackgroundSignedUrl('project');
		clearActiveViewState();
		refreshSyncStatus();
	};

	const setSyncError = (message: string) => {
		if (/autocancell?ed/i.test(message)) return;
		syncErrorMessage = message;
		refreshSyncStatus();
	};

	const clearSyncError = () => {
		if (!syncErrorMessage) return;
		syncErrorMessage = '';
		refreshSyncStatus();
	};

	function setBackgroundImageUrl(scope: BackgroundImageScope, url: string | null) {
		if (scope === 'personal') {
			personalBackgroundImageUrl = url;
			return;
		}

		projectBackgroundImageUrl = url;
	}

	function clearBackgroundSignedUrl(scope: BackgroundImageScope) {
		backgroundSignedUrlMeta.delete(scope);
		setBackgroundImageUrl(scope, null);
	}

	function getScopedBackgroundTheme(scope: BackgroundImageScope) {
		return scope === 'personal'
			? settings.backgroundTheme
			: (currentProject?.backgroundTheme ?? null);
	}

	async function ensureBackgroundSignedUrl(
		scope: BackgroundImageScope,
		theme: BackgroundTheme | null
	) {
		if (!isImageBackgroundTheme(theme)) {
			clearBackgroundSignedUrl(scope);
			return;
		}

		const themeKey = getBackgroundThemeKey(theme);
		const cached = backgroundSignedUrlMeta.get(scope);

		if (
			cached &&
			cached.themeKey === themeKey &&
			cached.expiresAt > Date.now() + BACKGROUND_SIGNED_URL_REFRESH_BUFFER_MS
		) {
			return;
		}

		if (pendingBackgroundSignedUrlLoads.has(scope)) {
			return;
		}

		const request = (async () => {
			try {
				const signedUrl = await createBackgroundSignedUrl(theme.path);
				backgroundSignedUrlMeta.set(scope, {
					themeKey,
					expiresAt: Date.now() + BACKGROUND_SIGNED_URL_TTL_SECONDS * 1000
				});
				setBackgroundImageUrl(scope, signedUrl);
			} catch (error) {
				console.error(error);
				clearBackgroundSignedUrl(scope);
			} finally {
				pendingBackgroundSignedUrlLoads.delete(scope);
				const currentTheme = getScopedBackgroundTheme(scope);
				if (getBackgroundThemeKey(currentTheme) !== themeKey) {
					void ensureBackgroundSignedUrl(scope, currentTheme);
				}
			}
		})();

		pendingBackgroundSignedUrlLoads.set(scope, request);
		await request;
	}

	async function safelyDeleteBackgroundImage(path: string) {
		try {
			await deleteBackgroundImage(path);
		} catch (error) {
			console.error(error);
		}
	}

	async function withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		message: string
	): Promise<T> {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		try {
			return await Promise.race([
				promise,
				new Promise<T>((_, reject) => {
					timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
				})
			]);
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
		}
	}

	const bumpProjectRevision = (projectId: string, target: ProposalTarget) => {
		const currentRevision = getProjectRevisionState(projectId);
		const nextRevision = {
			...currentRevision,
			[target]: currentRevision[target] + 1
		};
		projectRevisions = {
			...projectRevisions,
			[projectId]: nextRevision
		};
		refreshPendingProposalStaleness();
		scheduleSnapshotPersist();
	};

	async function runSyncAction<T>(operation: () => Promise<T>, fallbackMessage: string) {
		activeSyncRequests += 1;
		refreshSyncStatus();

		try {
			const result = await operation();
			lastSuccessfulSyncAt = Date.now();
			clearSyncError();
			scheduleSnapshotPersist();
			refreshSyncStatus(true);
			return result;
		} catch (error) {
			if (shouldIgnorePocketBaseError(error)) {
				throw error;
			}
			console.error(error);
			setSyncError(error instanceof Error ? error.message : fallbackMessage);
			throw error;
		} finally {
			activeSyncRequests = Math.max(0, activeSyncRequests - 1);
			refreshSyncStatus(syncErrorMessage.length === 0 && !hasPendingLocalChanges());
		}
	}

	const updateProjectLocal = (projectId: string, updater: (project: Project) => Project) => {
		const current = projects.find((entry) => entry.id === projectId);
		if (!current) return null;

		const nextProject = normalizeProjectStructure({
			...updater(current),
			updatedAt: Date.now()
		});
		applyWorkspaceState({
			nextProjects: projects.map((project) => (project.id === projectId ? nextProject : project))
		});
		return {
			current,
			nextProject
		};
	};

	const scheduleBoardSync = (
		projectId: string,
		boardId: string,
		previousKanbanData: Project['kanbanData'],
		nextKanbanData: Project['kanbanData'],
		delay = BOARD_SYNC_DEBOUNCE_MS
	) => {
		const syncKey = getBoardHistoryKey(projectId, boardId);
		const current = pendingBoardSyncs.get(syncKey);
		pendingBoardSyncs.set(syncKey, {
			projectId,
			boardId,
			previousKanbanData: current?.previousKanbanData || previousKanbanData,
			nextKanbanData
		});

		if (boardSyncTimeouts.has(syncKey)) {
			clearTimeout(boardSyncTimeouts.get(syncKey));
		}

		boardSyncTimeouts.set(
			syncKey,
			setTimeout(() => {
				boardSyncTimeouts.delete(syncKey);
				void flushBoardSync(syncKey);
			}, delay)
		);

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const flushBoardSync = async (syncKey: string) => {
		if (!user) return;
		const pending = pendingBoardSyncs.get(syncKey);
		if (!pending) return;
		const project = projects.find((entry) => entry.id === pending.projectId);
		const normalizedPreviousKanbanData = project
			? normalizeKanbanAssignments(project, cloneKanbanData(pending.previousKanbanData))
			: pending.previousKanbanData;
		const normalizedNextKanbanData = project
			? normalizeKanbanAssignments(project, cloneKanbanData(pending.nextKanbanData))
			: pending.nextKanbanData;

		if (project && !areKanbanDataEqual(project.kanbanData, normalizedNextKanbanData)) {
			updateProjectLocal(pending.projectId, (currentProject) =>
				updateProjectBoardData(currentProject, pending.boardId, normalizedNextKanbanData)
			);
		}

		try {
			await runSyncAction(
				() =>
					syncProjectBoard(
						pending.projectId,
						pending.boardId,
						normalizedPreviousKanbanData,
						normalizedNextKanbanData
					),
				'Unable to sync the board right now.'
			);
			if (pendingBoardSyncs.get(syncKey) === pending) {
				pendingBoardSyncs.delete(syncKey);
			}
			lastProjectSyncAt = {
				...lastProjectSyncAt,
				[pending.projectId]: Date.now()
			};
		} finally {
			refreshSyncStatus(syncErrorMessage.length === 0 && !hasPendingLocalChanges());
		}
	};

	const scheduleScratchpadSync = (
		projectId: string,
		pageId: string,
		content: string,
		delay = SCRATCHPAD_SYNC_DEBOUNCE_MS
	) => {
		const syncKey = getPageSyncKey(projectId, pageId);
		pendingScratchpadSyncs.set(syncKey, {
			projectId,
			pageId,
			content
		});

		if (scratchpadSyncTimeouts.has(syncKey)) {
			clearTimeout(scratchpadSyncTimeouts.get(syncKey));
		}

		scratchpadSyncTimeouts.set(
			syncKey,
			setTimeout(() => {
				scratchpadSyncTimeouts.delete(syncKey);
				void flushScratchpadSync(syncKey);
			}, delay)
		);

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const flushScratchpadSync = async (syncKey: string) => {
		const pending = pendingScratchpadSyncs.get(syncKey);
		if (!pending) return;

		try {
			await runSyncAction(
				() => syncProjectPageContent(pending.projectId, pending.pageId, pending.content),
				'Unable to sync the page right now.'
			);

			if (pendingScratchpadSyncs.get(syncKey) === pending) {
				pendingScratchpadSyncs.delete(syncKey);
			}
			lastProjectSyncAt = {
				...lastProjectSyncAt,
				[pending.projectId]: Date.now()
			};
		} finally {
			refreshSyncStatus(syncErrorMessage.length === 0 && !hasPendingLocalChanges());
		}
	};

	const scheduleChatSync = (projectId: string, delay = CHAT_SYNC_DEBOUNCE_MS) => {
		pendingChatSyncs.add(projectId);
		if (chatSyncTimeouts.has(projectId)) {
			clearTimeout(chatSyncTimeouts.get(projectId));
		}

		chatSyncTimeouts.set(
			projectId,
			setTimeout(() => {
				chatSyncTimeouts.delete(projectId);
				void flushChatSync(projectId);
			}, delay)
		);

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const flushChatSync = async (projectId: string) => {
		if (!user || !pendingChatSyncs.has(projectId)) return;
		const currentUser = user;
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		try {
			await runSyncAction(
				() =>
					saveProjectAiState(
						projectId,
						currentUser.id,
						project.aiSessions,
						project.activeAiSessionId
					),
				'Unable to sync your private chat right now.'
			);
			if (pendingChatSyncs.has(projectId) && !chatSyncTimeouts.has(projectId)) {
				pendingChatSyncs.delete(projectId);
			}
			lastProjectSyncAt = {
				...lastProjectSyncAt,
				[projectId]: Date.now()
			};
		} finally {
			refreshSyncStatus(syncErrorMessage.length === 0 && !hasPendingLocalChanges());
		}
	};

	const scheduleSettingsSync = (delay = SETTINGS_SYNC_DEBOUNCE_MS) => {
		if (!user) return;
		if (settingsSyncTimeout) clearTimeout(settingsSyncTimeout);
		settingsSyncTimeout = setTimeout(() => {
			settingsSyncTimeout = null;
			void flushSettings();
		}, delay);
		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const flushSettings = async () => {
		if (!user || !dirtySettings) return;
		const currentUser = user;
		try {
			await runSyncAction(
				() => upsertUserSettings(currentUser.id, settings),
				'Unable to sync your preferences.'
			);
			dirtySettings = false;
			lastSettingsSyncAt = Date.now();
			scheduleSnapshotPersist();
		} finally {
			refreshSyncStatus(syncErrorMessage.length === 0 && !hasPendingLocalChanges());
		}
	};

	const clearBoardPresenceTimer = () => {
		if (boardPresenceTimer) {
			clearInterval(boardPresenceTimer);
			boardPresenceTimer = null;
		}
	};

	const isBoardWorkspaceVisible = () => {
		const view = workspaceUrlState.view ?? visibleWorkspaceTab;
		return Boolean(presenceProjectId && view === 'kanban');
	};

	const pingBoardPresence = async () => {
		const activeUser = user;
		if (!activeUser || document.visibilityState === 'hidden') return;

		const projectId = presenceProjectId;
		if (!projectId) return;

		if (!isBoardWorkspaceVisible()) {
			try {
				await reportBoardPresence(projectId, null);
			} catch (error) {
				console.error(error);
			}
			return;
		}

		const boardId = presenceBoardId;
		if (!boardId) return;

		try {
			await reportBoardPresence(projectId, boardId);
			const presenceAt = Date.now();
			projects = projects.map((entry) =>
				entry.id !== projectId
					? entry
					: {
							...entry,
							members: entry.members.map((member) =>
								member.userId === activeUser.id
									? { ...member, viewingBoardId: boardId, presenceAt }
									: member
							)
						}
			);
		} catch (error) {
			console.error(error);
		}
	};

	$: boardPresenceKey =
		user && presenceProjectId && isBoardWorkspaceVisible() && presenceBoardId
			? `${presenceProjectId}::${presenceBoardId}`
			: '';

	$: if (boardPresenceKey) {
		clearBoardPresenceTimer();
		void pingBoardPresence();
		boardPresenceTimer = setInterval(() => {
			void pingBoardPresence();
		}, BOARD_PRESENCE_INTERVAL_MS);
	} else {
		clearBoardPresenceTimer();
	}

	const resolveMergedActiveId = (items: { id: string }[], localId: string, remoteId: string) => {
		if (items.some((item) => item.id === localId)) return localId;
		if (items.some((item) => item.id === remoteId)) return remoteId;
		return items[0]?.id || '';
	};

	const localChildListHasPendingDeletions = (
		localItems: { id: string }[],
		remoteItems: { id: string }[]
	) => {
		if (localItems.length >= remoteItems.length) return false;
		const remoteIds = new Set(remoteItems.map((item) => item.id));
		return localItems.every((item) => remoteIds.has(item.id));
	};

	const mergeRemoteProjects = (localProjects: Project[], remoteProjects: Project[]) => {
		const localProjectsById = new Map(localProjects.map((project) => [project.id, project]));
		const remoteProjectsById = new Map(remoteProjects.map((project) => [project.id, project]));
		const merged: Project[] = [];

		for (const remoteProject of remoteProjects) {
			const localProject = localProjectsById.get(remoteProject.id);
			if (!localProject) {
				merged.push(remoteProject);
				continue;
			}

			const preferLocalFallback = localProject.updatedAt > remoteProject.updatedAt;
			const preferLocalBoardState =
				preferLocalFallback ||
				hasPendingBoardSyncForProject(remoteProject.id) ||
				localProject.boards.length > remoteProject.boards.length ||
				localChildListHasPendingDeletions(localProject.boards, remoteProject.boards);
			const preferLocalPageState =
				preferLocalFallback ||
				hasPendingPageSyncForProject(remoteProject.id) ||
				localProject.pages.length > remoteProject.pages.length ||
				localChildListHasPendingDeletions(localProject.pages, remoteProject.pages);
			const preferLocalAiState = pendingChatSyncs.has(remoteProject.id) || preferLocalFallback;
			const mergedBoards = preferLocalBoardState ? localProject.boards : remoteProject.boards;
			const mergedPages = preferLocalPageState ? localProject.pages : remoteProject.pages;
			const activeBoardId = resolveMergedActiveId(
				mergedBoards,
				localProject.activeBoardId,
				remoteProject.activeBoardId
			);
			const activePageId = resolveMergedActiveId(
				mergedPages,
				localProject.activePageId,
				remoteProject.activePageId
			);
			const activeBoard = getProjectBoard({ boards: mergedBoards, activeBoardId }, activeBoardId);
			const activePage = getProjectPage({ pages: mergedPages, activePageId }, activePageId);
			const mergedMembers = remoteProject.members.map((remoteMember) => {
				const localMember = localProject.members.find(
					(member) => member.userId === remoteMember.userId
				);
				if (!localMember) return remoteMember;

				const localPresence = localMember.presenceAt ?? 0;
				const remotePresence = remoteMember.presenceAt ?? 0;
				if (localPresence > remotePresence) {
					return {
						...remoteMember,
						viewingBoardId: localMember.viewingBoardId ?? remoteMember.viewingBoardId,
						presenceAt: localMember.presenceAt
					};
				}

				return remoteMember;
			});

			merged.push({
				...remoteProject,
				members: mergedMembers,
				backgroundTheme: preferLocalFallback
					? localProject.backgroundTheme
					: remoteProject.backgroundTheme,
				boards: mergedBoards,
				activeBoardId: activeBoard?.id || activeBoardId,
				kanbanData: activeBoard?.kanbanData || [],
				pages: mergedPages,
				activePageId: activePage?.id || activePageId,
				scratchpadData: activePage
					? pageToScratchpadData(activePage)
					: remoteProject.scratchpadData,
				scratchpadRev:
					activePageId === localProject.activePageId
						? localProject.scratchpadRev
						: remoteProject.scratchpadRev,
				aiSessions: preferLocalAiState ? localProject.aiSessions : remoteProject.aiSessions,
				activeAiSessionId: preferLocalAiState
					? localProject.activeAiSessionId
					: remoteProject.activeAiSessionId,
				chatHistory: preferLocalAiState ? localProject.chatHistory : remoteProject.chatHistory,
				updatedAt: Math.max(remoteProject.updatedAt, localProject.updatedAt)
			});
		}

		for (const localProject of localProjects) {
			if (!remoteProjectsById.has(localProject.id) && isProjectPending(localProject.id)) {
				merged.push(localProject);
			}
		}

		return merged;
	};

	const bootstrapWorkspace = async (currentUser: AuthUser) => {
		const loadVersion = ++workspaceLoadVersion;
		workspaceHydrating = true;
		workspaceError = '';
		const localSnapshot = loadWorkspaceSnapshot(currentUser.id);
		if (!profile || profile.userId !== currentUser.id) {
			syncUsernameDraftFromProfile(createFallbackUserProfile(currentUser));
		}

		if (localSnapshot) {
			applyWorkspaceState({
				nextProjects: localSnapshot.projects,
				preferredProjectId: localSnapshot.currentProjectId,
				nextSettings: localSnapshot.settings,
				nextDirtySettings: localSnapshot.dirtySettings,
				nextProjectRevisions: localSnapshot.projectRevisions,
				nextLastProjectSyncAt: localSnapshot.lastProjectSyncAt,
				nextLastSettingsSyncAt: localSnapshot.lastSettingsSyncAt,
				nextLastSuccessfulSyncAt: localSnapshot.lastSuccessfulSyncAt
			});
			desktopWorkspaceTab = localSnapshot.desktopWorkspaceTab || 'dashboard';
			mobileTab = localSnapshot.mobileTab || localSnapshot.desktopWorkspaceTab || 'dashboard';
			workspaceHydrating = false;
		}

		try {
			const [workspaceResult, settingsResult, profileResult] = await Promise.allSettled([
				withTimeout(
					fetchWorkspace(currentUser.id),
					STARTUP_TIMEOUT_MS,
					'Loading your boards timed out. Please retry.'
				),
				withTimeout(
					fetchUserSettings(currentUser.id),
					STARTUP_TIMEOUT_MS,
					'Loading your settings timed out. Please retry.'
				),
				withTimeout(
					fetchUserProfile(currentUser.id),
					STARTUP_TIMEOUT_MS,
					'Loading your account timed out. Please retry.'
				)
			]);

			if (loadVersion !== workspaceLoadVersion) return;

			if (workspaceResult.status !== 'fulfilled') {
				throw workspaceResult.reason;
			}

			if (settingsResult.status === 'rejected') {
				if (clearStaleAuthSession(currentUser.id, settingsResult.reason)) {
					return;
				}
				workspaceError =
					settingsResult.reason instanceof Error
						? settingsResult.reason.message
						: 'Unable to load your preferences.';
			}

			if (
				profileResult.status === 'rejected' &&
				clearStaleAuthSession(currentUser.id, profileResult.reason)
			) {
				return;
			}

			const resolvedSettings = localSnapshot?.dirtySettings
				? localSnapshot.settings
				: settingsResult.status === 'fulfilled'
					? !supportsProfileBackgroundTheme() && localSnapshot?.settings
						? {
								...settingsResult.value,
								backgroundTheme: localSnapshot.settings.backgroundTheme
							}
						: settingsResult.value
					: localSnapshot?.settings || structuredClone(DEFAULT_SETTINGS);

			applyWorkspaceState({
				nextProjects: mergeRemoteProjects(
					localSnapshot?.projects || projects,
					workspaceResult.value.projects
				),
				nextIncomingInvites: workspaceResult.value.incomingInvites,
				preferredProjectId:
					localSnapshot?.currentProjectId ||
					currentProjectId ||
					workspaceResult.value.projects[0]?.id ||
					'',
				nextSettings: resolvedSettings,
				nextDirtySettings: localSnapshot?.dirtySettings || false,
				nextProjectRevisions: localSnapshot?.projectRevisions || projectRevisions,
				nextLastProjectSyncAt: localSnapshot?.lastProjectSyncAt || lastProjectSyncAt,
				nextLastSettingsSyncAt: localSnapshot?.lastSettingsSyncAt,
				nextLastSuccessfulSyncAt: localSnapshot?.lastSuccessfulSyncAt
			});

			syncUsernameDraftFromProfile(resolveProfileAfterFetch(currentUser, profileResult));
		} catch (error) {
			if (shouldIgnorePocketBaseError(error)) return;
			if (clearStaleAuthSession(currentUser.id, error)) return;
			console.error(error);
			const message = error instanceof Error ? error.message : 'Unable to load your workspace.';
			if (/autocancell?ed/i.test(message)) return;
			workspaceError = message;
		} finally {
			if (loadVersion === workspaceLoadVersion) {
				workspaceHydrating = false;
				profileLoaded = true;
				hydrateWorkspaceFromUrl();
			}
		}
	};

	const refreshUserProfile = async (currentUser: AuthUser) => {
		try {
			const nextProfile = await fetchUserProfile(currentUser.id);
			if (user?.id !== currentUser.id) return;
			syncUsernameDraftFromProfile(nextProfile);
			profileLoaded = true;
		} catch (error) {
			if (clearStaleAuthSession(currentUser.id, error)) return;
			console.error(error);
		}
	};

	const loadAiModels = async () => {
		try {
			const nextModels = await fetchWorkspaceAiModels();
			if (!nextModels.length) return;
			const previousModelIds = new Set(aiModels.map((model) => model.id));
			const nextModelIds = new Set(nextModels.map((model) => model.id));
			const catalogChanged =
				previousModelIds.size !== nextModelIds.size ||
				[...nextModelIds].some((id) => !previousModelIds.has(id));
			aiModels = nextModels;
			if (catalogChanged) {
				lastSyncedAiThinkingModelId = '';
			}
			if (projects.length || user) {
				applyWorkspaceState({
					nextProjects: projects,
					nextSettings: settings
				});
			} else {
				settings = normalizeAiSettings(settings);
			}
		} catch (error) {
			console.error(error);
		}
	};

	let lastChatModelsRefreshKey = '';
	$: if (visibleWorkspaceTab === 'chat') {
		const refreshKey = `${currentProjectId}:${visibleWorkspaceTab}`;
		if (refreshKey !== lastChatModelsRefreshKey) {
			lastChatModelsRefreshKey = refreshKey;
			void loadAiModels();
		}
	} else {
		lastChatModelsRefreshKey = '';
	}

	const refreshWorkspaceFromRemote = async (currentUser: AuthUser) => {
		if (workspaceRefreshPromise) return workspaceRefreshPromise;

		workspaceRefreshPromise = (async () => {
			try {
				const workspace = await fetchWorkspace(currentUser.id, { fresh: true });
				applyWorkspaceState({
					nextProjects: mergeRemoteProjects(projects, workspace.projects),
					nextIncomingInvites: workspace.incomingInvites,
					preferredProjectId: currentProjectId
				});
			} catch (error) {
				if (shouldIgnorePocketBaseError(error)) return;
				console.error(error);
				setSyncError(
					error instanceof Error ? error.message : 'Unable to refresh workspace changes.'
				);
			}
		})().finally(() => {
			workspaceRefreshPromise = null;
		});

		return workspaceRefreshPromise;
	};

	const scheduleRemoteRefresh = () => {
		if (!user || isRestoring) return;
		if (remoteRefreshTimeout) clearTimeout(remoteRefreshTimeout);
		remoteRefreshTimeout = setTimeout(() => {
			remoteRefreshTimeout = null;
			if (user) void refreshWorkspaceFromRemote(user);
		}, REMOTE_REFRESH_DEBOUNCE_MS);
	};

	const startWorkspaceSubscription = (currentUser: AuthUser) => {
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = subscribeToWorkspaceChanges(currentUser.id, () => {
			scheduleRemoteRefresh();
		});
	};

	const scheduleWorkspaceReload = (nextUser: AuthUser) => {
		if (authStateReloadTimeout) clearTimeout(authStateReloadTimeout);
		authStateReloadTimeout = setTimeout(() => {
			authStateReloadTimeout = null;
			stopWorkspaceSubscription?.();
			stopWorkspaceSubscription = null;
			void bootstrapWorkspace(nextUser).finally(() => {
				if (user?.id !== nextUser.id) return;
				startWorkspaceSubscription(nextUser);
			});
		}, 0);
	};

	const recoverWorkspaceIfNeeded = () => {
		if (!user || document.visibilityState === 'hidden') return;
		if (workspaceHydrating || Boolean(workspaceError)) {
			void bootstrapWorkspace(user);
			return;
		}
		if (!normalizeUsername(profile?.username)) {
			void refreshUserProfile(user);
		}
		void refreshWorkspaceFromRemote(user);
	};

	const shouldReloadWorkspaceForAuthEvent = (
		event: AuthChangeEvent,
		previousUserId: string | null,
		nextUser: AuthUser
	) => {
		const userChanged = previousUserId !== nextUser.id;
		const workspaceMissing = !projects.length && !incomingInvites.length;

		if (userChanged) return true;
		if (event === 'INITIAL_SESSION') return workspaceMissing || workspaceHydrating;
		if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
			return workspaceMissing;
		}

		return false;
	};

	const handleAuthSubmit = async (payload: {
		email: string;
		password: string;
		isSignUp: boolean;
	}) => {
		authErrorMessage = '';
		authInfoMessage = '';
		isAuthLoading = true;

		try {
			if (payload.isSignUp) {
				const result = await signupWithAuthSettings(payload.email, payload.password);
				if (result.requiresVerification) {
					authInfoMessage =
						'Account created. Check your email to verify your address before signing in.';
					return;
				}
				await pocketbase.collection('users').authWithPassword(payload.email, payload.password);
				authInfoMessage = 'Account created.';
				return;
			}

			await pocketbase.collection('users').authWithPassword(payload.email, payload.password);
		} catch (error) {
			console.error(error);
			authErrorMessage = formatPocketBaseError(error, 'Unable to authenticate right now.');
		} finally {
			isAuthLoading = false;
		}
	};

	const handlePasswordResetRequest = async (email: string) => {
		authErrorMessage = '';
		authInfoMessage = '';
		const normalizedEmail = email.trim().toLowerCase();
		if (!normalizedEmail) {
			authErrorMessage = 'Enter your email before requesting a reset link.';
			return;
		}
		isAuthLoading = true;
		try {
			await pocketbase.collection('users').requestPasswordReset(normalizedEmail);
			authInfoMessage = 'Password reset email sent if that account exists.';
		} catch (error) {
			console.error(error);
			authErrorMessage = formatPocketBaseError(error, 'Unable to send password reset email.');
		} finally {
			isAuthLoading = false;
		}
	};

	const setWorkspaceTab = (tab: WorkspaceTab) => {
		if (tab === 'chat') {
			mobileTab = 'chat';
			return;
		}

		if (isMobile) {
			mobileTab = tab;
			return;
		}

		desktopWorkspaceTab = tab;
	};

	const getWorkspaceUrlStateFromApp = (): WorkspaceUrlState => ({
		projectId: currentProjectId || undefined,
		boardId: currentBoardId || undefined,
		pageId: visibleWorkspaceTab === 'scratchpad' ? currentPageId : undefined,
		view: visibleWorkspaceTab
	});

	const syncWorkspaceUrl = () => {
		if (suppressWorkspaceUrlSync || typeof window === 'undefined' || !user || !workspaceUrlReady) {
			return;
		}

		const nextParams = buildWorkspaceSearchParams(getWorkspaceUrlStateFromApp());
		if (workspaceSearchParamsEqual($page.url.searchParams, nextParams)) return;

		const pathname = $page.url.pathname || '/';
		replaceState(`${pathname}?${nextParams.toString()}`, {});
	};

	const applyWorkspaceUrlState = (parsed: WorkspaceUrlState) => {
		if (!parsed.projectId && !parsed.view && !parsed.boardId && !parsed.pageId) return;

		if (parsed.view) {
			if (isMobile) mobileTab = parsed.view;
			else desktopWorkspaceTab = parsed.view;
		}

		if (!parsed.projectId) return;

		const project = projects.find((entry) => entry.id === parsed.projectId);
		if (!project) return;

		let updater: ((entry: Project) => Project) | undefined;
		if (parsed.view === 'kanban' && parsed.boardId) {
			if (project.boards.some((board) => board.id === parsed.boardId)) {
				updater = (entry) => setProjectActiveBoard(entry, parsed.boardId!);
			}
		} else if (parsed.view === 'scratchpad' && parsed.pageId) {
			if (project.pages.some((page) => page.id === parsed.pageId)) {
				updater = (entry) => setProjectActivePage(entry, parsed.pageId!);
			}
		}

		suppressWorkspaceUrlSync = true;
		selectProject(parsed.projectId, updater);
		suppressWorkspaceUrlSync = false;
	};

	const hydrateWorkspaceFromUrl = () => {
		if (typeof window === 'undefined') return;

		const parsed = parseWorkspaceUrl($page.url.searchParams);
		if (parsed.projectId || parsed.view || parsed.boardId || parsed.pageId) {
			applyWorkspaceUrlState(parsed);
		}

		workspaceUrlReady = true;
		syncWorkspaceUrl();
	};

	const clearProjectSyncState = (projectId: string) => {
		for (const syncKey of [...boardSyncTimeouts.keys()]) {
			if (!syncKey.startsWith(`${projectId}::board::`)) continue;
			const boardTimeout = boardSyncTimeouts.get(syncKey);
			if (boardTimeout) clearTimeout(boardTimeout);
			boardSyncTimeouts.delete(syncKey);
			pendingBoardSyncs.delete(syncKey);
		}

		for (const syncKey of [...scratchpadSyncTimeouts.keys()]) {
			if (!syncKey.startsWith(`${projectId}::page::`)) continue;
			const scratchpadTimeout = scratchpadSyncTimeouts.get(syncKey);
			if (scratchpadTimeout) clearTimeout(scratchpadTimeout);
			scratchpadSyncTimeouts.delete(syncKey);
			pendingScratchpadSyncs.delete(syncKey);
		}

		const chatTimeout = chatSyncTimeouts.get(projectId);
		if (chatTimeout) clearTimeout(chatTimeout);
		chatSyncTimeouts.delete(projectId);
		pendingChatSyncs.delete(projectId);

		const remainingRevisions = { ...projectRevisions };
		delete remainingRevisions[projectId];
		projectRevisions = remainingRevisions;

		const remainingSyncAt = { ...lastProjectSyncAt };
		delete remainingSyncAt[projectId];
		lastProjectSyncAt = remainingSyncAt;

		if (pendingProposals.some((proposal) => proposal.projectId === projectId)) {
			pendingProposals = pendingProposals.filter((proposal) => proposal.projectId !== projectId);
			proposalPreviewTarget = null;
		}

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const handleDesktopChatResizeStart = (event: PointerEvent) => {
		if (isMobile || desktopChatCollapsed) return;

		event.preventDefault();
		const startX = event.clientX;
		const startWidth = desktopChatWidth;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaRem = (startX - moveEvent.clientX) / 16;
			desktopChatWidth = Math.max(
				DESKTOP_CHAT_MIN,
				Math.min(DESKTOP_CHAT_MAX, startWidth + deltaRem)
			);
		};

		const stopResizing = () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', stopResizing);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', stopResizing);
	};

	const clearProjectProposalState = (projectId: string) => {
		if (!pendingProposals.some((proposal) => proposal.projectId === projectId)) return;
		pendingProposals = pendingProposals.filter((proposal) => proposal.projectId !== projectId);
		proposalPreviewTarget = null;
	};

	const selectProject = (projectId: string, updater?: (project: Project) => Project) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		const switchingProjects = projectId !== currentProjectId;
		if (switchingProjects) {
			clearComposerState();
			clearActiveViewState();
		}
		if (switchingProjects || updater) {
			clearProjectProposalState(projectId);
		}

		const openedAt = Date.now();
		applyWorkspaceState({
			nextProjects: projects.map((entry) =>
				entry.id === projectId
					? normalizeProjectStructure({
							...(updater ? updater(entry) : entry),
							viewerLastOpenedAt: openedAt
						})
					: entry
			),
			preferredProjectId: projectId
		});

		void runSyncAction(
			() => touchProjectLastOpened(projectId),
			'Unable to update board activity right now.'
		)
			.then(() => {
				lastProjectSyncAt = {
					...lastProjectSyncAt,
					[projectId]: Date.now()
				};
				scheduleSnapshotPersist();
			})
			.catch((error) => {
				console.error(error);
			});
	};

	const openProjectWorkspace = (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		selectProject(projectId, (entry) => setProjectActiveBoard(entry, entry.activeBoardId));
		desktopWorkspaceTab = 'kanban';
		mobileTab = 'kanban';
		desktopChatCollapsed = true;
		showProjectSheet = false;
	};

	const openProjectBoard = (projectId: string, boardId: string) => {
		selectProject(projectId, (project) => setProjectActiveBoard(project, boardId));
		desktopWorkspaceTab = 'kanban';
		mobileTab = 'kanban';
		desktopChatCollapsed = true;
		showProjectSheet = false;
	};

	const openProjectPage = (projectId: string, pageId: string) => {
		selectProject(projectId, (project) => setProjectActivePage(project, pageId));
		desktopWorkspaceTab = 'scratchpad';
		mobileTab = 'scratchpad';
		desktopChatCollapsed = true;
		showProjectSheet = false;
	};

	const handleCreateProject = async () => {
		if (!user) return;
		nameModalState = {
			kind: 'create-project',
			value: `Project ${projects.length + 1}`
		};
	};

	const handleCreateBoardInline = async (projectId: string, nextName: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const name = nextName.trim();
		if (!project || !name) return;

		try {
			const createdBoard = await runSyncAction(
				() => createProjectBoard(projectId, name, project.boards.length),
				'Unable to create a new board right now.'
			);
			selectProject(projectId, (currentProject) =>
				setProjectActiveBoard(
					{ ...currentProject, boards: [...currentProject.boards, createdBoard] },
					createdBoard.id
				)
			);
			lastProjectSyncAt = { ...lastProjectSyncAt, [projectId]: Date.now() };
			desktopWorkspaceTab = 'kanban';
			mobileTab = 'kanban';
			showProjectSheet = false;
		} catch (error) {
			console.error(error);
		}
	};

	const handleCreatePageInline = async (projectId: string, nextName: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const name = nextName.trim();
		if (!project || !name) return;

		try {
			const createdPage = await runSyncAction(
				() => createProjectPage(projectId, name, project.pages.length),
				'Unable to create a new page right now.'
			);
			selectProject(projectId, (currentProject) =>
				setProjectActivePage(
					{ ...currentProject, pages: [...currentProject.pages, createdPage] },
					createdPage.id
				)
			);
			lastProjectSyncAt = { ...lastProjectSyncAt, [projectId]: Date.now() };
			desktopWorkspaceTab = 'scratchpad';
			mobileTab = 'scratchpad';
			showProjectSheet = false;
		} catch (error) {
			console.error(error);
		}
	};

	const handleRenameBoardInline = async (projectId: string, boardId: string, nextName: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const board = project?.boards.find((entry) => entry.id === boardId);
		const name = nextName.trim();
		if (!project || !board || !name || board.name === name) return;

		projects = projects.map((entry) =>
			entry.id === projectId
				? {
						...entry,
						boards: entry.boards.map((candidate) =>
							candidate.id === boardId ? { ...candidate, name, updatedAt: Date.now() } : candidate
						)
					}
				: entry
		);

		try {
			await runSyncAction(
				() => renameProjectBoardRemote(projectId, boardId, name),
				'Unable to rename this board right now.'
			);
		} catch (error) {
			console.error(error);
		}
	};

	const handleRenamePageInline = async (projectId: string, pageId: string, nextName: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const page = project?.pages.find((entry) => entry.id === pageId);
		const name = nextName.trim();
		if (!project || !page || !name || page.name === name) return;

		projects = projects.map((entry) =>
			entry.id === projectId
				? {
						...entry,
						pages: entry.pages.map((candidate) =>
							candidate.id === pageId ? { ...candidate, name, updatedAt: Date.now() } : candidate
						)
					}
				: entry
		);

		try {
			await runSyncAction(
				() => renameProjectPageRemote(projectId, pageId, name),
				'Unable to rename this page right now.'
			);
		} catch (error) {
			console.error(error);
		}
	};

	const handleCreateBoard = (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;
		nameModalState = {
			kind: 'create-board',
			projectId,
			value: `Board ${project.boards.length + 1}`
		};
	};

	const handleCreatePage = (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;
		nameModalState = {
			kind: 'create-page',
			projectId,
			value: `Page ${project.pages.length + 1}`
		};
	};

	const handleRenameBoard = (projectId: string, boardId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const board = project?.boards.find((b) => b.id === boardId);
		if (!board) return;
		nameModalState = {
			kind: 'rename-board',
			projectId,
			itemId: boardId,
			value: board.name
		};
	};

	const handleRenamePage = (projectId: string, pageId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const page = project?.pages.find((p) => p.id === pageId);
		if (!page) return;
		nameModalState = {
			kind: 'rename-page',
			projectId,
			itemId: pageId,
			value: page.name
		};
	};

	const handleNameModalSubmit = async () => {
		if (!nameModalState) return;
		const { kind, projectId, itemId, value } = nameModalState;
		const name = value.trim();
		if (!name) return;

		nameModalState = null;

		if (kind === 'create-project') {
			const currentUser = user;
			if (!currentUser) return;
			try {
				const createdProject = await runSyncAction(
					() => createProjectRemote(currentUser.id, name),
					'Unable to create a new project right now.'
				);

				applyWorkspaceState({
					nextProjects: [
						createdProject,
						...projects.filter((project) => project.id !== createdProject.id)
					],
					preferredProjectId: createdProject.id
				});
				desktopWorkspaceTab = 'kanban';
				mobileTab = 'kanban';
				desktopChatCollapsed = true;
				showProjectSheet = false;
			} catch (error) {
				console.error(error);
			}
			return;
		}

		if (!projectId) return;
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		if (kind === 'create-board') {
			try {
				const createdBoard = await runSyncAction(
					() => createProjectBoard(projectId, name, project.boards.length),
					'Unable to create a new board right now.'
				);
				selectProject(projectId, (currentProject) =>
					setProjectActiveBoard(
						{ ...currentProject, boards: [...currentProject.boards, createdBoard] },
						createdBoard.id
					)
				);
				lastProjectSyncAt = { ...lastProjectSyncAt, [projectId]: Date.now() };
				desktopWorkspaceTab = 'kanban';
				mobileTab = 'kanban';
				showProjectSheet = false;
			} catch (error) {
				console.error(error);
			}
		} else if (kind === 'create-page') {
			try {
				const createdPage = await runSyncAction(
					() => createProjectPage(projectId, name, project.pages.length),
					'Unable to create a new page right now.'
				);
				selectProject(projectId, (currentProject) =>
					setProjectActivePage(
						{ ...currentProject, pages: [...currentProject.pages, createdPage] },
						createdPage.id
					)
				);
				lastProjectSyncAt = { ...lastProjectSyncAt, [projectId]: Date.now() };
				desktopWorkspaceTab = 'scratchpad';
				mobileTab = 'scratchpad';
				showProjectSheet = false;
			} catch (error) {
				console.error(error);
			}
		} else if (kind === 'rename-board' && itemId) {
			const board = project.boards.find((b) => b.id === itemId);
			if (!board || board.name === name) return;
			projects = projects.map((p) =>
				p.id === projectId
					? {
							...p,
							boards: p.boards.map((b) =>
								b.id === itemId ? { ...b, name, updatedAt: Date.now() } : b
							)
						}
					: p
			);
			try {
				await runSyncAction(
					() => renameProjectBoardRemote(projectId, itemId, name),
					'Unable to rename this board right now.'
				);
			} catch (error) {
				console.error(error);
			}
		} else if (kind === 'rename-page' && itemId) {
			const page = project.pages.find((p) => p.id === itemId);
			if (!page || page.name === name) return;
			projects = projects.map((p) =>
				p.id === projectId
					? {
							...p,
							pages: p.pages.map((pg) =>
								pg.id === itemId ? { ...pg, name, updatedAt: Date.now() } : pg
							)
						}
					: p
			);
			try {
				await runSyncAction(
					() => renameProjectPageRemote(projectId, itemId, name),
					'Unable to rename this page right now.'
				);
			} catch (error) {
				console.error(error);
			}
		}
	};

	const handleClearTimedTaskDue = (projectId: string, columnId: string, taskId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		const nextKanbanData = project.kanbanData.map((column) =>
			column.id === columnId
				? {
						...column,
						tasks: column.tasks.map((task) => (task.id === taskId ? clearTaskDueAt(task) : task))
					}
				: column
		);

		applyLocalKanbanChange(project, nextKanbanData, {
			recordHistory: true
		});
	};

	const clearBoardSyncState = (projectId: string, boardId: string) => {
		const syncKey = getBoardHistoryKey(projectId, boardId);
		const boardTimeout = boardSyncTimeouts.get(syncKey);
		if (boardTimeout) clearTimeout(boardTimeout);
		boardSyncTimeouts.delete(syncKey);
		pendingBoardSyncs.delete(syncKey);

		const { [syncKey]: _removedHistory, ...remainingHistory } = boardSessionHistory;
		boardSessionHistory = remainingHistory;
	};

	const clearPageSyncState = (projectId: string, pageId: string) => {
		const syncKey = `${projectId}::page::${pageId}`;
		const pageTimeout = scratchpadSyncTimeouts.get(syncKey);
		if (pageTimeout) clearTimeout(pageTimeout);
		scratchpadSyncTimeouts.delete(syncKey);
		pendingScratchpadSyncs.delete(syncKey);
	};

	const handleDeleteBoard = async (projectId: string, boardId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project || project.boards.length <= 1) return;

		const board = project.boards.find((b) => b.id === boardId);
		if (!board) return;

		const confirmed = window.confirm(`Delete board "${board.name}"?`);
		if (!confirmed) return;

		const previousProjects = projects;
		const remainingBoards = project.boards.filter((b) => b.id !== boardId);
		const nextActiveBoardId =
			project.activeBoardId === boardId ? remainingBoards[0]?.id || '' : project.activeBoardId;

		clearBoardSyncState(projectId, boardId);
		applyWorkspaceState({
			nextProjects: projects.map((entry) =>
				entry.id === projectId
					? normalizeProjectStructure({
							...entry,
							boards: remainingBoards,
							activeBoardId: nextActiveBoardId
						})
					: entry
			),
			preferredProjectId: currentProjectId
		});

		try {
			await runSyncAction(
				() => deleteProjectBoardRemote(projectId, boardId),
				'Unable to delete this board right now.'
			);
			scheduleSnapshotPersist();
		} catch (error) {
			if (isPocketBaseNotFound(error)) return;
			console.error(error);
			applyWorkspaceState({
				nextProjects: previousProjects,
				preferredProjectId: currentProjectId
			});
		}
	};

	const handleDeletePage = async (projectId: string, pageId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project || project.pages.length <= 1) return;

		const page = project.pages.find((p) => p.id === pageId);
		if (!page) return;

		const confirmed = window.confirm(`Delete page "${page.name}"?`);
		if (!confirmed) return;

		const previousProjects = projects;
		const remainingPages = project.pages.filter((p) => p.id !== pageId);
		const nextActivePageId =
			project.activePageId === pageId ? remainingPages[0]?.id || '' : project.activePageId;

		clearPageSyncState(projectId, pageId);
		applyWorkspaceState({
			nextProjects: projects.map((entry) =>
				entry.id === projectId
					? normalizeProjectStructure({
							...entry,
							pages: remainingPages,
							activePageId: nextActivePageId
						})
					: entry
			),
			preferredProjectId: currentProjectId
		});

		try {
			await runSyncAction(
				() => deleteProjectPageRemote(projectId, pageId),
				'Unable to delete this page right now.'
			);
			scheduleSnapshotPersist();
		} catch (error) {
			if (isPocketBaseNotFound(error)) return;
			console.error(error);
			applyWorkspaceState({
				nextProjects: previousProjects,
				preferredProjectId: currentProjectId
			});
		}
	};

	const handleRenameProject = async (projectId: string, nextName: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const trimmedName = nextName.trim();

		if (
			!project ||
			project.accessRole !== 'owner' ||
			!trimmedName ||
			trimmedName === project.name
		) {
			return;
		}

		const previousProjects = projects;
		applyWorkspaceState({
			nextProjects: previousProjects.map((entry) =>
				entry.id === projectId
					? {
							...entry,
							name: trimmedName,
							updatedAt: Date.now()
						}
					: entry
			),
			preferredProjectId: currentProjectId
		});

		try {
			await runSyncAction(
				() => renameProjectRemote(projectId, trimmedName),
				'Unable to rename this board right now.'
			);
		} catch (error) {
			console.error(error);
			applyWorkspaceState({
				nextProjects: previousProjects,
				preferredProjectId: currentProjectId
			});
		}
	};

	const handleDeleteProject = async (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project || project.accessRole !== 'owner') return;

		const confirmed = window.confirm(
			`Delete "${project.name}"? This will remove the shared board and notes.`
		);
		if (!confirmed) return;

		try {
			await runSyncAction(
				() => deleteProjectRemote(projectId),
				'Unable to delete this board right now.'
			);
			clearProjectSyncState(projectId);
			applyWorkspaceState({
				nextProjects: projects.filter((entry) => entry.id !== projectId),
				preferredProjectId: currentProjectId === projectId ? '' : currentProjectId
			});
		} catch (error) {
			console.error(error);
		}
	};

	const handleToggleProjectPin = async (projectId: string, pinned: boolean) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		const previousProjects = projects;
		const pinnedAt = pinned ? Date.now() : undefined;
		applyWorkspaceState({
			nextProjects: sortProjects(
				previousProjects.map((entry) =>
					entry.id === projectId ? { ...entry, viewerPinnedAt: pinnedAt } : entry
				)
			),
			preferredProjectId: currentProjectId
		});

		try {
			await runSyncAction(
				() => setProjectPinned(projectId, pinned),
				pinned ? 'Unable to pin this board right now.' : 'Unable to unpin this board right now.'
			);
			scheduleSnapshotPersist();
		} catch (error) {
			console.error(error);
			applyWorkspaceState({
				nextProjects: previousProjects,
				preferredProjectId: currentProjectId
			});
		}
	};

	const handleSettingsChange = (nextSettings: UserSettings) => {
		settings = normalizeAiSettings(nextSettings);
		dirtySettings = true;
		refreshSyncStatus();
		scheduleSettingsSync();
		scheduleSnapshotPersist();
	};

	const commitSettingsChange = async (nextSettings: UserSettings) => {
		const previousSettings = settings;
		const previousDirty = dirtySettings;

		if (settingsSyncTimeout) {
			clearTimeout(settingsSyncTimeout);
			settingsSyncTimeout = null;
		}

		settings = normalizeAiSettings(nextSettings);
		dirtySettings = true;
		refreshSyncStatus();
		scheduleSnapshotPersist();

		try {
			await flushSettings();
		} catch (error) {
			settings = previousSettings;
			dirtySettings = previousDirty;
			refreshSyncStatus();
			scheduleSnapshotPersist();
			if (previousDirty) scheduleSettingsSync();
			throw error;
		}
	};

	const commitProjectBackgroundChange = async (
		projectId: string,
		nextBackgroundTheme: BackgroundTheme | null
	) => {
		const projectSnapshot = projects.find((project) => project.id === projectId);
		if (!projectSnapshot) return;

		updateProjectLocal(projectId, (project) => ({
			...project,
			backgroundTheme: nextBackgroundTheme
		}));

		try {
			await runSyncAction(
				() => updateProjectBackground(projectId, nextBackgroundTheme),
				'Unable to sync this board background right now.'
			);
			lastProjectSyncAt = {
				...lastProjectSyncAt,
				[projectId]: Date.now()
			};
		} catch (error) {
			updateProjectLocal(projectId, (project) => ({
				...project,
				backgroundTheme: projectSnapshot.backgroundTheme,
				updatedAt: projectSnapshot.updatedAt
			}));
			throw error;
		}
	};

	const handleSelectPersonalBackground = async (theme: BackgroundTheme) => {
		const previousTheme = settings.backgroundTheme;
		if (getBackgroundThemeKey(previousTheme) === getBackgroundThemeKey(theme)) return;

		try {
			await commitSettingsChange({
				...settings,
				backgroundTheme: theme
			});
			if (isImageBackgroundTheme(previousTheme)) {
				await safelyDeleteBackgroundImage(previousTheme.path);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const handleUploadPersonalBackground = async (file: File) => {
		if (!user) return;

		const validationError = getBackgroundUploadError(file);
		if (validationError) {
			setSyncError(validationError);
			return;
		}

		const previousTheme = settings.backgroundTheme;
		let uploadedTheme: Extract<BackgroundTheme, { kind: 'image' }> | null = null;
		personalBackgroundUploading = true;

		try {
			uploadedTheme = await uploadBackgroundImage('user', user.id, file);
			await commitSettingsChange({
				...settings,
				backgroundTheme: uploadedTheme
			});
			if (isImageBackgroundTheme(previousTheme)) {
				await safelyDeleteBackgroundImage(previousTheme.path);
			}
		} catch (error) {
			console.error(error);
			if (uploadedTheme) {
				await safelyDeleteBackgroundImage(uploadedTheme.path);
			}
		} finally {
			personalBackgroundUploading = false;
		}
	};

	const handleSelectBoardBackground = async (theme: BackgroundTheme) => {
		if (!currentProject) return;

		const projectId = currentProject.id;
		const previousTheme = currentProject.backgroundTheme;
		if (getBackgroundThemeKey(previousTheme) === getBackgroundThemeKey(theme)) return;

		try {
			await commitProjectBackgroundChange(projectId, theme);
			if (isImageBackgroundTheme(previousTheme)) {
				await safelyDeleteBackgroundImage(previousTheme.path);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const handleUploadBoardBackground = async (file: File) => {
		if (!currentProject) return;

		const projectId = currentProject.id;
		const validationError = getBackgroundUploadError(file);
		if (validationError) {
			setSyncError(validationError);
			return;
		}

		const previousTheme = currentProject.backgroundTheme;
		let uploadedTheme: Extract<BackgroundTheme, { kind: 'image' }> | null = null;
		projectBackgroundUploading = true;

		try {
			uploadedTheme = await uploadBackgroundImage('project', projectId, file);
			await commitProjectBackgroundChange(projectId, uploadedTheme);
			if (isImageBackgroundTheme(previousTheme)) {
				await safelyDeleteBackgroundImage(previousTheme.path);
			}
		} catch (error) {
			console.error(error);
			if (uploadedTheme) {
				await safelyDeleteBackgroundImage(uploadedTheme.path);
			}
		} finally {
			projectBackgroundUploading = false;
		}
	};

	const handleClearBoardBackground = async () => {
		if (!currentProject?.backgroundTheme) return;

		const projectId = currentProject.id;
		const previousTheme = currentProject.backgroundTheme;
		try {
			await commitProjectBackgroundChange(projectId, null);
			if (isImageBackgroundTheme(previousTheme)) {
				await safelyDeleteBackgroundImage(previousTheme.path);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const openSettings = (nextSection: SettingsSection = 'appearance') => {
		settingsSection = nextSection;
		setWorkspaceTab('settings');
		showProjectSheet = false;
	};

	const handleDraftChange = (value: string) => {
		composerDraft = value;
	};

	const handleAddAttachments = (attachments: ChatAttachment[]) => {
		queuedAttachments = mergeQueuedAttachments(queuedAttachments, attachments);
	};

	const handleRemoveAttachment = (attachmentId: string) => {
		queuedAttachments = queuedAttachments.filter((attachment) => attachment.id !== attachmentId);
	};

	const handleRemoveTaskCard = (taskCardId: string) => {
		queuedTaskCards = queuedTaskCards.filter((taskCard) => taskCard.id !== taskCardId);
	};

	const handleClearHistory = () => {
		if (!currentProject) return;
		if (!window.confirm(`Clear your private AI chat for "${currentProject.name}"?`)) return;

		updateProjectLocal(currentProject.id, (project) =>
			updateActiveProjectAiSession(project, (session) => ({
				...session,
				history: structuredClone(DEFAULT_CHAT_HISTORY),
				updatedAt: Date.now(),
				lastMessageAt: DEFAULT_CHAT_HISTORY.at(-1)?.timestamp || Date.now()
			}))
		);
		pendingProposals = pendingProposals.filter(
			(proposal) => proposal.projectId !== currentProject.id
		);
		proposalPreviewTarget = null;
		highlightedTaskIds = [];
		scheduleChatSync(currentProject.id, 0);
	};

	const handleCreateAiSession = () => {
		if (!currentProject || isAiProcessing) return;

		const preserveComposerState =
			composerDraft.trim().length > 0 || queuedAttachments.length > 0 || queuedTaskCards.length > 0;

		const emptySession = currentProject.aiSessions.find(
			(s) => isDefaultAiSessionTitle(s.title) && !s.history.some((m) => m.role === 'user')
		);
		if (emptySession) {
			updateProjectLocal(currentProject.id, (project) =>
				setActiveProjectAiSession(project, emptySession.id)
			);
			scheduleChatSync(currentProject.id, 0);
			if (!preserveComposerState) clearComposerState();
			highlightedTaskIds = [];
			return;
		}

		const nextModelId = normalizePreferredAiModelId(settings.preferredAiModelId);
		updateProjectLocal(currentProject.id, (project) => addProjectAiSession(project, nextModelId));
		scheduleChatSync(currentProject.id, 0);
		if (!preserveComposerState) clearComposerState();
		highlightedTaskIds = [];
	};

	const handleActiveAiSessionChange = (sessionId: string) => {
		if (!currentProject || isAiProcessing) return;
		updateProjectLocal(currentProject.id, (project) =>
			setActiveProjectAiSession(project, sessionId)
		);
		scheduleChatSync(currentProject.id, 0);
		clearComposerState();
		highlightedTaskIds = [];
		proposalPreviewTarget = null;
	};

	const handleRenameAiSession = (sessionId: string, title: string) => {
		if (!currentProject || isAiProcessing) return;
		updateProjectLocal(currentProject.id, (project) =>
			renameProjectAiSession(project, sessionId, title)
		);
		scheduleChatSync(currentProject.id, 0);
	};

	const handleDeleteAiSession = (sessionId: string) => {
		if (!currentProject || isAiProcessing) return;
		updateProjectLocal(currentProject.id, (project) =>
			deleteProjectAiSession(project, sessionId, getFallbackAiModelId())
		);
		scheduleChatSync(currentProject.id, 0);
		clearComposerState();
		highlightedTaskIds = [];
		proposalPreviewTarget = null;
	};

	const handleAiModelChange = (modelId: AiModelId) => {
		const nextModelId = normalizePreferredAiModelId(modelId);
		const nextModel = aiModels.find((entry) => entry.id === nextModelId);
		if (nextModel) {
			aiThinkingLevel = defaultThinkingLevelForModel(nextModel);
			lastSyncedAiThinkingModelId = nextModelId;
		}
		handleSettingsChange({
			...settings,
			preferredAiModelId: nextModelId
		});
		if (!currentProject) return;
		updateProjectLocal(currentProject.id, (project) =>
			updateActiveProjectAiSession(project, (session) => ({
				...session,
				modelId: nextModelId,
				updatedAt: Date.now()
			}))
		);
		scheduleChatSync(currentProject.id, 0);
	};

	const handleScratchpadChange = (value: string) => {
		if (!currentProject || !currentPage || proposalPreviewTarget === 'scratchpad') return;
		if (currentPage.content === value) return;

		const updateResult = updateProjectLocal(currentProject.id, (project) =>
			updateProjectPageState(project, currentPage.id, value)
		);
		if (!updateResult) return;

		bumpProjectRevision(currentProject.id, 'scratchpad');
		scheduleScratchpadSync(currentProject.id, currentPage.id, value);
	};

	const handleKanbanChange = (
		nextKanbanData: Project['kanbanData'],
		options: {
			recordHistory?: boolean;
			syncDelay?: number;
		} = {}
	) => {
		if (!currentProject || proposalPreviewTarget === 'kanban') return;

		applyLocalKanbanChange(currentProject, nextKanbanData, options);
	};

	const handleActiveTaskChange = (payload: { taskId?: string; columnId?: string } | null) => {
		activeTaskContext =
			payload?.taskId && payload?.columnId
				? {
						taskId: payload.taskId,
						columnId: payload.columnId
					}
				: null;
	};

	const handleTaskReferenceNavigate = (payload: { taskId: string; columnId: string }) => {
		desktopWorkspaceTab = 'kanban';
		mobileTab = 'kanban';
		desktopChatCollapsed = true;
		activeTaskContext = null;
		highlightedTaskIds = [payload.taskId];
	};

	const handleScratchpadReferenceNavigate = (reference: TaskReferenceOption) => {
		if (reference.kind === 'task') {
			handleTaskReferenceNavigate({
				taskId: reference.id,
				columnId: reference.columnId || ''
			});
		}
	};

	const handleKanbanUndo = () => {
		if (!currentProject || proposalPreviewTarget === 'kanban') return;
		if (!currentBoardId) return;

		const history = getBoardHistoryState(getBoardHistoryKey(currentProject.id, currentBoardId));
		const previousKanbanData = history.past.at(-1);
		if (!previousKanbanData) return;

		const nextHistory: BoardHistoryState = {
			past: history.past.slice(0, -1),
			future: [cloneKanbanData(currentProject.kanbanData), ...history.future].slice(
				0,
				BOARD_HISTORY_LIMIT
			)
		};

		const applied = applyLocalKanbanChange(currentProject, previousKanbanData, {
			recordHistory: false
		});
		if (!applied) return;

		setBoardHistoryState(getBoardHistoryKey(currentProject.id, currentBoardId), nextHistory);
	};

	const handleKanbanRedo = () => {
		if (!currentProject || proposalPreviewTarget === 'kanban') return;
		if (!currentBoardId) return;

		const history = getBoardHistoryState(getBoardHistoryKey(currentProject.id, currentBoardId));
		const nextKanbanData = history.future[0];
		if (!nextKanbanData) return;

		const nextHistory: BoardHistoryState = {
			past: [...history.past, cloneKanbanData(currentProject.kanbanData)].slice(
				-BOARD_HISTORY_LIMIT
			),
			future: history.future.slice(1)
		};

		const applied = applyLocalKanbanChange(currentProject, nextKanbanData, {
			recordHistory: false
		});
		if (!applied) return;

		setBoardHistoryState(getBoardHistoryKey(currentProject.id, currentBoardId), nextHistory);
	};

	const handleSendTaskToChat = (payload: { task: Task; column: Column }) => {
		const alreadyQueued = queuedTaskCards.some(
			(taskCard) => taskCard.taskId === payload.task.id && taskCard.columnId === payload.column.id
		);
		if (alreadyQueued) {
			if (isMobile) {
				mobileTab = 'chat';
			} else {
				desktopChatCollapsed = false;
			}
			return;
		}

		queuedTaskCards = [
			...queuedTaskCards,
			{
				id: createId(),
				taskId: payload.task.id,
				columnId: payload.column.id,
				columnTitle: payload.column.title,
				title: payload.task.title,
				description: payload.task.description,
				tags: payload.task.tags,
				checked: payload.task.checked
			}
		];

		if (isMobile) {
			mobileTab = 'chat';
		} else {
			desktopChatCollapsed = false;
		}
	};

	const buildWorkspaceSummaryForProject = (project: Project): WorkspaceSummary => {
		const columnCount = project.kanbanData.length;
		const taskCount = project.kanbanData.reduce((total, column) => total + column.tasks.length, 0);
		const padCount = project.pages.length;
		const scratchpadBytes = JSON.stringify(project.pages).length;

		return {
			columnCount,
			taskCount,
			padCount,
			memberCount: project.members.length,
			kanbanFullAllowed: columnCount <= 6 && taskCount <= 60,
			scratchpadAllAllowed: padCount <= 6 && scratchpadBytes <= 20 * 1024
		};
	};

	const serializeActiveView = (
		project: Project,
		tab: WorkspaceTab,
		boardId: string,
		padId: string
	): { kind: 'board' | 'page' | 'none'; name: string; content: string } => {
		if (tab === 'kanban') {
			const board = project.boards.find((b) => b.id === boardId) || project.boards[0];
			if (!board) return { kind: 'none', name: 'kanban', content: '' };
			const lines = [`Board: "${board.name}"`];
			for (const col of board.kanbanData) {
				const taskTitles = col.tasks.map((t) => t.title).join(', ');
				lines.push(`[${col.title}] ${taskTitles || '(empty)'}`);
			}
			return { kind: 'board', name: board.name, content: lines.join('\n').slice(0, 3000) };
		}

		if (tab === 'scratchpad') {
			const pad = getScratchpadPadForProject(project, padId);
			if (!pad) return { kind: 'none', name: 'scratchpad', content: '' };
			return { kind: 'page', name: pad.name, content: pad.content.slice(0, 2000) };
		}

		return { kind: 'none', name: tab, content: '' };
	};

	const buildAiHistory = (
		chatHistory: ChatMessage[],
		latestMessage: ChatMessage,
		questionId?: string
	) => {
		const nextHistory: ChatMessage[] = [];
		const seenMessageIds = new Set<string>();
		const pushMessage = (message?: ChatMessage) => {
			if (!message || seenMessageIds.has(message.id)) return;
			seenMessageIds.add(message.id);
			nextHistory.push(message);
		};
		const questionMessage = questionId
			? [...chatHistory].reverse().find((message) => message.question?.id === questionId)
			: undefined;
		const openQuestionMessage = [...chatHistory]
			.reverse()
			.find((message) => message.question?.status === 'open');
		const recentHistory = chatHistory.slice(-(AI_HISTORY_WINDOW - 2));

		pushMessage(questionMessage);
		pushMessage(openQuestionMessage);
		recentHistory.forEach(pushMessage);
		pushMessage(latestMessage);

		return nextHistory.slice(-AI_HISTORY_WINDOW);
	};

	const syncProjectStateForAi = async (projectId: string) => {
		for (const syncKey of getBoardSyncKeysForProject(projectId)) {
			const boardTimeout = boardSyncTimeouts.get(syncKey);
			if (boardTimeout) {
				clearTimeout(boardTimeout);
				boardSyncTimeouts.delete(syncKey);
			}
			await flushBoardSync(syncKey);
		}

		for (const syncKey of getPageSyncKeysForProject(projectId)) {
			const scratchpadTimeout = scratchpadSyncTimeouts.get(syncKey);
			if (scratchpadTimeout) {
				clearTimeout(scratchpadTimeout);
				scratchpadSyncTimeouts.delete(syncKey);
			}
			await flushScratchpadSync(syncKey);
		}

		if (hasPendingBoardSyncForProject(projectId) || hasPendingPageSyncForProject(projectId)) {
			throw new Error('Please let your latest board changes sync before using AI.');
		}
	};

	const mergePendingProposals = (
		projectSnapshot: Project,
		response: Awaited<ReturnType<typeof invokeWorkspaceAi>>
	) => {
		if (!response.proposals.length) {
			return;
		}

		const nextPendingProposals = response.proposals.map((proposal) =>
			proposal.target === 'kanban'
				? {
						...proposal,
						projectId: projectSnapshot.id,
						stale: getKanbanFingerprint(projectSnapshot.kanbanData) !== proposal.baseFingerprint,
						originalKanbanData: structuredClone(projectSnapshot.kanbanData)
					}
				: {
						...proposal,
						projectId: projectSnapshot.id,
						stale: getProjectPagesFingerprint(projectSnapshot.pages) !== proposal.baseFingerprint,
						originalScratchpadState: structuredClone(projectSnapshot.scratchpadData)
					}
		);

		pendingProposals = [
			...pendingProposals.filter(
				(existingProposal) =>
					!(
						existingProposal.projectId === projectSnapshot.id &&
						nextPendingProposals.some(
							(nextProposal) => nextProposal.target === existingProposal.target
						)
					)
			),
			...nextPendingProposals
		];

		if (
			!proposalPreviewTarget ||
			!nextPendingProposals.some((proposal) => proposal.target === proposalPreviewTarget)
		) {
			proposalPreviewTarget = nextPendingProposals[0]?.target || null;
		}

		for (const proposal of nextPendingProposals) {
			logWorkspaceAiProposalDebug('received', projectSnapshot.id, proposal, {
				stale: proposal.stale
			});
		}

		refreshPendingProposalStaleness();
	};

	const buildProposalAppliedMessage = (proposal: PendingProposal): ChatMessage => ({
		id: createId(),
		role: 'assistant',
		text: '',
		timestamp: Date.now(),
		progressEvents: [
			{
				id: createId(),
				kind: 'status',
				message:
					proposal.target === 'kanban'
						? 'Board changes applied to the project.'
						: 'Page changes applied to the project.',
				timestamp: Date.now()
			}
		]
	});

	const handleReviewProposal = (target: ProposalTarget) => {
		const proposal = activePendingProposals.find((entry) => entry.target === target);
		if (!proposal) return;

		proposalPreviewTarget = proposal.target;
		if (proposal.target === 'kanban') {
			desktopWorkspaceTab = 'kanban';
			mobileTab = 'kanban';
			return;
		}

		desktopWorkspaceTab = 'scratchpad';
		mobileTab = 'scratchpad';
	};

	const handleAcceptProposal = async (proposalId: string) => {
		if (!currentProject) return;
		const proposal = activePendingProposals.find((entry) => entry.id === proposalId);
		if (!proposal) return;

		applyingProposalId = proposalId;
		const nextErrors = { ...proposalApplyErrors };
		delete nextErrors[proposalId];
		proposalApplyErrors = nextErrors;

		refreshPendingProposalStaleness();
		const nextProject = projects.find((entry) => entry.id === currentProject.id) || currentProject;
		const refreshedProposal = pendingProposals.find((entry) => entry.id === proposalId) || proposal;
		if (!nextProject) {
			applyingProposalId = null;
			return;
		}

		let applied = false;
		let applyError = '';

		if (refreshedProposal.target === 'kanban') {
			logWorkspaceAiProposalDebug('accept:start', nextProject.id, refreshedProposal, {
				currentFingerprint: getKanbanFingerprint(nextProject.kanbanData),
				stale: refreshedProposal.stale
			});
			if (!nextProject.activeBoardId) {
				applyError = 'No active board is selected for this project.';
			} else {
				applied = applyLocalKanbanChange(nextProject, refreshedProposal.preview.kanbanData, {
					syncDelay: 0
				});
				if (!applied) {
					applyError =
						'Could not apply board changes. The board may already match the preview, or the change could not be saved.';
				} else {
					desktopWorkspaceTab = 'kanban';
					mobileTab = 'kanban';
				}
			}
			const updatedProject = projects.find((entry) => entry.id === nextProject.id) || nextProject;
			logWorkspaceAiProposalDebug('accept:finish', nextProject.id, refreshedProposal, {
				applied,
				resultFingerprint: getKanbanFingerprint(updatedProject.kanbanData),
				resultMatchesPreview:
					getKanbanFingerprint(updatedProject.kanbanData) ===
					getKanbanFingerprint(refreshedProposal.preview.kanbanData)
			});
		} else if (refreshedProposal.target === 'scratchpad') {
			const nextScratchpadState = refreshedProposal.preview.scratchpadState;
			const targetPadId = refreshedProposal.padId || nextScratchpadState.activePadId;
			const previewPads = nextScratchpadState.pads || [];

			if (!previewPads.length) {
				applyError = 'Could not find any page changes to apply.';
			} else {
				logWorkspaceAiProposalDebug('accept:start', nextProject.id, refreshedProposal, {
					currentFingerprint: getProjectPagesFingerprint(nextProject.pages),
					targetPageId: targetPadId,
					currentActivePageId: nextProject.activePageId,
					stale: refreshedProposal.stale,
					previewPadCount: previewPads.length
				});

				try {
					let workingProject = projects.find((entry) => entry.id === nextProject.id) || nextProject;

					for (const pad of previewPads) {
						const existingPage = workingProject.pages.find((page) => page.id === pad.id);
						if (!existingPage) {
							const createdPage = await runSyncAction(
								() =>
									createProjectPage(
										workingProject.id,
										pad.name || 'Untitled',
										workingProject.pages.length,
										{ clientId: pad.id, content: pad.content || '' }
									),
								'Unable to create a new page right now.'
							);
							const withPage = updateProjectLocal(workingProject.id, (project) =>
								setProjectActivePage(
									{
										...project,
										pages: [...project.pages, createdPage]
									},
									createdPage.id
								)
							);
							if (!withPage) {
								throw new Error('Could not add the new page locally.');
							}
							workingProject =
								projects.find((entry) => entry.id === workingProject.id) || withPage.nextProject;
							if (pad.name && pad.name !== createdPage.name) {
								await runSyncAction(
									() => renameProjectPageRemote(workingProject.id, createdPage.id, pad.name),
									'Unable to rename the new page right now.'
								);
								updateProjectLocal(workingProject.id, (project) => ({
									...project,
									pages: project.pages.map((page) =>
										page.id === createdPage.id
											? { ...page, name: pad.name, updatedAt: Date.now() }
											: page
									)
								}));
								workingProject =
									projects.find((entry) => entry.id === workingProject.id) || workingProject;
							}
						} else if (pad.name && pad.name !== existingPage.name) {
							await runSyncAction(
								() => renameProjectPageRemote(workingProject.id, existingPage.id, pad.name),
								'Unable to rename this page right now.'
							);
							updateProjectLocal(workingProject.id, (project) => ({
								...project,
								pages: project.pages.map((page) =>
									page.id === existingPage.id
										? { ...page, name: pad.name, updatedAt: Date.now() }
										: page
								)
							}));
							workingProject =
								projects.find((entry) => entry.id === workingProject.id) || workingProject;
						}
					}

					for (const pad of previewPads) {
						const pageId = pad.id;
						const nextContent = pad.content || '';
						const pageExists = workingProject.pages.some((page) => page.id === pageId);
						if (!pageExists) continue;

						const updateResult = updateProjectLocal(workingProject.id, (project) =>
							updateProjectPageState(project, pageId, nextContent)
						);
						if (!updateResult) {
							throw new Error(`Could not apply content for page "${pad.name}".`);
						}
						await runSyncAction(
							() => syncProjectPageContent(workingProject.id, pageId, nextContent),
							'Unable to sync page content right now.'
						);
					}

					const finalPadId =
						previewPads.find((pad) => pad.id === targetPadId)?.id ||
						previewPads[0]?.id ||
						workingProject.activePageId;
					updateProjectLocal(workingProject.id, (project) =>
						setProjectActivePage(project, finalPadId)
					);

					applied = true;
					bumpProjectRevision(workingProject.id, 'scratchpad');
					desktopWorkspaceTab = 'scratchpad';
					mobileTab = 'scratchpad';
				} catch (error) {
					applyError = error instanceof Error ? error.message : 'Could not apply page changes.';
				}

				const updatedProject = projects.find((entry) => entry.id === nextProject.id) || nextProject;
				logWorkspaceAiProposalDebug('accept:finish', nextProject.id, refreshedProposal, {
					applied,
					targetPageId: targetPadId,
					resultFingerprint: getProjectPagesFingerprint(updatedProject.pages),
					resultMatchesPreview:
						getProjectPagesFingerprint(updatedProject.pages) ===
						getProjectPagesFingerprint(
							previewPads.map((pad) => ({
								id: pad.id,
								name: pad.name,
								content: pad.content
							}))
						)
				});
			}
		}

		applyingProposalId = null;

		if (!applied) {
			proposalApplyErrors = {
				...proposalApplyErrors,
				[proposalId]: applyError || 'Could not apply changes.'
			};
			return;
		}

		updateProjectLocal(nextProject.id, (project) => ({
			...updateActiveProjectAiSession(project, (session) => ({
				...session,
				history: [...session.history, buildProposalAppliedMessage(refreshedProposal)],
				updatedAt: Date.now(),
				lastMessageAt: Date.now()
			}))
		}));
		scheduleChatSync(nextProject.id, 0);

		pendingProposals = pendingProposals.filter((entry) => entry.id !== refreshedProposal.id);
		const remainingErrors = { ...proposalApplyErrors };
		delete remainingErrors[proposalId];
		proposalApplyErrors = remainingErrors;
		if (proposalPreviewTarget === refreshedProposal.target) {
			proposalPreviewTarget = null;
		}
	};

	const handleRejectProposal = (proposalId: string) => {
		const proposal = activePendingProposals.find((entry) => entry.id === proposalId);
		if (!proposal) return;

		pendingProposals = pendingProposals.filter((entry) => entry.id !== proposal.id);
		if (proposalPreviewTarget === proposal.target) {
			proposalPreviewTarget = null;
		}
	};

	const submitAiTurn = async ({
		displayText,
		attachments = [],
		taskCards = [],
		continuation
	}: {
		displayText: string;
		attachments?: ChatAttachment[];
		taskCards?: ChatTaskCard[];
		continuation?: AiQuestionAnswer;
	}) => {
		if (!user || !currentProject || isAiProcessing) return;

		const initialProjectSnapshot = currentProject;

		await syncProjectStateForAi(initialProjectSnapshot.id);

		const projectSnapshot =
			projects.find((project) => project.id === initialProjectSnapshot.id) ||
			initialProjectSnapshot;
		const activeSessionSnapshot = getActiveProjectAiSession(projectSnapshot);
		if (!activeSessionSnapshot) {
			throw new Error('Unable to find an active AI session for this project.');
		}
		const needsAutoTitle = isDefaultAiSessionTitle(activeSessionSnapshot.title);
		const revisionSnapshot = getProjectRevisionState(projectSnapshot.id);
		const timestamp = Date.now();
		const userMessage: ChatMessage = {
			id: createId(),
			role: 'user',
			text: displayText,
			timestamp,
			...(attachments.length ? { attachments } : {}),
			...(taskCards.length ? { taskCards } : {})
		};
		const nextSessionTitle =
			isDefaultAiSessionTitle(activeSessionSnapshot.title) && displayText.trim()
				? buildAiSessionTitle(displayText)
				: activeSessionSnapshot.title;
		const userUpdateResult = updateProjectLocal(projectSnapshot.id, (project) =>
			updateActiveProjectAiSession(project, (session) => ({
				...session,
				title: nextSessionTitle,
				history: [...session.history, userMessage],
				updatedAt: timestamp,
				lastMessageAt: timestamp
			}))
		);
		const aiProjectSnapshot = userUpdateResult?.nextProject || projectSnapshot;
		const aiSessionSnapshot = getActiveProjectAiSession(aiProjectSnapshot) || activeSessionSnapshot;
		scheduleChatSync(projectSnapshot.id);
		highlightedTaskIds = [];
		isAiProcessing = true;
		aiProgressEvents = [];

		try {
			const selectedTaskIds = uniqueIds([
				...taskCards.map((taskCard) => taskCard.taskId),
				...queuedTaskCards.map((taskCard) => taskCard.taskId)
			]);
			const selectedColumnIds = uniqueIds([
				...taskCards.map((taskCard) => taskCard.columnId),
				...queuedTaskCards.map((taskCard) => taskCard.columnId)
			]);
			const activePadId =
				getScratchpadPadForProject(projectSnapshot)?.id ||
				projectSnapshot.scratchpadData.activePadId;
			const boundTarget = buildBoundTargetHint(projectSnapshot, taskCards, activeTaskContext);
			const clientNowIso = new Date().toISOString();
			const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
			const response = await invokeWorkspaceAi(
				{
					projectId: projectSnapshot.id,
					sessionId: aiSessionSnapshot.id,
					modelId: aiSessionSnapshot.modelId,
					thinkingLevel: aiThinkingLevel,
					history: buildAiHistory(aiSessionSnapshot.history, userMessage, continuation?.questionId),
					scope: {
						currentTab: visibleWorkspaceTab,
						selectedTaskIds,
						selectedColumnIds,
						...(currentBoardId ? { activeBoardId: currentBoardId } : {}),
						...(activeTaskContext?.taskId ? { activeTaskId: activeTaskContext.taskId } : {}),
						...(activeTaskContext?.columnId ? { activeColumnId: activeTaskContext.columnId } : {}),
						activePadId,
						clientNowIso,
						...(clientTimezone ? { clientTimezone } : {}),
						boundTarget,
						queuedTaskCards: taskCards,
						revisions: revisionSnapshot,
						workspaceSummary: buildWorkspaceSummaryForProject(projectSnapshot),
						activeViewContent: serializeActiveView(
							projectSnapshot,
							visibleWorkspaceTab,
							currentBoardId,
							activePadId
						)
					},
					...(continuation ? { continuation } : {})
				},
				{
					onProgress: appendAiProgressEvent
				}
			);

			const responseQuestions = response.questions?.length
				? response.questions
				: response.question
					? [response.question]
					: [];
			const assistantMessage: ChatMessage = {
				id: createId(),
				role: 'assistant',
				text: response.reply,
				timestamp: Date.now(),
				metadata: {
					modelId: response.modelId,
					model: response.model,
					latencyMs: response.latencyMs,
					requestId: response.requestId
				},
				annotations: response.annotations,
				toolActions: response.toolActions,
				progressEvents: aiProgressEvents.filter(
					(e) =>
						e.kind !== 'assistant_draft' &&
						e.kind !== 'thinking' &&
						(e.kind !== 'status' || /changes are ready|no project changes/i.test(e.message))
				),
				...(responseQuestions[0] ? { question: responseQuestions[0] } : {}),
				usage: response.usage,
				...(response.stoppedReason ? { stoppedReason: response.stoppedReason } : {})
			};
			const extraQuestionMessages: ChatMessage[] = responseQuestions.slice(1).map((question) => ({
				id: createId(),
				role: 'assistant',
				text: '',
				timestamp: assistantMessage.timestamp,
				question
			}));

			updateProjectLocal(projectSnapshot.id, (project) =>
				updateActiveProjectAiSession(project, (session) => ({
					...session,
					history: [...session.history, assistantMessage, ...extraQuestionMessages],
					updatedAt: assistantMessage.timestamp,
					lastMessageAt: assistantMessage.timestamp
				}))
			);
			scheduleChatSync(projectSnapshot.id);
			highlightedTaskIds = response.highlightedTaskIds;
			const latestProjectSnapshot =
				projects.find((project) => project.id === projectSnapshot.id) || aiProjectSnapshot;
			mergePendingProposals(latestProjectSnapshot, response);

			if (needsAutoTitle) {
				generateSessionTitle(displayText, response.reply).then((generatedTitle) => {
					if (!generatedTitle) return;
					const freshProject = projects.find((p) => p.id === projectSnapshot.id);
					if (!freshProject) return;
					const freshSession = freshProject.aiSessions.find(
						(s) => s.id === activeSessionSnapshot.id
					);
					if (!freshSession) return;
					handleRenameAiSession(activeSessionSnapshot.id, generatedTitle);
				});
			}
		} catch (error) {
			console.error(error);
			const assistantErrorMessage: ChatMessage = {
				id: createId(),
				role: 'assistant',
				text:
					error instanceof Error
						? `I hit a problem while working on that: ${error.message}`
						: 'I hit a problem while working on that request.',
				timestamp: Date.now(),
				metadata: {
					modelId: aiSessionSnapshot.modelId,
					model: 'System',
					latencyMs: 0
				}
			};

			updateProjectLocal(projectSnapshot.id, (project) =>
				updateActiveProjectAiSession(project, (session) => ({
					...session,
					history: [...session.history, assistantErrorMessage],
					updatedAt: assistantErrorMessage.timestamp,
					lastMessageAt: assistantErrorMessage.timestamp
				}))
			);
			scheduleChatSync(projectSnapshot.id);
		} finally {
			isAiProcessing = false;
		}
	};

	const handleSendMessage = async () => {
		if (
			!user ||
			!currentProject ||
			isAiProcessing ||
			(!composerDraft.trim().length &&
				queuedAttachments.length === 0 &&
				queuedTaskCards.length === 0)
		) {
			return;
		}

		const attachmentSnapshot = [...queuedAttachments];
		const taskCardSnapshot = [...queuedTaskCards];
		const baseText = composerDraft.trim();
		const fallbackText = taskCardSnapshot.length
			? 'Shared task cards for context.'
			: 'Shared attachments for context.';
		const displayText = baseText || fallbackText;

		clearComposerState();
		await submitAiTurn({
			displayText,
			attachments: attachmentSnapshot,
			taskCards: taskCardSnapshot
		});
	};

	const handleAnswerQuestion = async (questionId: string, optionId?: string, text?: string) => {
		if (!currentProject || isAiProcessing) return;
		const activeSession = getActiveProjectAiSession(currentProject);
		if (!activeSession) return;

		const questionMessage = [...activeSession.history]
			.reverse()
			.find((message) => message.question?.id === questionId && message.question.status === 'open');
		const selectedOption = questionMessage?.question?.options.find(
			(option) => option.id === optionId
		);
		const answerText = text?.trim() || selectedOption?.label || '';
		if (!answerText.length) return;

		updateProjectLocal(currentProject.id, (project) =>
			updateActiveProjectAiSession(project, (session) => ({
				...session,
				history: session.history.map((message) =>
					message.question?.id === questionId
						? {
								...message,
								question: {
									...message.question,
									status: 'answered',
									answeredOptionId: optionId,
									answerText: text?.trim() || undefined,
									answeredAt: Date.now()
								}
							}
						: message
				),
				updatedAt: Date.now(),
				lastMessageAt: session.lastMessageAt
			}))
		);
		scheduleChatSync(currentProject.id);

		await submitAiTurn({
			displayText: answerText,
			continuation: {
				questionId,
				...(optionId ? { optionId } : {}),
				...(text?.trim() ? { text: text.trim() } : {})
			}
		});
	};

	const handleAnswerQuestions = async (
		answers: { questionId: string; optionId?: string; text?: string }[]
	) => {
		if (!currentProject || isAiProcessing || !answers.length) return;
		const activeSession = getActiveProjectAiSession(currentProject);
		if (!activeSession) return;

		const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
		const openQuestionMessages = activeSession.history.filter(
			(message) =>
				message.question?.status === 'open' && answerByQuestionId.has(message.question.id)
		);
		if (openQuestionMessages.length !== answers.length) return;

		const answerLines = openQuestionMessages
			.map((message, index) => {
				const question = message.question!;
				const answer = answerByQuestionId.get(question.id)!;
				const selectedOption = question.options.find((option) => option.id === answer.optionId);
				const answerText = answer.text?.trim() || selectedOption?.label || '';
				return `${index + 1}. ${question.prompt}\n${answerText}`;
			})
			.filter((line) => line.trim().length > 0);
		if (answerLines.length !== answers.length) return;

		updateProjectLocal(currentProject.id, (project) =>
			updateActiveProjectAiSession(project, (session) => ({
				...session,
				history: session.history.map((message) => {
					if (!message.question || !answerByQuestionId.has(message.question.id)) return message;
					const answer = answerByQuestionId.get(message.question.id)!;
					const selectedOption = message.question.options.find(
						(option) => option.id === answer.optionId
					);
					return {
						...message,
						question: {
							...message.question,
							status: 'answered',
							answeredOptionId: answer.optionId,
							answerText: answer.text?.trim() || selectedOption?.label || undefined,
							answeredAt: Date.now()
						}
					};
				}),
				updatedAt: Date.now(),
				lastMessageAt: session.lastMessageAt
			}))
		);
		scheduleChatSync(currentProject.id);

		const latestAnswer = answers.at(-1)!;
		await submitAiTurn({
			displayText: answerLines.join('\n\n'),
			continuation: {
				questionId: latestAnswer.questionId,
				text: answerLines.join('\n\n')
			}
		});
	};

	const handleExportProjects = () => {
		exportProjectsToFile(projects);
	};

	const pauseWorkspaceRealtimeDuringRestore = () => {
		if (remoteRefreshTimeout) {
			clearTimeout(remoteRefreshTimeout);
			remoteRefreshTimeout = null;
		}
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = null;
	};

	const handleRestoreProjects = async (file: File) => {
		if (!user) return;
		const currentUser = user;

		pauseWorkspaceRealtimeDuringRestore();
		isRestoring = true;

		try {
			const importedProjects = await parseProjectsImport(file, currentUser.id);
			const createdProjectIds: string[] = [];

			for (const importedProject of importedProjects) {
				const createdProject = await runSyncAction(
					() =>
						createProjectRemote(currentUser.id, importedProject.name, importedProject, {
							skipWorkspaceFetch: true
						}),
					`Unable to restore "${importedProject.name}" right now.`
				);
				createdProjectIds.push(createdProject.id);
			}

			const workspace = await fetchWorkspace(currentUser.id, { fresh: true });
			const createdProjects = createdProjectIds
				.map((projectId) => workspace.projects.find((project) => project.id === projectId))
				.filter((project): project is Project => Boolean(project));

			if (createdProjects.length !== createdProjectIds.length) {
				throw new Error(
					'Restore finished but some projects are missing from the workspace reload. Please refresh and try again.'
				);
			}

			for (let index = 0; index < importedProjects.length; index += 1) {
				const importedProject = importedProjects[index];
				const restored = createdProjects.find((project) => project.id === createdProjectIds[index]);
				if (!restored) continue;
				if (restored.boards.length !== importedProject.boards.length) {
					throw new Error(
						`Restore for "${importedProject.name}" is incomplete (${restored.boards.length}/${importedProject.boards.length} boards). Please retry.`
					);
				}
			}

			if (createdProjects.length) {
				const restoredSyncAt = Date.now();
				const nextLastProjectSyncAt = { ...lastProjectSyncAt };
				for (const projectId of createdProjectIds) {
					nextLastProjectSyncAt[projectId] = restoredSyncAt;
				}

				applyWorkspaceState({
					nextProjects: [
						...createdProjects,
						...projects.filter(
							(project) =>
								!createdProjects.some((createdProject) => createdProject.id === project.id)
						)
					],
					preferredProjectId: createdProjects[0].id,
					nextLastProjectSyncAt
				});
				desktopWorkspaceTab = 'dashboard';
				mobileTab = 'dashboard';
			}

			showProjectSheet = false;
		} catch (error) {
			console.error(error);
			workspaceError =
				error instanceof Error ? error.message : 'Unable to restore that backup file.';
		} finally {
			isRestoring = false;
			startWorkspaceSubscription(currentUser);
		}
	};

	const handleInvite = async (projectId: string, email: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const inviteeEmail = email.trim().toLowerCase();

		if (!project || project.accessRole !== 'owner' || !inviteeEmail) return;

		inviteFeedback = null;

		try {
			const result = await runSyncAction(
				() => createProjectInvite(projectId, inviteeEmail),
				'Unable to send that invite right now.'
			);
			const inviteMessage = result?.emailSent
				? `Invite sent to ${inviteeEmail}.`
				: result?.emailError
					? `Invite saved for ${inviteeEmail}. Email failed: ${result.emailError}`
					: result?.emailConfigured
						? `Invite saved for ${inviteeEmail}. Email delivery was not confirmed (SMTP).`
						: `Invite saved for ${inviteeEmail} (email not configured).`;
			inviteFeedback = {
				projectId,
				kind: result?.emailSent || !result?.emailError ? 'success' : 'error',
				message: inviteMessage
			};
			if (user) {
				await refreshWorkspaceFromRemote(user);
			}
		} catch (error) {
			console.error(error);
			inviteFeedback = {
				projectId,
				kind: 'error',
				message: error instanceof Error ? error.message : 'Unable to send that invite right now.'
			};
		}
	};

	const handleAcceptInvite = async (inviteId: string) => {
		const invite = incomingInvites.find((entry) => entry.id === inviteId);
		if (!invite || !user) return;

		try {
			await runSyncAction(
				() => respondToProjectInvite(inviteId, true),
				'Unable to accept that invite right now.'
			);
			await refreshWorkspaceFromRemote(user);
			openProjectWorkspace(invite.projectId);
		} catch (error) {
			console.error(error);
		}
	};

	const handleRejectInvite = async (inviteId: string) => {
		if (!user) return;

		try {
			await runSyncAction(
				() => respondToProjectInvite(inviteId, false),
				'Unable to reject that invite right now.'
			);
			await refreshWorkspaceFromRemote(user);
		} catch (error) {
			console.error(error);
		}
	};

	const handleCancelInvite = async (inviteId: string) => {
		if (!user) return;

		try {
			await runSyncAction(
				() => cancelProjectInvite(inviteId),
				'Unable to cancel that invite right now.'
			);
			await refreshWorkspaceFromRemote(user);
		} catch (error) {
			console.error(error);
		}
	};

	const handleRemoveMember = async (projectId: string, memberUserId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project || project.accessRole !== 'owner') return;
		if (!window.confirm('Remove this collaborator from the board?')) return;

		try {
			await runSyncAction(
				() => removeProjectMember(projectId, memberUserId),
				'Unable to remove that collaborator right now.'
			);
			if (user) {
				await refreshWorkspaceFromRemote(user);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const handleLeaveProject = async (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project || project.accessRole !== 'member') return;
		if (!window.confirm(`Leave "${project.name}"?`)) return;

		try {
			await runSyncAction(() => leaveProject(projectId), 'Unable to leave that board right now.');
			clearProjectSyncState(projectId);
			applyWorkspaceState({
				nextProjects: projects.filter((entry) => entry.id !== projectId),
				preferredProjectId: currentProjectId === projectId ? '' : currentProjectId
			});
		} catch (error) {
			console.error(error);
		}
	};

	const handleSignOut = async () => {
		if (!user) return;

		try {
			clearWorkspaceSnapshot(user.id);
			pocketbase.authStore.clear();
		} catch (error) {
			console.error(error);
			workspaceError = error instanceof Error ? error.message : 'Unable to sign out right now.';
		}
	};

	const clearStaleAuthSession = (currentUserId: string, error: unknown) => {
		if (!isOwnUserRecordNotFound(error, currentUserId)) return false;
		pocketbase.authStore.clear();
		user = null;
		profileLoaded = false;
		workspaceHydrating = false;
		workspaceError = '';
		authErrorMessage =
			'Your session is no longer valid (account not found or access rules reset). Sign in again.';
		return true;
	};

	const handleRetryInitialization = async () => {
		if (!user) return;
		workspaceError = '';
		await bootstrapWorkspace(user);
	};

	const handleAuthStateChange = (event: AuthChangeEvent, nextUser: AuthUser | null) => {
		const previousUserId = user?.id || null;

		authInfoMessage = '';
		authErrorMessage = '';

		if (!nextUser) {
			if (previousUserId) {
				clearWorkspaceSnapshot(previousUserId);
			}
			stopWorkspaceSubscription?.();
			stopWorkspaceSubscription = null;
			resetWorkspaceState();
			user = null;
			authHydrating = false;
			return;
		}

		user = nextUser;
		const userChanged = previousUserId !== nextUser.id;
		if (userChanged) {
			profileLoaded = false;
			syncUsernameDraftFromProfile(createFallbackUserProfile(nextUser));
		}
		authHydrating = false;

		if (shouldReloadWorkspaceForAuthEvent(event, previousUserId, nextUser)) {
			scheduleWorkspaceReload(nextUser);
		} else if (!normalizeUsername(profile?.username)) {
			void refreshUserProfile(nextUser);
		}
	};

	onMount(() => {
		void loadAiModels();
		void fetchAuthSettings()
			.then((settings) => {
				signupsEnabled = settings.signupsEnabled;
				emailConfigured = settings.emailConfigured;
			})
			.catch((error) => {
				console.error(error);
			});
		if (!isPocketBaseConfigured) {
			authHydrating = false;
			return;
		}

		const handlePopState = () => {
			suppressWorkspaceUrlSync = true;
			applyWorkspaceUrlState(parseWorkspaceUrl($page.url.searchParams));
			suppressWorkspaceUrlSync = false;
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				void loadAiModels();
				recoverWorkspaceIfNeeded();
			}
		};

		stopVisibilityListener = () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('popstate', handlePopState);
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('popstate', handlePopState);

		stopAuthListener = pocketbase.authStore.onChange((_token, model) => {
			const nextUser = toAuthUser(model);
			handleAuthStateChange(nextUser ? 'SIGNED_IN' : 'SIGNED_OUT', nextUser);
		});

		handleAuthStateChange('INITIAL_SESSION', toAuthUser(pocketbase.authStore.model));
	});

	onDestroy(() => {
		persistSnapshotNow();
		clearUsernameAvailabilityCheck();
		stopAuthListener?.();
		stopAuthListener = null;
		stopVisibilityListener?.();
		stopVisibilityListener = null;
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = null;

		if (authStateReloadTimeout) clearTimeout(authStateReloadTimeout);
		clearBoardPresenceTimer();
		if (remoteRefreshTimeout) clearTimeout(remoteRefreshTimeout);
		if (localSnapshotTimeout) clearTimeout(localSnapshotTimeout);
		if (settingsSyncTimeout) clearTimeout(settingsSyncTimeout);
		if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);

		for (const timeout of boardSyncTimeouts.values()) clearTimeout(timeout);
		for (const timeout of scratchpadSyncTimeouts.values()) clearTimeout(timeout);
		for (const timeout of chatSyncTimeouts.values()) clearTimeout(timeout);
		boardSyncTimeouts.clear();
		scratchpadSyncTimeouts.clear();
		chatSyncTimeouts.clear();
	});
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	on:focus={recoverWorkspaceIfNeeded}
	on:keydown={handleWorkspaceKeydown}
/>

<svelte:head>
	<title>{currentProject ? `${currentProject.name} | Kainbu` : 'Kainbu'}</title>
</svelte:head>

{#if authHydrating}
	<div
		class="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-app-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-app-text"
	>
		<div class="absolute inset-0 bg-kainbu-grid opacity-20"></div>
		<div class="relative flex items-center gap-3 text-app-subtext">
			<LoaderCircle size={18} class="animate-spin text-app-primary" />
			<span class="text-sm">Restoring workspace…</span>
		</div>
	</div>
{:else if !user}
	<AuthView
		loading={isAuthLoading}
		configured={isPocketBaseConfigured}
		infoMessage={authInfoMessage}
		errorMessage={authErrorMessage}
		{signupsEnabled}
		{emailConfigured}
		theme={settings.backgroundTheme}
		backgroundImageUrl={personalBackgroundImageUrl}
		on:submit={(event) => handleAuthSubmit(event.detail)}
		on:resetPassword={(event) => handlePasswordResetRequest(event.detail.email)}
	/>
{:else}
	<div
		class="relative h-[100dvh] overflow-hidden bg-app-bg pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-app-text"
	>
		<ThemedBackdrop theme={activeBackgroundTheme} imageUrl={activeBackgroundImageUrl} />

		<div class="relative flex h-full min-h-0">
			<ProjectRail
				{projects}
				{currentProjectId}
				{currentBoardId}
				{currentPageId}
				activeSurface={projectRailActiveSurface}
				visible={!isMobile}
				compact={projectRailCompact}
				{syncStatus}
				{profileEmail}
				profileUsername={profile?.username || null}
				onToggleCompact={() => (projectRailCompact = !projectRailCompact)}
				onOpenBoard={openProjectBoard}
				onOpenPage={openProjectPage}
				onCreateBoard={handleCreateBoardInline}
				onCreatePage={handleCreatePageInline}
				onRenameBoard={handleRenameBoardInline}
				onRenamePage={handleRenamePageInline}
				onDeleteBoard={handleDeleteBoard}
				onDeletePage={handleDeletePage}
				onCreate={handleCreateProject}
				onRename={handleRenameProject}
				onDelete={handleDeleteProject}
				onExport={handleExportProjects}
				onRestore={handleRestoreProjects}
				onOpenSettings={openSettings}
				onOpenAccount={() => openSettings('account')}
				onSignOut={handleSignOut}
			/>

			<div class="relative flex min-h-0 min-w-0 flex-1">
				<div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<header class="bg-app-bg/82 px-3 py-2 backdrop-blur-xl lg:px-4">
						<div class="flex flex-wrap items-center gap-2.5">
							{#if isMobile}
								<button
									type="button"
									class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-app-border bg-app-element text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
									on:click={() => (showProjectSheet = true)}
									aria-label="Open workspace menu"
									title="Open workspace menu"
								>
									<Menu size={16} />
								</button>
							{/if}

							<button
								type="button"
								class="inline-flex h-10 items-center justify-center text-app-text transition hover:opacity-85"
								on:click={() => setWorkspaceTab('dashboard')}
								aria-label="Go to dashboard"
								title="Go to dashboard"
							>
								<BrandMark size={36} alt="" />
							</button>

							<div class="min-w-0 flex-1">
								<h1
									class="truncate text-base font-semibold tracking-tight text-app-text lg:text-lg"
								>
									{isMobile ? mobileTitle : desktopTitle}
								</h1>
							</div>

							{#if !isMobile && desktopWorkspaceTab !== 'settings'}
								<div
									class="inline-flex items-center gap-0.5 rounded-lg border border-app-border/40 p-0.5"
								>
									<button
										type="button"
										class={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
											desktopWorkspaceTab === 'dashboard'
												? 'bg-app-element text-app-text'
												: 'text-app-subtext/60 hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab('dashboard')}
										title="Dashboard"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.75"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<rect x="3" y="3" width="7" height="7" rx="1" />
											<rect x="14" y="3" width="7" height="7" rx="1" />
											<rect x="3" y="14" width="7" height="7" rx="1" />
											<rect x="14" y="14" width="7" height="7" rx="1" />
										</svg>
									</button>
									<button
										type="button"
										class={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
											desktopWorkspaceTab === 'kanban'
												? 'bg-app-element text-app-text'
												: 'text-app-subtext/60 hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab('kanban')}
										title="Board"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.75"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<rect x="3" y="3" width="18" height="18" rx="2" />
											<path d="M9 3v18" />
											<path d="M15 3v18" />
										</svg>
									</button>
									<button
										type="button"
										class={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
											desktopWorkspaceTab === 'scratchpad'
												? 'bg-app-element text-app-text'
												: 'text-app-subtext/60 hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab('scratchpad')}
										title="Pages"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.75"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
											<path d="M14 2v4a2 2 0 0 0 2 2h4" />
											<path d="M10 13H8" />
											<path d="M16 13h-2" />
											<path d="M10 17H8" />
											<path d="M16 17h-2" />
										</svg>
									</button>
								</div>
							{/if}

							{#if showBoardSearchControls}
								<button
									type="button"
									class={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
										boardSearchActive
											? 'border-app-primary/35 bg-app-primary/10 text-app-primary'
											: 'border-app-border bg-app-element/80 text-app-subtext hover:bg-app-bg/80 hover:text-app-text'
									}`}
									title={boardSearchActive ? 'Close card search' : 'Search cards (Ctrl+F)'}
									aria-label={boardSearchActive ? 'Close card search' : 'Search cards'}
									aria-pressed={boardSearchActive}
									on:click={() => {
										if (boardSearchActive) {
											closeBoardSearch();
											return;
										}
										boardSearchActive = true;
									}}
								>
									<Search size={16} />
								</button>
							{/if}

							{#if showBoardHistoryControls}
								<div
									class="inline-flex items-center rounded-lg border border-app-border bg-app-element/80 p-1"
								>
									<button
										type="button"
										class={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
											canUndoBoardHistory && proposalPreviewTarget !== 'kanban'
												? 'text-app-subtext hover:bg-app-bg/80 hover:text-app-text'
												: 'cursor-not-allowed text-app-subtext/40'
										}`}
										on:click={handleKanbanUndo}
										disabled={!canUndoBoardHistory || proposalPreviewTarget === 'kanban'}
										aria-label="Undo board change"
										title={proposalPreviewTarget === 'kanban'
											? 'Finish reviewing the proposal before undoing'
											: canUndoBoardHistory
												? 'Undo board change'
												: 'Nothing to undo'}
									>
										<Undo2 size={16} />
									</button>
									<button
										type="button"
										class={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
											canRedoBoardHistory && proposalPreviewTarget !== 'kanban'
												? 'text-app-subtext hover:bg-app-bg/80 hover:text-app-text'
												: 'cursor-not-allowed text-app-subtext/40'
										}`}
										on:click={handleKanbanRedo}
										disabled={!canRedoBoardHistory || proposalPreviewTarget === 'kanban'}
										aria-label="Redo board change"
										title={proposalPreviewTarget === 'kanban'
											? 'Finish reviewing the proposal before redoing'
											: canRedoBoardHistory
												? 'Redo board change'
												: 'Nothing to redo'}
									>
										<Redo2 size={16} />
									</button>
								</div>
							{/if}

							<SyncBadge status={syncStatus} compact={true} hint={syncErrorMessage || undefined} />

							{#if isMobile}
								<button
									type="button"
									class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-app-border bg-app-element text-app-text"
									on:click={handleSignOut}
								>
									<LogOut size={16} />
								</button>
							{/if}
						</div>
					</header>

					{#if workspaceError || isRestoring}
						<div class="space-y-2 px-3 pt-2 lg:px-4">
							{#if workspaceError}
								<div class="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3">
									<div class="flex flex-wrap items-center justify-between gap-3">
										<div>
											<p class="text-sm font-semibold text-rose-100">
												Workspace load needs attention
											</p>
											<p class="mt-1 text-sm text-rose-100/80">{workspaceError}</p>
										</div>
										<button
											type="button"
											class="rounded-md border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100"
											on:click={handleRetryInitialization}
										>
											Retry
										</button>
									</div>
								</div>
							{/if}

							{#if isRestoring}
								<div
									class="rounded-lg border border-app-primary/25 bg-app-primary/10 px-4 py-3 text-sm text-app-text"
								>
									Restoring boards from backup. Board and page data is being recreated now.
								</div>
							{/if}
						</div>
					{/if}

					{#if workspaceHydrating && projects.length === 0}
						<div class="flex min-h-0 flex-1 items-center justify-center p-6">
							<div class="flex items-center gap-3 text-app-subtext">
								<LoaderCircle size={18} class="animate-spin text-app-primary" />
								<span class="text-sm">Loading boards…</span>
							</div>
						</div>
					{:else}
						<div class="min-h-0 flex-1 overflow-hidden">
							{#if isMobile}
								<div class="relative h-full min-h-0 overflow-hidden">
									{#if mobileTab === 'dashboard'}
										<DashboardView
											{projects}
											{currentProjectId}
											{incomingInvites}
											{inviteFeedback}
											{timedTasks}
											onCreateProject={handleCreateProject}
											onOpenProject={openProjectWorkspace}
											onInvite={handleInvite}
											onAcceptInvite={handleAcceptInvite}
											onRejectInvite={handleRejectInvite}
											onCancelInvite={handleCancelInvite}
											onRemoveMember={handleRemoveMember}
											onLeaveProject={handleLeaveProject}
											onRenameProject={handleRenameProject}
											onDeleteProject={handleDeleteProject}
											onToggleProjectPin={handleToggleProjectPin}
											onClearTimedTaskDue={handleClearTimedTaskDue}
										/>
									{:else if mobileTab === 'kanban' && currentProject}
										{#key currentProjectId}
											<div
												class="absolute inset-0"
												in:fade={projectSwitchFadeIn}
												out:fade={projectSwitchFadeOut}
											>
												<KanbanBoard
													projectId={currentProject.id}
													activeBoardId={currentProject.activeBoardId}
													currentUserId={user?.id || ''}
													shareUrl={workspaceShareUrl}
													data={kanbanData}
													comparisonData={kanbanComparisonData}
													{highlightedTaskIds}
													activeTaskId={activeTaskContext?.taskId}
													isLocked={proposalPreviewTarget === 'kanban'}
													defaultShowCheckbox={settings.defaultShowCheckbox}
													active={mobileTab === 'kanban'}
													members={currentProject.members}
													bind:boardSearchActive
													bind:boardSearchQuery
													onChange={handleKanbanChange}
													onSendToChat={handleSendTaskToChat}
													onActiveTaskChange={handleActiveTaskChange}
													onTaskReferenceNavigate={handleTaskReferenceNavigate}
													onAddAttachments={handleAddAttachments}
												/>
											</div>
										{/key}
									{:else if mobileTab === 'scratchpad' && currentProject}
										{#key currentProjectId}
											<div
												class="absolute inset-0 flex flex-col"
												in:fade={projectSwitchFadeIn}
												out:fade={projectSwitchFadeOut}
											>
												<PagePane
													title={currentPage?.name || 'Page'}
													content={scratchpadContent}
													isLocked={proposalPreviewTarget === 'scratchpad'}
													comparisonContent={scratchpadComparisonContent}
													active={mobileTab === 'scratchpad'}
													referenceOptions={scratchpadReferenceOptions}
													onReferenceNavigate={handleScratchpadReferenceNavigate}
													onChange={handleScratchpadChange}
												/>
											</div>
										{/key}
									{:else if mobileTab === 'chat' && currentProject}
										{#key currentProjectId}
											<div
												class="absolute inset-0"
												in:fade={projectSwitchFadeIn}
												out:fade={projectSwitchFadeOut}
											>
												<ChatPane
													history={currentProject.chatHistory}
													bind:draft={composerDraft}
													{queuedAttachments}
													{queuedTaskCards}
													isProcessing={isAiProcessing}
													processingEvents={aiProgressEvents}
													pendingProposals={activePendingProposals}
													{proposalApplyErrors}
													{applyingProposalId}
													activeProposalTarget={proposalPreviewTarget}
													sessions={currentProject.aiSessions}
													activeSessionId={currentProject.activeAiSessionId}
													modelId={activeAiModelId}
													modelOptions={aiModels}
													active={mobileTab === 'chat'}
													chrome="mobile"
													onDraftChange={handleDraftChange}
													onSend={handleSendMessage}
													onAddAttachments={handleAddAttachments}
													onRemoveAttachment={handleRemoveAttachment}
													onRemoveTaskCard={handleRemoveTaskCard}
													onClearHistory={handleClearHistory}
													onSessionChange={handleActiveAiSessionChange}
													onCreateSession={handleCreateAiSession}
													onRenameSession={handleRenameAiSession}
													onDeleteSession={handleDeleteAiSession}
													onModelChange={handleAiModelChange}
													thinkingLevel={aiThinkingLevel}
													onThinkingLevelChange={(level) => {
														aiThinkingLevel = level;
													}}
													onReviewProposal={activePendingProposals.length
														? handleReviewProposal
														: null}
													onAcceptProposal={handleAcceptProposal}
													onRejectProposal={handleRejectProposal}
													onAnswerQuestion={handleAnswerQuestion}
													onAnswerQuestions={handleAnswerQuestions}
												/>
											</div>
										{/key}
									{:else if mobileTab === 'settings'}
										<SettingsView
											section={settingsSection}
											{settings}
											{currentProject}
											email={profileEmail}
											username={profile?.username || null}
											{usernameDraft}
											{usernameAvailability}
											{usernameFeedback}
											{usernameSaving}
											personalImageUrl={personalBackgroundImageUrl}
											boardImageUrl={projectBackgroundImageUrl}
											personalImageUploading={personalBackgroundUploading}
											boardImageUploading={projectBackgroundUploading}
											onSectionChange={handleSettingsSectionChange}
											onUsernameDraftChange={handleUsernameDraftChange}
											onUsernameSubmit={handleUsernameSubmit}
											onSettingsChange={handleSettingsChange}
											onSelectPersonalBackground={handleSelectPersonalBackground}
											onUploadPersonalBackground={handleUploadPersonalBackground}
											onSelectBoardBackground={handleSelectBoardBackground}
											onUploadBoardBackground={handleUploadBoardBackground}
											onClearBoardBackground={handleClearBoardBackground}
										/>
									{:else}
										<div class="flex h-full items-center justify-center p-6">
											<div
												class="max-w-sm rounded-xl border border-dashed border-app-border bg-app-bg/70 p-6 text-center"
											>
												<BrandMark size={56} className="mx-auto" alt="" />
												<p class="mt-4 font-display text-2xl font-bold text-app-text">
													Open a project first
												</p>
												<p class="mt-2 text-sm leading-relaxed text-app-subtext">
													Use the dashboard tab to create or select a project before jumping into
													boards, pages, or private AI chat.
												</p>
												<div class="mt-4 flex justify-center gap-2">
													<button
														type="button"
														class="rounded-md bg-app-primary px-4 py-2 text-sm font-semibold text-white"
														on:click={() => setWorkspaceTab('dashboard')}
													>
														Go to dashboard
													</button>
													<button
														type="button"
														class="rounded-md border border-app-border bg-app-element px-4 py-2 text-sm font-semibold text-app-text"
														on:click={handleCreateProject}
													>
														New project
													</button>
												</div>
											</div>
										</div>
									{/if}
								</div>
							{:else}
								<div class="relative h-full min-w-0 flex-1 overflow-hidden">
									{#if desktopWorkspaceTab === 'dashboard'}
										<DashboardView
											{projects}
											{currentProjectId}
											{incomingInvites}
											{inviteFeedback}
											{timedTasks}
											onCreateProject={handleCreateProject}
											onOpenProject={openProjectWorkspace}
											onInvite={handleInvite}
											onAcceptInvite={handleAcceptInvite}
											onRejectInvite={handleRejectInvite}
											onCancelInvite={handleCancelInvite}
											onRemoveMember={handleRemoveMember}
											onLeaveProject={handleLeaveProject}
											onRenameProject={handleRenameProject}
											onDeleteProject={handleDeleteProject}
											onToggleProjectPin={handleToggleProjectPin}
											onClearTimedTaskDue={handleClearTimedTaskDue}
										/>
									{:else if desktopWorkspaceTab === 'kanban' && currentProject}
										{#key currentProjectId}
											<div
												class="absolute inset-0"
												in:fade={projectSwitchFadeIn}
												out:fade={projectSwitchFadeOut}
											>
												<KanbanBoard
													projectId={currentProject.id}
													activeBoardId={currentProject.activeBoardId}
													currentUserId={user?.id || ''}
													shareUrl={workspaceShareUrl}
													data={kanbanData}
													comparisonData={kanbanComparisonData}
													{highlightedTaskIds}
													activeTaskId={activeTaskContext?.taskId}
													isLocked={proposalPreviewTarget === 'kanban'}
													defaultShowCheckbox={settings.defaultShowCheckbox}
													active={desktopWorkspaceTab === 'kanban'}
													members={currentProject.members}
													bind:boardSearchActive
													bind:boardSearchQuery
													onChange={handleKanbanChange}
													onSendToChat={handleSendTaskToChat}
													onActiveTaskChange={handleActiveTaskChange}
													onTaskReferenceNavigate={handleTaskReferenceNavigate}
													onAddAttachments={handleAddAttachments}
												/>
											</div>
										{/key}
									{:else if desktopWorkspaceTab === 'scratchpad' && currentProject}
										{#key currentProjectId}
											<div
												class="absolute inset-0 flex flex-col"
												in:fade={projectSwitchFadeIn}
												out:fade={projectSwitchFadeOut}
											>
												<PagePane
													title={currentPage?.name || 'Page'}
													content={scratchpadContent}
													isLocked={proposalPreviewTarget === 'scratchpad'}
													comparisonContent={scratchpadComparisonContent}
													active={desktopWorkspaceTab === 'scratchpad'}
													referenceOptions={scratchpadReferenceOptions}
													onReferenceNavigate={handleScratchpadReferenceNavigate}
													onChange={handleScratchpadChange}
												/>
											</div>
										{/key}
									{:else if desktopWorkspaceTab === 'settings'}
										<SettingsView
											section={settingsSection}
											{settings}
											{currentProject}
											email={profileEmail}
											username={profile?.username || null}
											{usernameDraft}
											{usernameAvailability}
											{usernameFeedback}
											{usernameSaving}
											personalImageUrl={personalBackgroundImageUrl}
											boardImageUrl={projectBackgroundImageUrl}
											personalImageUploading={personalBackgroundUploading}
											boardImageUploading={projectBackgroundUploading}
											onSectionChange={handleSettingsSectionChange}
											onUsernameDraftChange={handleUsernameDraftChange}
											onUsernameSubmit={handleUsernameSubmit}
											onSettingsChange={handleSettingsChange}
											onSelectPersonalBackground={handleSelectPersonalBackground}
											onUploadPersonalBackground={handleUploadPersonalBackground}
											onSelectBoardBackground={handleSelectBoardBackground}
											onUploadBoardBackground={handleUploadBoardBackground}
											onClearBoardBackground={handleClearBoardBackground}
										/>
									{:else}
										<div class="flex h-full items-center justify-center p-6">
											<div
												class="max-w-md rounded-xl border border-dashed border-app-border bg-app-bg/70 p-6 text-center"
											>
												<BrandMark size={56} className="mx-auto" alt="" />
												<p class="mt-4 font-display text-2xl font-bold text-app-text">
													Open a project first
												</p>
												<p class="mt-2 text-sm leading-relaxed text-app-subtext">
													Choose a project from the dashboard or rail to start editing boards,
													pages, or your private AI thread.
												</p>
												<div class="mt-4 flex justify-center gap-2">
													<button
														type="button"
														class="rounded-md bg-app-primary px-4 py-2 text-sm font-semibold text-white"
														on:click={() => setWorkspaceTab('dashboard')}
													>
														Go to dashboard
													</button>
													<button
														type="button"
														class="rounded-md border border-app-border bg-app-element px-4 py-2 text-sm font-semibold text-app-text"
														on:click={handleCreateProject}
													>
														New project
													</button>
												</div>
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					{#if isMobile}
						{@const mobileTabs = [
							{ id: 'dashboard', label: 'Home', Icon: LayoutDashboard },
							{ id: 'kanban', label: 'Kanban', Icon: Sparkles },
							{ id: 'scratchpad', label: 'Pages', Icon: NotebookPen },
							{ id: 'chat', label: 'Chat', Icon: MessageSquare },
							{ id: 'settings', label: 'Settings', Icon: Settings2 }
						]}
						{@const activeMobileIndex = Math.max(
							0,
							mobileTabs.findIndex((t) => t.id === mobileTab)
						)}
						<nav
							class="mx-3 mb-[calc(0.5rem+var(--safe-bottom))] mt-2 rounded-2xl border border-app-border/80 bg-app-surface/75 px-1.5 py-1.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl"
						>
							<div class="relative grid grid-cols-5">
								<div
									class="pointer-events-none absolute inset-y-0 left-0 w-1/5 px-1 transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
									style={`transform: translateX(${activeMobileIndex * 100}%);`}
								>
									<div
										class="h-full w-full rounded-xl border border-app-primary/40 bg-app-primary/15"
									></div>
								</div>
								{#each mobileTabs as tab (tab.id)}
									{@const isActive = tab.id === mobileTab}
									<button
										type="button"
										class={`relative z-10 inline-flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
											isActive ? 'text-app-primary' : 'text-app-subtext hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab(tab.id as WorkspaceTab)}
									>
										<svelte:component this={tab.Icon} size={18} />
										{tab.label}
									</button>
								{/each}
							</div>
						</nav>
					{/if}
				</div>

				{#if !isMobile && currentProject && desktopWorkspaceTab !== 'settings'}
					{#if desktopChatCollapsed}
						<button
							type="button"
							class="chat-orb group absolute bottom-5 right-5 z-20 grid h-16 w-16 place-items-center overflow-hidden rounded-full text-white transition-transform duration-200 hover:scale-[1.06]"
							on:click={() => (desktopChatCollapsed = false)}
							aria-label="Open chat sidebar"
							title="Open chat sidebar"
						>
							<span class="chat-orb__blob chat-orb__blob--a" aria-hidden="true"></span>
							<span class="chat-orb__blob chat-orb__blob--b" aria-hidden="true"></span>
							<span class="chat-orb__blob chat-orb__blob--c" aria-hidden="true"></span>
							<Icon
								icon="gravity-ui:circles-concentric"
								class="chat-orb__icon relative z-10 h-7 w-7"
							/>
						</button>
					{/if}
					<div
						class:hidden={desktopChatCollapsed}
						class="relative h-full min-w-0 shrink-0 border-l border-app-border bg-app-surface/92 backdrop-blur-xl"
						aria-hidden={desktopChatCollapsed}
						style={`width:${desktopChatWidth}rem;`}
					>
						<div
							class="absolute left-0 top-0 z-60 h-full w-2 cursor-col-resize transition hover:bg-app-primary/20"
							on:pointerdown={handleDesktopChatResizeStart}
						></div>
						{#key currentProjectId}
							<div
								class="absolute inset-0"
								in:fade={projectSwitchFadeIn}
								out:fade={projectSwitchFadeOut}
							>
								<ChatPane
									history={currentProject.chatHistory}
									bind:draft={composerDraft}
									{queuedAttachments}
									{queuedTaskCards}
									isProcessing={isAiProcessing}
									processingEvents={aiProgressEvents}
									pendingProposals={activePendingProposals}
									{proposalApplyErrors}
									{applyingProposalId}
									activeProposalTarget={proposalPreviewTarget}
									sessions={currentProject.aiSessions}
									activeSessionId={currentProject.activeAiSessionId}
									modelId={activeAiModelId}
									modelOptions={aiModels}
									active={true}
									chrome="sidebar"
									onDraftChange={handleDraftChange}
									onSend={handleSendMessage}
									onAddAttachments={handleAddAttachments}
									onRemoveAttachment={handleRemoveAttachment}
									onRemoveTaskCard={handleRemoveTaskCard}
									onClearHistory={handleClearHistory}
									onSessionChange={handleActiveAiSessionChange}
									onCreateSession={handleCreateAiSession}
									onRenameSession={handleRenameAiSession}
									onDeleteSession={handleDeleteAiSession}
									onModelChange={handleAiModelChange}
									thinkingLevel={aiThinkingLevel}
									onThinkingLevelChange={(level) => {
										aiThinkingLevel = level;
									}}
									onReviewProposal={activePendingProposals.length ? handleReviewProposal : null}
									onAcceptProposal={handleAcceptProposal}
									onRejectProposal={handleRejectProposal}
									onAnswerQuestion={handleAnswerQuestion}
									onAnswerQuestions={handleAnswerQuestions}
									onCollapseSidebar={() => (desktopChatCollapsed = true)}
								/>
							</div>
						{/key}
					</div>
				{/if}
			</div>
		</div>

		{#if requiresUsername}
			<UsernameModal
				email={profileEmail}
				currentUsername={profile?.username || null}
				{usernameDraft}
				availability={usernameAvailability}
				feedback={usernameFeedback}
				saving={usernameSaving}
				onDraftChange={handleUsernameDraftChange}
				onSubmit={handleUsernameSubmit}
				onSignOut={handleSignOut}
			/>
		{/if}

		{#if nameModalState}
			<div
				class="absolute inset-0 z-40 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
			>
				<div
					role="dialog"
					aria-modal="true"
					aria-label={nameModalState.kind === 'create-project'
						? 'Create project'
						: nameModalState.kind === 'create-board'
							? 'Create board'
							: nameModalState.kind === 'create-page'
								? 'Create page'
								: nameModalState.kind === 'rename-board'
									? 'Rename board'
									: 'Rename page'}
					class="w-full max-w-md rounded-xl border border-app-border/60 bg-app-surface/95"
				>
					<div class="border-b border-app-border/40 px-5 py-4">
						<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-primary">
							{nameModalState.kind === 'create-project'
								? 'New Project'
								: nameModalState.kind === 'create-board'
									? 'New Board'
									: nameModalState.kind === 'create-page'
										? 'New Page'
										: nameModalState.kind === 'rename-board'
											? 'Rename Board'
											: 'Rename Page'}
						</p>
						<p class="mt-1 text-sm text-app-subtext">
							{nameModalState.kind === 'create-project'
								? 'Name the new board space so it is easy to find later.'
								: nameModalState.kind === 'create-board'
									? 'Choose a name for this board view.'
									: nameModalState.kind === 'create-page'
										? 'Choose a name for this markdown page.'
										: 'Update the name shown across the workspace.'}
						</p>
					</div>
					<form class="px-5 py-4" on:submit|preventDefault={handleNameModalSubmit}>
						<label class="block">
							<span
								class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext"
							>
								Name
							</span>
							<input
								bind:value={nameModalState.value}
								type="text"
								class="min-w-0 w-full rounded-lg border border-app-border/60 bg-app-bg px-3 py-2 text-sm text-app-text outline-none transition focus:border-app-primary/40"
								placeholder={nameModalState.kind === 'create-project' ? 'Project name' : 'Name'}
								use:focusOnMount
								on:keydown={(event: KeyboardEvent) => {
									if (event.key === 'Escape') nameModalState = null;
								}}
							/>
						</label>
						<div class="mt-4 flex items-center justify-end gap-2">
							<button
								type="button"
								class="rounded-lg border border-app-border/40 px-3 py-2 text-sm text-app-subtext transition hover:text-app-text"
								on:click={() => (nameModalState = null)}
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={!nameModalState.value.trim()}
								class="rounded-lg bg-app-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-app-primary-hover disabled:opacity-40"
							>
								{nameModalState.kind.startsWith('create') ? 'Create' : 'Save'}
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}

		{#if showProjectSheet}
			<ProjectSheet
				{projects}
				{currentProjectId}
				{currentBoardId}
				{currentPageId}
				onClose={() => (showProjectSheet = false)}
				onOpenBoard={openProjectBoard}
				onOpenPage={openProjectPage}
				onCreateBoard={handleCreateBoard}
				onCreatePage={handleCreatePage}
				onRenameBoard={handleRenameBoard}
				onRenamePage={handleRenamePage}
				onDeleteBoard={handleDeleteBoard}
				onDeletePage={handleDeletePage}
				onCreate={handleCreateProject}
				onRename={handleRenameProject}
				onDelete={handleDeleteProject}
				onExport={handleExportProjects}
				onRestore={handleRestoreProjects}
				onOpenSettings={openSettings}
				onSignOut={handleSignOut}
			/>
		{/if}
	</div>
{/if}
