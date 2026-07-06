<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { crossfade, fade } from 'svelte/transition';
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
		Board,
		ChevronDown,
		Document,
		Grid,
		LoaderCircle,
		Menu,
		MessageSquare,
		Plus,
		Redo2,
		Search,
		Undo2
	} from '$lib/icons';
	import AuthView from '$lib/components/AuthView.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ChatOrb from '$lib/components/ChatOrb.svelte';
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
	import { getAvatarUploadError } from '$lib/kainbu/avatar';
	import {
		BACKGROUND_SIGNED_URL_REFRESH_BUFFER_MS,
		BACKGROUND_SIGNED_URL_TTL_SECONDS,
		adaptBackgroundThemeForColorMode,
		getBackgroundThemeKey,
		getBackgroundUploadError,
		applyThemeAccent,
		getChatOrbStyle,
		isImageBackgroundTheme
	} from '$lib/kainbu/backgrounds';
	import {
		createBackgroundSignedUrl,
		deleteBackgroundImage,
		uploadBackgroundImage
	} from '$lib/kainbu/backgroundStorage';
	import { applyColorMode, persistColorMode } from '$lib/kainbu/colorMode';
	import { reconcileUserSettings } from '$lib/kainbu/settings';
	import {
		persistProjectRailCompact,
		readStoredProjectRailCompact
	} from '$lib/kainbu/projectRailLayout';
	import {
		DEFAULT_CHAT_HISTORY,
		DEFAULT_SETTINGS,
		DESKTOP_CHAT_MAX,
		DESKTOP_CHAT_MIN,
		DESKTOP_CHAT_WIDTH
	} from '$lib/kainbu/constants';
	import {
		collectStagedProposalsFromHistory,
		clearStagedProposalsForTargets,
		removeStagedProposalFromHistory,
		toPendingProposals
	} from '$lib/kainbu/aiProposals';
	import { fetchWorkspaceAiModels, generateSessionTitle, invokeWorkspaceAi } from '$lib/kainbu/ai';
	import { prepareChatHistoryForModel } from '$lib/kainbu/aiVision';
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
		removeUserAvatar,
		uploadUserAvatar,
		fetchUserSettings,
		fetchWorkspace,
		leaveProject,
		removeProjectMember,
		renameProject as renameProjectRemote,
		renameProjectBoard as renameProjectBoardRemote,
		renameProjectPage as renameProjectPageRemote,
		updateProjectBoardPreferences as updateProjectBoardPreferencesRemote,
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
	import { updateBoardShareSettings } from '$lib/kainbu/shareApi';
	import {
		buildWorkspaceSearchParams,
		parseWorkspaceUrl,
		workspaceSearchParamsEqual,
		type WorkspaceUrlState
	} from '$lib/kainbu/workspaceUrl';
	import { normalizeBoardPreferences, boardPreferencesEqual } from '$lib/kainbu/boardPreferences';
	import { deletePageAsset, downloadPageAssetBlob, fetchPageAssets, uploadPageAsset, type PageAsset } from '$lib/kainbu/pageAssets';
import { getProjectMemberDisplayName, getProjectMemberSearchText } from '$lib/kainbu/members';
	import {
		getProjectBoard,
		getProjectPage,
		normalizeProjectStructure,
		pageToScratchpadData,
		setProjectActiveBoard,
		setProjectActivePage,
		updateProjectBoardData,
		mergeProjectBoardsByUpdatedAt,
		mergeProjectPagesByUpdatedAt,
		updateProjectBoardPreferences,
		updateProjectPageContent as updateProjectPageState
	} from '$lib/kainbu/projectStructure';
	import { getActiveScratchpadPad, getScratchpadPad } from '$lib/kainbu/scratchpad';
	import type { TaskReferenceOption } from '$lib/kainbu/taskMarkdown';
	import { buildTimedTasks, clearTaskDueAt } from '$lib/kainbu/timing';
	import { formatTagsForAiContext } from '$lib/kainbu/tags';
	import type {
		AiModelConfig,
		AiVisionFallbackConfig,
		AiModelId,
		AiProposal,
		AiProgressEvent,
		AiQuestionAnswer,
		BoardPreferences,
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
	import { ensureFreshAuthToken, isStaleAuthError } from '$lib/kainbu/authSession';
	import { shouldIgnorePocketBaseError } from '$lib/kainbu/pbRequest';
	import { fetchAuthSettings, signupWithAuthSettings } from '$lib/kainbu/adminApi';
	import {
		isAuthRecordUnverified,
		markVerificationResendSent,
		normalizeVerificationEmail
	} from '$lib/auth/verificationResend';

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

	const createInitialSettings = (): UserSettings =>
		reconcileUserSettings(structuredClone(DEFAULT_SETTINGS), {
			preferStoredColorMode: browser
		});

	const resolveColorModeForHydration = (settingsValue: UserSettings): UserSettings =>
		reconcileUserSettings(settingsValue);

	let user: AuthUser | null = null;
	let projects: Project[] = [];
	let incomingInvites: ProjectInvite[] = [];
	let currentProjectId = '';
	let settings: UserSettings = createInitialSettings();
	let aiModels: AiModelConfig[] = structuredClone(DEFAULT_AI_MODEL_CONFIGS);
	let aiVisionFallback: AiVisionFallbackConfig | null = null;
	let aiThinkingLevel: import('$lib/kainbu/types').AiThinkingLevel = 'none';
	let lastSyncedAiThinkingModelId = '';
	let profile: UserProfile | null = null;
	let profileLoaded = false;
	let profileLoadedAt = 0;
	let desktopWorkspaceTab: WorkspaceTab = 'dashboard';
	let mobileTab: WorkspaceTab = 'dashboard';
	let mobileChatPane: { toggleSessionSwitcher: () => void } | undefined;
	let mobileChatSessionTrigger: HTMLButtonElement | null = null;
	let settingsSection: SettingsSection = 'appearance';
	let workspaceTabBeforeSettings: WorkspaceTab = 'dashboard';
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
	let emailVerificationEnabled = false;
	let showResendVerification = false;
	let verificationEmail = '';
	let workspaceError = '';
	let syncErrorMessage = '';
	let boardShareSaving = false;
	let boardShareErrorMessage = '';
	let inviteFeedback: { projectId: string; kind: 'success' | 'error'; message: string } | null =
		null;
	let syncStatus: SyncStatus = 'idle';
	let pendingProposals: PendingProposal[] = [];
	let proposalApplyErrors: Record<string, string> = {};
	let applyingProposalId: string | null = null;
	let highlightedTaskIds: string[] = [];
	let boardSearchActive = false;
	let boardSearchQuery = '';
	let boardSearchInput: HTMLInputElement | null = null;
	let priorBoardSearchActive = false;
	let projectRailCompact = browser ? readStoredProjectRailCompact() : true;

	const projectSwitchFadeIn = { duration: 200 };
	const projectSwitchFadeOut = { duration: 150 };
	const [boardHeaderSend, boardHeaderReceive] = crossfade({
		duration: 200,
		fallback: (node) => fade(node, { duration: 200 })
	});
	let showProjectSheet = false;
	let desktopChatWidth = (() => {
		const saved = localStorage.getItem('kainbu:desktopChatWidth');
		return saved ? parseFloat(saved) : DESKTOP_CHAT_WIDTH;
	})();
	let desktopChatCollapsed = true;
	let chatOrbExitAnimating = false;
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
	let pageAssetUrls: Record<string, string> = {};
	const pageObjectUrls = new Map<string, string>();
	let avatarUploading = false;
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
	const pendingBoardPreferenceSyncs = new Set<string>();
	const pendingBoardDeletions = new Set<string>();
	const pendingPageDeletions = new Set<string>();
	const boardPreferenceSyncTargets = new Map<string, BoardPreferences>();
	const pendingBackgroundSignedUrlLoads = new Map<BackgroundImageScope, Promise<void>>();
	const backgroundSignedUrlMeta = new Map<
		BackgroundImageScope,
		{ themeKey: string; expiresAt: number }
	>();

	$: isMobile = viewportWidth > 0 && viewportWidth < 768;
	$: applyColorMode(settings.colorMode);
	$: currentProject = projects.find((project) => project.id === currentProjectId) || null;
	$: activeAiSession = currentProject ? getActiveProjectAiSession(currentProject) : null;
	$: if (currentProject && activeAiSession && !isAiProcessing) {
		const restored = toPendingProposals(
			currentProject,
			collectStagedProposalsFromHistory(activeAiSession.history)
		);
		pendingProposals = [
			...pendingProposals.filter((proposal) => proposal.projectId !== currentProject.id),
			...restored
		];
		refreshPendingProposalStaleness();
	}
	$: activeAiModelId =
		activeAiSession?.modelId || settings.preferredAiModelId || DEFAULT_AI_MODEL_ID;
	$: if (activeAiModelId && activeAiModelId !== lastSyncedAiThinkingModelId) {
		const model = aiModels.find((entry) => entry.id === activeAiModelId);
		if (model) {
			const stored = settings.preferredAiThinkingLevel;
			const allowed = model.allowedThinkingLevels?.length
				? model.allowedThinkingLevels
				: (['none'] satisfies import('$lib/kainbu/types').AiThinkingLevel[]);
			aiThinkingLevel =
				stored && allowed.includes(stored)
					? stored
					: defaultThinkingLevelForModel(model);
			lastSyncedAiThinkingModelId = activeAiModelId;
		}
	}
	$: currentBoard = currentProject ? getProjectBoard(currentProject) : null;
	$: currentBoardId = currentBoard?.id || '';
	$: boardPreferences = currentBoard
		? normalizeBoardPreferences(currentBoard.preferences, settings.defaultShowCheckbox)
		: normalizeBoardPreferences(undefined, settings.defaultShowCheckbox);
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
	$: mobileHeaderTitle = (() => {
		if (!isMobile) return desktopTitle;
		if (mobileTab === 'dashboard') return 'Dashboard';
		if (mobileTab === 'settings') return 'Settings';
		if (!currentProject) return 'Kainbu';
		if (mobileTab === 'kanban') return currentBoard?.name || 'Board';
		if (mobileTab === 'scratchpad') return currentPage?.name || 'Page';
		if (mobileTab === 'chat') return activeAiSession?.title || 'New chat';
		return currentProject.name;
	})();
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
	$: displayKanbanData = kanbanData.map(column => ({
		...column,
		tasks: column.tasks.filter(task => !task.deletedAt)
	}));
$: kanbanComparisonData =
		previewProposal?.target === 'kanban' ? previewProposal.originalKanbanData : undefined;
	$: mobileHeaderReviewing =
		isMobile &&
		((mobileTab === 'scratchpad' && scratchpadComparisonContent !== undefined) ||
			(mobileTab === 'kanban' && kanbanComparisonData !== undefined));
	$: timedTasks = buildTimedTasks(projects);
	$: visibleWorkspaceTab = isMobile ? mobileTab : desktopWorkspaceTab;
	$: workspaceUrlState = parseWorkspaceUrl($page.url.searchParams);
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
	$: chatOrbStyle = getChatOrbStyle(
		activeBackgroundTheme,
		activeBackgroundImageUrl ?? '',
		settings.colorMode
	);
	$: applyThemeAccent(
		user ? activeBackgroundTheme : settings.backgroundTheme,
		user ? (activeBackgroundImageUrl ?? '') : (personalBackgroundImageUrl ?? ''),
		settings.colorMode
	);
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
		Date.now() - profileLoadedAt > 1500 &&
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

	$: if (
		isMobile &&
		mobileTab === 'kanban' &&
		boardSearchActive &&
		!priorBoardSearchActive
	) {
		void tick().then(() => {
			boardSearchInput?.focus();
			boardSearchInput?.select();
		});
	}
	$: priorBoardSearchActive = boardSearchActive;

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

	const getBoardPreferenceSyncKey = (projectId: string, boardId: string) =>
		`${projectId}::board-pref::${boardId}`;

	const getPendingKanbanBoardIds = (projectId: string) =>
		new Set(
			getBoardSyncKeysForProject(projectId).map((key) =>
				key.slice(`${projectId}::board::`.length)
			)
		);
	const getPendingSyncPageIds = (projectId: string) =>
		new Set(
			getPageSyncKeysForProject(projectId).map((key) => key.slice(`${projectId}::page::`.length))
		);
	const getPendingBoardPreferenceBoardIds = (projectId: string) =>
		new Set(
			[...new Set([...pendingBoardPreferenceSyncs, ...boardPreferenceSyncTargets.keys()])]
				.filter((key) => key.startsWith(`${projectId}::board-pref::`))
				.map((key) => key.slice(`${projectId}::board-pref::`.length))
		);

	const reconcileBoardPreferenceSyncTargets = (nextProjects: Project[]) => {
		const marker = '::board-pref::';

		for (const [syncKey, targetPreferences] of boardPreferenceSyncTargets.entries()) {
			const markerIndex = syncKey.indexOf(marker);
			if (markerIndex === -1) continue;

			const projectId = syncKey.slice(0, markerIndex);
			const boardId = syncKey.slice(markerIndex + marker.length);
			const project = nextProjects.find((entry) => entry.id === projectId);
			const board = project ? getProjectBoard(project, boardId) : null;

			if (
				board &&
				boardPreferencesEqual(
					normalizeBoardPreferences(board.preferences),
					normalizeBoardPreferences(targetPreferences)
				)
			) {
				boardPreferenceSyncTargets.delete(syncKey);
				pendingBoardPreferenceSyncs.delete(syncKey);
			}
		}
	};
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
		username: null,
		avatarUrl: null
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
	const syncCurrentUserAvatarAcrossProjects = (avatarUrl: string | null) => {
		const currentUserId = user?.id;
		if (!currentUserId) return;
		projects = projects.map((project) => ({
			...project,
			members: project.members.map((member) =>
				member.userId === currentUserId ? { ...member, avatarUrl } : member
			)
		}));
	};
	const syncUsernameDraftFromProfile = (nextProfile: UserProfile | null) => {
		profile = nextProfile;
		syncCurrentUserAvatarAcrossProjects(nextProfile?.avatarUrl ?? null);
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
		const normalizedSettings = reconcileUserSettings(normalizeAiSettings(nextSettings));
		persistColorMode(normalizedSettings.colorMode);
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

		if (profileLoaded && profile?.userId && user?.id === profile.userId) {
			syncCurrentUserAvatarAcrossProjects(profile.avatarUrl ?? null);
		}

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
		pendingBoardPreferenceSyncs.clear();
		pendingBoardDeletions.clear();
		pendingPageDeletions.clear();
		boardPreferenceSyncTargets.clear();
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = null;

		workspaceLoadVersion += 1;
		activeSyncRequests = 0;
		projects = [];
		incomingInvites = [];
		currentProjectId = '';
		settings = createInitialSettings();
		profile = null;
		profileLoaded = false;
		profileLoadedAt = 0;
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
			if (user && clearStaleAuthSession(user.id, error)) {
				throw error;
			}
			console.error(error);
			setSyncError(formatPocketBaseError(error, fallbackMessage));
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
			const remoteBoardIds = new Set(remoteProject.boards.map((board) => board.id));
			const remotePageIds = new Set(remoteProject.pages.map((page) => page.id));
			for (const deletionKey of [...pendingBoardDeletions]) {
				if (!deletionKey.startsWith(`${remoteProject.id}::board::`)) continue;
				const boardId = deletionKey.slice(`${remoteProject.id}::board::`.length);
				if (!remoteBoardIds.has(boardId)) {
					pendingBoardDeletions.delete(deletionKey);
				}
			}
			for (const deletionKey of [...pendingPageDeletions]) {
				if (!deletionKey.startsWith(`${remoteProject.id}::page::`)) continue;
				const pageId = deletionKey.slice(`${remoteProject.id}::page::`.length);
				if (!remotePageIds.has(pageId)) {
					pendingPageDeletions.delete(deletionKey);
				}
			}
			const mergedBoards = mergeProjectBoardsByUpdatedAt(
				localProject.boards,
				remoteProject.boards,
				new Set([
					...getPendingBoardPreferenceBoardIds(remoteProject.id),
					...getPendingKanbanBoardIds(remoteProject.id)
				])
			).filter(
				(board) => !pendingBoardDeletions.has(getBoardHistoryKey(remoteProject.id, board.id))
			);
			const mergedPages = mergeProjectPagesByUpdatedAt(
				localProject.pages,
				remoteProject.pages,
				getPendingSyncPageIds(remoteProject.id)
			).filter((page) => !pendingPageDeletions.has(getPageSyncKey(remoteProject.id, page.id)));
			const preferLocalAiState = pendingChatSyncs.has(remoteProject.id) || preferLocalFallback;
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
				const mergedMember =
					localPresence > remotePresence
						? {
								...remoteMember,
								viewingBoardId: localMember.viewingBoardId ?? remoteMember.viewingBoardId,
								presenceAt: localMember.presenceAt
							}
						: remoteMember;

				if (
					user?.id &&
					remoteMember.userId === user.id &&
					localMember.avatarUrl &&
					!remoteMember.avatarUrl
				) {
					return { ...mergedMember, avatarUrl: localMember.avatarUrl };
				}

				return mergedMember;
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
				nextSettings: resolveColorModeForHydration(localSnapshot.settings),
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
					fetchWorkspace(currentUser.id, { fresh: true }),
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

			const resolvedSettings = resolveColorModeForHydration(
				localSnapshot?.dirtySettings
					? localSnapshot.settings
					: settingsResult.status === 'fulfilled'
						? !supportsProfileBackgroundTheme() && localSnapshot?.settings
							? {
									...settingsResult.value,
									backgroundTheme: localSnapshot.settings.backgroundTheme
								}
							: settingsResult.value
						: localSnapshot?.settings || structuredClone(DEFAULT_SETTINGS)
			);

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
				profileLoadedAt = profileLoadedAt || Date.now();
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
			const { models: nextModels, visionFallback: nextVisionFallback } =
				await fetchWorkspaceAiModels();
			if (!nextModels.length) return;
			const previousModelIds = new Set(aiModels.map((model) => model.id));
			const nextModelIds = new Set(nextModels.map((model) => model.id));
			const catalogChanged =
				previousModelIds.size !== nextModelIds.size ||
				[...nextModelIds].some((id) => !previousModelIds.has(id));
			aiModels = nextModels;
			aiVisionFallback = nextVisionFallback;
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
				const mergedProjects = mergeRemoteProjects(projects, workspace.projects);
				reconcileBoardPreferenceSyncTargets(mergedProjects);
				applyWorkspaceState({
					nextProjects: mergedProjects,
					nextIncomingInvites: workspace.incomingInvites,
					preferredProjectId: currentProjectId
				});
			} catch (error) {
				if (shouldIgnorePocketBaseError(error)) return;
				if (clearStaleAuthSession(currentUser.id, error)) return;
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
		void (async () => {
			try {
				await ensureFreshAuthToken(pocketbase);
			} catch (error) {
				if (clearStaleAuthSession(user.id, error)) return;
			}
			if (!user || document.visibilityState === 'hidden') return;
			if (workspaceHydrating || Boolean(workspaceError)) {
				await bootstrapWorkspace(user);
				return;
			}
			if (!normalizeUsername(profile?.username)) {
				void refreshUserProfile(user);
			}
			void refreshWorkspaceFromRemote(user);
		})();
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

	const promptVerificationRequired = (email: string) => {
		verificationEmail = normalizeVerificationEmail(email);
		authErrorMessage =
			'Verify your email before signing in. Check your inbox for the verification link.';
		showResendVerification = true;
	};

	const rejectUnverifiedSession = (email: string) => {
		if (!emailVerificationEnabled || !isAuthRecordUnverified(pocketbase.authStore.model)) {
			return false;
		}
		const accountEmail = normalizeVerificationEmail(
			String(pocketbase.authStore.model?.email || email)
		);
		pocketbase.authStore.clear();
		promptVerificationRequired(accountEmail);
		return true;
	};

	const handleResendVerificationRequest = async (email: string) => {
		authErrorMessage = '';
		authInfoMessage = '';
		const normalizedEmail = normalizeVerificationEmail(email || verificationEmail);
		if (!normalizedEmail) {
			authErrorMessage = 'Enter your email before requesting a verification link.';
			return;
		}
		isAuthLoading = true;
		try {
			await pocketbase.collection('users').requestVerification(normalizedEmail);
			verificationEmail = normalizedEmail;
			markVerificationResendSent(normalizedEmail);
			showResendVerification = true;
			authInfoMessage = 'Verification email sent. Check your inbox.';
		} catch (error) {
			console.error(error);
			authErrorMessage = formatPocketBaseError(error, 'Unable to send verification email.');
		} finally {
			isAuthLoading = false;
		}
	};

	const handleAuthSubmit = async (payload: {
		email: string;
		password: string;
		isSignUp: boolean;
	}) => {
		authErrorMessage = '';
		authInfoMessage = '';
		showResendVerification = false;
		isAuthLoading = true;

		try {
			if (payload.isSignUp) {
				const result = await signupWithAuthSettings(payload.email, payload.password);
				if (result.requiresVerification) {
					verificationEmail = normalizeVerificationEmail(payload.email);
					authInfoMessage =
						'Account created. Check your email to verify your address before signing in.';
					showResendVerification = true;
					return;
				}
				await pocketbase.collection('users').authWithPassword(payload.email, payload.password);
				if (rejectUnverifiedSession(payload.email)) return;
				authInfoMessage = 'Account created.';
				return;
			}

			await pocketbase.collection('users').authWithPassword(payload.email, payload.password);
			if (rejectUnverifiedSession(payload.email)) return;
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
			localStorage.setItem('kainbu:desktopChatWidth', String(desktopChatWidth));
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', stopResizing);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', stopResizing);
	};

	const openDesktopChatSidebar = () => {
		if (isMobile || !desktopChatCollapsed) return;
		chatOrbExitAnimating = true;
		desktopChatCollapsed = false;
	};

	const handleChatOrbExitComplete = () => {
		chatOrbExitAnimating = false;
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
		showProjectSheet = false;
		nameModalState = {
			kind: 'create-board',
			projectId,
			value: `Board ${project.boards.length + 1}`
		};
	};

	const handleCreatePage = (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;
		showProjectSheet = false;
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
		const pendingModal = nameModalState;
		const { kind, projectId, itemId, value } = pendingModal;
		const name = value.trim();
		if (!name) return;

		const closeNameModal = () => {
			nameModalState = null;
		};
		const restoreNameModal = () => {
			nameModalState = pendingModal;
		};

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
				closeNameModal();
			} catch (error) {
				restoreNameModal();
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
				closeNameModal();
			} catch (error) {
				restoreNameModal();
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
				closeNameModal();
			} catch (error) {
				restoreNameModal();
				console.error(error);
			}
		} else if (kind === 'rename-board' && itemId) {
			const board = project.boards.find((b) => b.id === itemId);
			if (!board || board.name === name) {
				closeNameModal();
				return;
			}
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
				closeNameModal();
			} catch (error) {
				restoreNameModal();
				console.error(error);
			}
		} else if (kind === 'rename-page' && itemId) {
			const page = project.pages.find((p) => p.id === itemId);
			if (!page || page.name === name) {
				closeNameModal();
				return;
			}
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
				closeNameModal();
			} catch (error) {
				restoreNameModal();
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

		const deletionKey = getBoardHistoryKey(projectId, boardId);
		pendingBoardDeletions.add(deletionKey);

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
			pendingBoardDeletions.delete(deletionKey);
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

		const deletionKey = getPageSyncKey(projectId, pageId);
		pendingPageDeletions.add(deletionKey);

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
			pendingPageDeletions.delete(deletionKey);
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
		let normalizedSettings = normalizeAiSettings(nextSettings);
		const colorModeChanged = normalizedSettings.colorMode !== settings.colorMode;

		if (colorModeChanged) {
			persistColorMode(normalizedSettings.colorMode);
			normalizedSettings = {
				...normalizedSettings,
				backgroundTheme: adaptBackgroundThemeForColorMode(
					normalizedSettings.backgroundTheme,
					normalizedSettings.colorMode
				)
			};

			const project = currentProject;
			if (project?.backgroundTheme) {
				const adaptedBoardTheme = adaptBackgroundThemeForColorMode(
					project.backgroundTheme,
					normalizedSettings.colorMode
				);

				if (
					getBackgroundThemeKey(adaptedBoardTheme) !==
					getBackgroundThemeKey(project.backgroundTheme)
				) {
					void commitProjectBackgroundChange(project.id, adaptedBoardTheme);
				}
			}
		}

		settings = normalizedSettings;
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
		const themeChanged =
			getBackgroundThemeKey(previousTheme) !== getBackgroundThemeKey(theme);

		try {
			if (themeChanged) {
				await commitSettingsChange({
					...settings,
					backgroundTheme: theme
				});
				if (isImageBackgroundTheme(previousTheme)) {
					await safelyDeleteBackgroundImage(previousTheme.path);
				}
			} else {
				applyThemeAccent(theme, personalBackgroundImageUrl ?? '', settings.colorMode);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const handleUploadAvatar = async (file: File) => {
		if (!user) return;

		const validationError = getAvatarUploadError(file);
		if (validationError) {
			setSyncError(validationError);
			return;
		}

		avatarUploading = true;
		try {
			const nextProfile = await uploadUserAvatar(user.id, file);
			profile = nextProfile;
			syncCurrentUserAvatarAcrossProjects(nextProfile.avatarUrl);
		} catch (error) {
			console.error(error);
			setSyncError(error instanceof Error ? error.message : 'Unable to upload profile picture.');
		} finally {
			avatarUploading = false;
		}
	};

	const handleRemoveAvatar = async () => {
		if (!user || !profile?.avatarUrl) return;

		avatarUploading = true;
		try {
			const nextProfile = await removeUserAvatar(user.id);
			profile = nextProfile;
			syncCurrentUserAvatarAcrossProjects(null);
		} catch (error) {
			console.error(error);
			setSyncError(error instanceof Error ? error.message : 'Unable to remove profile picture.');
		} finally {
			avatarUploading = false;
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
		const themeChanged =
			getBackgroundThemeKey(previousTheme) !== getBackgroundThemeKey(theme);

		try {
			if (themeChanged) {
				await commitProjectBackgroundChange(projectId, theme);
				if (isImageBackgroundTheme(previousTheme)) {
					await safelyDeleteBackgroundImage(previousTheme.path);
				}
			} else {
				applyThemeAccent(
					theme,
					projectBackgroundImageUrl ?? '',
					settings.colorMode
				);
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
		const currentTab = isMobile ? mobileTab : desktopWorkspaceTab;
		workspaceTabBeforeSettings =
			currentTab !== 'settings' ? currentTab : workspaceTabBeforeSettings;
		settingsSection = nextSection;
		setWorkspaceTab('settings');
		showProjectSheet = false;
	};

	const closeSettings = () => {
		setWorkspaceTab(workspaceTabBeforeSettings);
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
			const stored = settings.preferredAiThinkingLevel;
			const allowed = nextModel.allowedThinkingLevels?.length
				? nextModel.allowedThinkingLevels
				: (['none'] satisfies import('$lib/kainbu/types').AiThinkingLevel[]);
			aiThinkingLevel =
				stored && allowed.includes(stored)
					? stored
					: defaultThinkingLevelForModel(nextModel);
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

	const setPageObjectUrl = (key: string, url: string) => {
		const previousUrl = pageObjectUrls.get(key);
		if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
		pageObjectUrls.set(key, url);
		pageAssetUrls = { ...pageAssetUrls, [key]: url };
	};

	const promotePageObjectUrl = (fromKey: string, toKey: string) => {
		const url = pageObjectUrls.get(fromKey);
		if (!url) return;
		pageObjectUrls.delete(fromKey);
		pageObjectUrls.set(toKey, url);
		const nextUrls = { ...pageAssetUrls };
		delete nextUrls[fromKey];
		nextUrls[toKey] = url;
		pageAssetUrls = nextUrls;
	};

	const dropPageObjectUrl = (key: string, revoke = true) => {
		const previousUrl = pageObjectUrls.get(key);
		if (previousUrl && revoke) URL.revokeObjectURL(previousUrl);
		pageObjectUrls.delete(key);
		const { [key]: _discarded, ...remaining } = pageAssetUrls;
		pageAssetUrls = remaining;
	};

	const ensurePageAssetPreview = async (asset: PageAsset) => {
		if (!asset.mimeType.startsWith('image/') || pageAssetUrls[asset.id]) return;
		try {
			const blob = await downloadPageAssetBlob(asset);
			setPageObjectUrl(asset.id, URL.createObjectURL(blob));
		} catch (error) {
			console.error(error);
		}
	};

	// Fetch page assets whenever the current page changes
	$: if (currentProject && currentPage) {
		fetchPageAssets(currentProject.id, currentPage.id).then((assets) => {
			for (const asset of assets) {
				void ensurePageAssetPreview(asset);
			}
		}).catch((error) => {
			console.error(error);
		});
	}

	const handlePageEmbedUpload = async (
		requests: Array<{ tempId: string; file: File; source: 'paste' | 'command' }>
	) => {
		const projectId = currentProject?.id;
		const pageId = currentPage?.id;
		if (!projectId || !pageId) {
			return requests.map((request) => ({ tempId: request.tempId, error: 'No active page.' }));
		}

		// Set blob URLs for immediate preview while uploading
		for (const request of requests) {
			if (request.file.type.startsWith('image/')) {
				setPageObjectUrl(`pending:${request.tempId}`, URL.createObjectURL(request.file));
			}
		}

		const results = await Promise.all(
			requests.map(async (request) => {
				try {
					const asset = await uploadPageAsset(projectId, pageId, request.file, 'embed');
					if (pageAssetUrls[`pending:${request.tempId}`]) {
						promotePageObjectUrl(`pending:${request.tempId}`, asset.id);
					} else {
						void ensurePageAssetPreview(asset);
					}
					return { tempId: request.tempId, assetId: asset.id };
				} catch (error) {
					dropPageObjectUrl(`pending:${request.tempId}`);
					return {
						tempId: request.tempId,
						error: error instanceof Error ? error.message : 'Unable to upload image.'
					};
				}
			})
		);

		return results;
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

	const handleBoardShareSettingsChange = async (
		boardId: string,
		payload: { sharePublic?: boolean }
	) => {
		if (!currentProject || !boardId) return;

		boardShareSaving = true;
		boardShareErrorMessage = '';

		try {
			const result = await updateBoardShareSettings({
				projectId: currentProject.id,
				boardId,
				...(typeof payload.sharePublic === 'boolean' ? { sharePublic: payload.sharePublic } : {})
			});

			updateProjectLocal(currentProject.id, (project) => ({
				...project,
				boards: project.boards.map((board) =>
					board.id === boardId
						? {
								...board,
								shareSlug: result.shareSlug,
								sharePublic: result.sharePublic
							}
						: board
				)
			}));
		} catch (error) {
			boardShareErrorMessage =
				error instanceof Error ? error.message : 'Unable to update share settings right now.';
		} finally {
			boardShareSaving = false;
		}
	};

	const handleBoardPreferencesChange = (boardId: string, nextPreferences: BoardPreferences) => {
		if (!currentProject || !boardId) return;
		if (!getProjectBoard(currentProject, boardId)) return;

		const projectId = currentProject.id;
		const normalizedPreferences = normalizeBoardPreferences(nextPreferences);
		const preferenceSyncKey = getBoardPreferenceSyncKey(projectId, boardId);

		updateProjectLocal(projectId, (project) =>
			updateProjectBoardPreferences(project, boardId, normalizedPreferences)
		);

		boardPreferenceSyncTargets.set(preferenceSyncKey, normalizedPreferences);
		pendingBoardPreferenceSyncs.add(preferenceSyncKey);
		refreshSyncStatus();

		void (async () => {
			try {
				await runSyncAction(
					() =>
						updateProjectBoardPreferencesRemote(projectId, boardId, normalizedPreferences),
					'Unable to save board options right now.'
				);
			} catch (error) {
				console.error(error);
			} finally {
				pendingBoardPreferenceSyncs.delete(preferenceSyncKey);
				refreshSyncStatus();
			}
		})();
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
				const taskSummaries = col.tasks.map((task) => {
					const tagSuffix = task.tags?.length
						? ` [${formatTagsForAiContext(task.tags)}]`
						: '';
					return `${task.title}${tagSuffix}`;
				});
				lines.push(`[${col.title}] ${taskSummaries.join(', ') || '(empty)'}`);
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

		const nextPendingProposals = toPendingProposals(projectSnapshot, response.proposals);

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
				history: [
					...removeStagedProposalFromHistory(session.history, refreshedProposal.id),
					buildProposalAppliedMessage(refreshedProposal)
				],
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
		if (!proposal || !currentProject) return;

		updateProjectLocal(currentProject.id, (project) =>
			updateActiveProjectAiSession(project, (session) => ({
				...session,
				history: removeStagedProposalFromHistory(session.history, proposalId),
				updatedAt: Date.now()
			}))
		);
		scheduleChatSync(currentProject.id);

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
			const activeModelConfig =
				aiModels.find((model) => model.id === aiSessionSnapshot.modelId) ?? aiModels[0];
			const rawHistory = buildAiHistory(
				aiSessionSnapshot.history,
				userMessage,
				continuation?.questionId
			);
			const historyForModel = await prepareChatHistoryForModel(
				rawHistory,
				activeModelConfig,
				aiVisionFallback
			);
			const response = await invokeWorkspaceAi(
				{
					projectId: projectSnapshot.id,
					sessionId: aiSessionSnapshot.id,
					modelId: aiSessionSnapshot.modelId,
					thinkingLevel: aiThinkingLevel,
					history: historyForModel,
					...(aiSessionSnapshot.contextSummary !== undefined
						? { contextSummary: aiSessionSnapshot.contextSummary }
						: {}),
					...(aiSessionSnapshot.summarizedUpToMessageId
						? { summarizedUpToMessageId: aiSessionSnapshot.summarizedUpToMessageId }
						: {}),
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
			const supersededProposalTargets = response.proposals.map((proposal) => proposal.target);
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
				...(response.proposals.length ? { stagedProposals: response.proposals } : {}),
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
					history: [
						...clearStagedProposalsForTargets(session.history, supersededProposalTargets),
						assistantMessage,
						...extraQuestionMessages
					],
					...(response.compacted
						? {
								contextSummary: response.contextSummary,
								summarizedUpToMessageId: response.summarizedUpToMessageId ?? null
							}
						: {}),
					...(typeof response.contextTokens === 'number'
						? { contextTokens: response.contextTokens }
						: {}),
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
		if (!isStaleAuthError(error, currentUserId)) return false;
		const staleEmail = user?.email || pocketbase.authStore.model?.email;
		pocketbase.authStore.clear();
		handleAuthStateChange('SIGNED_OUT', null);
		authErrorMessage = isOwnUserRecordNotFound(error, currentUserId)
			? 'Your session is no longer valid (account not found or access rules reset). Sign in again.'
			: staleEmail
				? 'Your session expired. Sign in again to continue.'
				: 'Your session expired. Sign in again.';
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
			profileLoadedAt = 0;
			syncUsernameDraftFromProfile(createFallbackUserProfile(nextUser));
		}
		authHydrating = false;

		if (shouldReloadWorkspaceForAuthEvent(event, previousUserId, nextUser)) {
			scheduleWorkspaceReload(nextUser);
		} else if (!normalizeUsername(profile?.username)) {
			void refreshUserProfile(nextUser);
		}
	};

	const refreshStoredAuthSession = async () => {
		if (!pocketbase.authStore.token) {
			handleAuthStateChange('INITIAL_SESSION', null);
			return;
		}

		try {
			await pocketbase.collection('users').authRefresh();
			handleAuthStateChange('TOKEN_REFRESHED', toAuthUser(pocketbase.authStore.model));
		} catch (error) {
			console.error('[auth] stored session refresh failed', error);
			const staleUser = toAuthUser(pocketbase.authStore.model);
			pocketbase.authStore.clear();
			handleAuthStateChange('SIGNED_OUT', null);
			if (staleUser?.email) {
				authErrorMessage = 'Your saved session expired. Sign in again to continue.';
			}
		}
	};

	onMount(() => {
		settings = reconcileUserSettings(settings, { preferStoredColorMode: true });
		persistColorMode(settings.colorMode);

		void loadAiModels();
		void fetchAuthSettings()
			.then((settings) => {
				signupsEnabled = settings.signupsEnabled;
				emailConfigured = settings.emailConfigured;
				emailVerificationEnabled = settings.emailVerificationEnabled;
				if (emailVerificationEnabled && isAuthRecordUnverified(pocketbase.authStore.model)) {
					const accountEmail = normalizeVerificationEmail(
						String(pocketbase.authStore.model?.email || '')
					);
					pocketbase.authStore.clear();
					if (accountEmail) {
						promptVerificationRequired(accountEmail);
					}
				}
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

		void refreshStoredAuthSession();
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

		// Revoke page asset object URLs to prevent memory leaks
		for (const url of pageObjectUrls.values()) {
			URL.revokeObjectURL(url);
		}
		pageObjectUrls.clear();
		pageAssetUrls = {};
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
		{showResendVerification}
		{verificationEmail}
		theme={settings.backgroundTheme}
		backgroundImageUrl={personalBackgroundImageUrl}
		on:submit={(event) => handleAuthSubmit(event.detail)}
		on:resetPassword={(event) => handlePasswordResetRequest(event.detail.email)}
		on:resendVerification={(event) => handleResendVerificationRequest(event.detail.email)}
	/>
{:else}
	<div
		class="relative h-[100dvh] overflow-hidden bg-app-bg pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-app-text"
	>
		<ThemedBackdrop
			theme={activeBackgroundTheme}
			imageUrl={activeBackgroundImageUrl}
			colorMode={settings.colorMode}
		/>

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
				profileAvatarUrl={profile?.avatarUrl ?? null}
				onToggleCompact={() => {
					projectRailCompact = !projectRailCompact;
					persistProjectRailCompact(projectRailCompact);
				}}
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
					<header
						class={`kainbu-workspace-header relative z-10 shrink-0 border-b border-app-border/80 bg-app-bg/82 backdrop-blur-xl lg:border-b-0 lg:px-4 ${
							isMobile ? 'px-2 py-1' : 'px-3 py-2'
						}`}
					>
						<div class="flex min-h-10 items-center gap-1.5 lg:gap-2.5">
							{#if isMobile}
								<button
									type="button"
									class="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-app-text transition hover:bg-app-element hover:text-app-primary"
									on:click={() => (showProjectSheet = true)}
									aria-label="Open workspace menu"
									title="Open workspace menu"
								>
									<Menu size={16} />
								</button>
							{/if}

							{#if !isMobile}
								<button
									type="button"
									class="inline-flex h-10 items-center justify-center text-app-text transition hover:opacity-85"
									on:click={() => setWorkspaceTab('dashboard')}
									aria-label="Go to dashboard"
									title="Go to dashboard"
								>
									<BrandMark size={36} alt="" />
								</button>
							{/if}

							<div class="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
								{#if isMobile && mobileTab === 'kanban'}
									<div class="relative min-h-10 min-w-0 flex-1">
										{#if boardSearchActive}
											<label
												class="absolute inset-0 flex min-w-0 items-center gap-2 rounded-lg border border-app-border/70 bg-app-bg/90 px-2.5 py-1.5"
												in:boardHeaderReceive={{ key: 'board-header-slot' }}
												out:boardHeaderSend={{ key: 'board-header-slot' }}
											>
												<Search size={14} class="shrink-0 text-app-subtext" />
												<input
													bind:this={boardSearchInput}
													bind:value={boardSearchQuery}
													type="search"
													class="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-app-subtext/60"
													placeholder="Search cards…"
													aria-label="Search cards by title, description, or tags"
													on:keydown={(event) => {
														if (event.key === 'Escape') {
															event.preventDefault();
															closeBoardSearch();
														}
													}}
												/>
											</label>
										{:else}
											<h1
												class="absolute inset-0 flex min-w-0 items-center truncate text-sm font-semibold tracking-tight text-app-text"
												in:boardHeaderReceive={{ key: 'board-header-slot' }}
												out:boardHeaderSend={{ key: 'board-header-slot' }}
											>
												{mobileHeaderTitle}
											</h1>
										{/if}
									</div>
								{:else if isMobile && mobileTab === 'chat' && currentProject}
									<button
										bind:this={mobileChatSessionTrigger}
										type="button"
										class="inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-left text-app-text transition hover:border-app-border hover:bg-app-element/60"
										aria-haspopup="listbox"
										aria-label="Switch chat"
										title="Switch chat"
										on:click={() => mobileChatPane?.toggleSessionSwitcher()}
									>
										<span class="min-w-0 truncate text-sm font-semibold tracking-tight">
											{mobileHeaderTitle}
										</span>
										<ChevronDown size={14} class="shrink-0 text-app-subtext" />
									</button>
								{:else}
									<h1
										class="min-w-0 truncate text-sm font-semibold tracking-tight text-app-text lg:text-lg"
									>
										{isMobile ? mobileHeaderTitle : desktopTitle}
									</h1>
								{/if}
								{#if mobileHeaderReviewing}
									<span class="shrink-0 text-[11px] font-medium text-app-accent">Reviewing</span>
								{/if}
							</div>

							{#if isMobile && mobileTab === 'chat' && currentProject}
								<button
									type="button"
									class="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-app-subtext transition hover:bg-app-element hover:text-app-text"
									on:click={handleCreateAiSession}
									title="New chat"
									aria-label="New chat"
								>
									<Plus size={16} />
								</button>
							{/if}

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
										<Grid size={16} />
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
										<Board size={16} />
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
										<Document size={16} />
									</button>
								</div>
							{/if}

							{#if isMobile && showBoardSearchControls}
								<button
									type="button"
									class={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
										boardSearchActive
											? 'text-app-primary'
											: 'text-app-subtext hover:text-app-text'
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
								<div class="inline-flex items-center">
									<button
										type="button"
										class={`inline-flex items-center justify-center p-1.5 transition ${
											canUndoBoardHistory && proposalPreviewTarget !== 'kanban'
												? 'text-app-subtext hover:text-app-text'
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
										class={`inline-flex items-center justify-center p-1.5 transition ${
											canRedoBoardHistory && proposalPreviewTarget !== 'kanban'
												? 'text-app-subtext hover:text-app-text'
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
													currentUserAvatarUrl={profile?.avatarUrl ?? null}
													boardName={currentBoard?.name || 'Board'}
													shareSlug={currentBoard?.shareSlug ?? null}
													sharePublic={currentBoard?.sharePublic ?? false}
													isOwner={currentProject.accessRole === 'owner'}
													shareSaving={boardShareSaving}
													shareErrorMessage={boardShareErrorMessage}
													data={displayKanbanData}
													comparisonData={kanbanComparisonData}
													{highlightedTaskIds}
													activeTaskId={activeTaskContext?.taskId}
													isLocked={proposalPreviewTarget === 'kanban'}
													{boardPreferences}
													colorMode={settings.colorMode}
													active={mobileTab === 'kanban'}
													members={currentProject.members.filter(m => !m.leftAt)}
													bind:boardSearchActive
													bind:boardSearchQuery
													onChange={handleKanbanChange}
													onBoardPreferencesChange={handleBoardPreferencesChange}
													onShareSettingsChange={(payload) =>
														handleBoardShareSettingsChange(currentBoardId, payload)}
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
													hideHeader={true}
													referenceOptions={scratchpadReferenceOptions}
													onReferenceNavigate={handleScratchpadReferenceNavigate}
													onChange={handleScratchpadChange}
													assetUrls={pageAssetUrls}
													onImageUpload={handlePageEmbedUpload}
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
													bind:this={mobileChatPane}
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
													hideHeader={true}
													sessionSwitcherAnchor={mobileChatSessionTrigger}
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
														handleSettingsChange({
															...settings,
															preferredAiThinkingLevel: level
														});
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
											avatarUrl={profile?.avatarUrl ?? null}
											{usernameDraft}
											{usernameAvailability}
											{usernameFeedback}
											{usernameSaving}
											{avatarUploading}
											personalImageUrl={personalBackgroundImageUrl}
											boardImageUrl={projectBackgroundImageUrl}
											personalImageUploading={personalBackgroundUploading}
											boardImageUploading={projectBackgroundUploading}
											onBack={closeSettings}
											onSectionChange={handleSettingsSectionChange}
											onUsernameDraftChange={handleUsernameDraftChange}
											onUsernameSubmit={handleUsernameSubmit}
											onUploadAvatar={handleUploadAvatar}
											onRemoveAvatar={handleRemoveAvatar}
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
														class="kainbu-btn kainbu-btn--primary"
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
													currentUserAvatarUrl={profile?.avatarUrl ?? null}
													boardName={currentBoard?.name || 'Board'}
													shareSlug={currentBoard?.shareSlug ?? null}
													sharePublic={currentBoard?.sharePublic ?? false}
													isOwner={currentProject.accessRole === 'owner'}
													shareSaving={boardShareSaving}
													shareErrorMessage={boardShareErrorMessage}
													data={displayKanbanData}
													comparisonData={kanbanComparisonData}
													{highlightedTaskIds}
													activeTaskId={activeTaskContext?.taskId}
													isLocked={proposalPreviewTarget === 'kanban'}
													{boardPreferences}
													colorMode={settings.colorMode}
													active={desktopWorkspaceTab === 'kanban'}
													members={currentProject.members.filter(m => !m.leftAt)}
													bind:boardSearchActive
													bind:boardSearchQuery
													onChange={handleKanbanChange}
													onBoardPreferencesChange={handleBoardPreferencesChange}
													onShareSettingsChange={(payload) =>
														handleBoardShareSettingsChange(currentBoardId, payload)}
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
													assetUrls={pageAssetUrls}
													onImageUpload={handlePageEmbedUpload}
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
											avatarUrl={profile?.avatarUrl ?? null}
											{usernameDraft}
											{usernameAvailability}
											{usernameFeedback}
											{usernameSaving}
											{avatarUploading}
											personalImageUrl={personalBackgroundImageUrl}
											boardImageUrl={projectBackgroundImageUrl}
											personalImageUploading={personalBackgroundUploading}
											boardImageUploading={projectBackgroundUploading}
											onBack={closeSettings}
											onSectionChange={handleSettingsSectionChange}
											onUsernameDraftChange={handleUsernameDraftChange}
											onUsernameSubmit={handleUsernameSubmit}
											onUploadAvatar={handleUploadAvatar}
											onRemoveAvatar={handleRemoveAvatar}
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
														class="kainbu-btn kainbu-btn--primary"
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
							{ id: 'kanban', label: 'Board', Icon: Board },
							{ id: 'scratchpad', label: 'Pages', Icon: Document },
							{ id: 'chat', label: 'Chat', Icon: MessageSquare }
						]}
						<nav class="kainbu-mobile-tab-bar" aria-label="Workspace">
							<div class="kainbu-mobile-tab-bar__track" role="tablist">
								{#each mobileTabs as tab (tab.id)}
									{@const isActive = tab.id === mobileTab}
									<button
										type="button"
										class={`kainbu-mobile-tab-bar__item${
											isActive ? ' kainbu-mobile-tab-bar__item--active' : ''
										}`}
										role="tab"
										on:click={() => setWorkspaceTab(tab.id as WorkspaceTab)}
										aria-label={tab.label}
										aria-selected={isActive}
										title={tab.label}
									>
										<svelte:component this={tab.Icon} size={20} />
									</button>
								{/each}
							</div>
						</nav>
					{/if}
				</div>

				{#if !isMobile && currentProject && desktopWorkspaceTab !== 'settings'}
					{#if desktopChatCollapsed || chatOrbExitAnimating}
						<ChatOrb
							style={chatOrbStyle}
							on:click={openDesktopChatSidebar}
							on:exitComplete={handleChatOrbExitComplete}
						/>
					{/if}
					<div
						class="desktop-chat-sidebar relative h-full shrink-0 overflow-hidden border-l border-app-border/40 bg-app-bg shadow-2xl shadow-black/40"
						class:desktop-chat-sidebar--collapsed={desktopChatCollapsed}
						aria-hidden={desktopChatCollapsed}
						style={`width:${desktopChatCollapsed ? '0' : `${desktopChatWidth}rem`};`}
					>
						<div
							class="desktop-chat-sidebar__panel relative h-full"
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
										handleSettingsChange({
											...settings,
											preferredAiThinkingLevel: level
										});
									}}
									onReviewProposal={activePendingProposals.length ? handleReviewProposal : null}
									onAcceptProposal={handleAcceptProposal}
									onRejectProposal={handleRejectProposal}
									onAnswerQuestion={handleAnswerQuestion}
									onAnswerQuestions={handleAnswerQuestions}
									onCollapseSidebar={() => {
										desktopChatCollapsed = true;
										chatOrbExitAnimating = false;
									}}
								/>
							</div>
						{/key}
						</div>
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
				class="kainbu-overlay absolute inset-0 z-40 flex items-center justify-center p-4"
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
								class="kainbu-btn kainbu-btn--primary disabled:opacity-40"
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
				activeSurface={projectRailActiveSurface}
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
				onDashboard={() => {
					setWorkspaceTab('dashboard');
					showProjectSheet = false;
				}}
			/>
		{/if}
	</div>
{/if}
