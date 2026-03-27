<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { AuthChangeEvent, User } from '@supabase/supabase-js';
	import {
		LayoutDashboard,
		LoaderCircle,
		LogOut,
		MessageSquare,
		NotebookPen,
		Redo2,
		Settings2,
		Sparkles,
		Undo2
	} from 'lucide-svelte';
	import AuthView from '$lib/components/AuthView.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ChatPane from '$lib/components/ChatPane.svelte';
	import DashboardView from '$lib/components/DashboardView.svelte';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import ProjectRail from '$lib/components/ProjectRail.svelte';
	import ProjectSheet from '$lib/components/ProjectSheet.svelte';
	import ScratchpadPane from '$lib/components/ScratchpadPane.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import SyncBadge from '$lib/components/SyncBadge.svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
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
	import { invokeWorkspaceAi } from '$lib/kainbu/ai';
	import { exportProjectsToFile, parseProjectsImport } from '$lib/kainbu/backup';
	import { createId } from '$lib/kainbu/id';
	import {
		clearWorkspaceSnapshot,
		loadWorkspaceSnapshot,
		saveWorkspaceSnapshot
	} from '$lib/kainbu/localSnapshot';
	import {
		cancelProjectInvite,
		createProject as createProjectRemote,
		createProjectInvite,
		deleteProjectRemote,
		fetchUserSettings,
		fetchWorkspace,
		leaveProject,
		removeProjectMember,
		renameProject as renameProjectRemote,
		respondToProjectInvite,
		saveProjectChatHistory,
		supportsProfileBackgroundTheme,
		subscribeToWorkspaceChanges,
		syncProjectBoard,
		touchProjectLastOpened,
		updateProjectBackground,
		updateProjectScratchpad,
		upsertUserSettings
	} from '$lib/kainbu/persistence';
	import {
		addScratchpadPad,
		deleteScratchpadPad,
		getActiveScratchpadPad,
		getScratchpadPad,
		setActiveScratchpadPad,
		updateScratchpadPadContent
	} from '$lib/kainbu/scratchpad';
	import { buildTimedTasks } from '$lib/kainbu/timing';
	import type {
		BackgroundTheme,
		ChatAttachment,
		ChatMessage,
		ChatTaskCard,
		Column,
		LocalWorkspaceSnapshot,
		ModelPreset,
		PendingProposal,
		Project,
		ProjectInvite,
		ProjectRevisionState,
		ProposalTarget,
		SyncStatus,
		Task,
		UserSettings,
		WorkspaceTab
	} from '$lib/kainbu/types';
	import { isSupabaseConfigured, supabase } from '$lib/supabaseClient';

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

	type ScratchpadConflictState = {
		projectId: string;
		remoteData: Project['scratchpadData'];
		remoteRev: number;
	};

	type BackgroundImageScope = 'personal' | 'project';
	type BoardHistoryState = {
		past: Project['kanbanData'][];
		future: Project['kanbanData'][];
	};

	let user: User | null = null;
	let projects: Project[] = [];
	let incomingInvites: ProjectInvite[] = [];
	let currentProjectId = '';
	let settings: UserSettings = structuredClone(DEFAULT_SETTINGS);
	let desktopWorkspaceTab: WorkspaceTab = 'dashboard';
	let mobileTab: WorkspaceTab = 'dashboard';
	let authHydrating = true;
	let workspaceHydrating = false;
	let isRestoring = false;
	let isAiProcessing = false;
	let isAuthLoading = false;
	let authInfoMessage = '';
	let authErrorMessage = '';
	let workspaceError = '';
	let syncErrorMessage = '';
	let syncStatus: SyncStatus = 'idle';
	let pendingProposal: PendingProposal | null = null;
	let highlightedTaskIds: string[] = [];
	let projectRailExpanded = true;
	let showProjectSheet = false;
	let desktopChatWidth = DESKTOP_CHAT_WIDTH;
	let desktopChatCollapsed = true;
	let composerDraft = '';
	let queuedAttachments: ChatAttachment[] = [];
	let queuedTaskCards: ChatTaskCard[] = [];
	let viewportWidth = 0;
	let scratchpadConflict: ScratchpadConflictState | null = null;
	let saveFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
	let settingsSyncTimeout: ReturnType<typeof setTimeout> | null = null;
	let localSnapshotTimeout: ReturnType<typeof setTimeout> | null = null;
	let authStateReloadTimeout: ReturnType<typeof setTimeout> | null = null;
	let remoteRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
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

	const STARTUP_TIMEOUT_MS = 12000;
	const LOCAL_SNAPSHOT_DEBOUNCE_MS = 140;
	const BOARD_HISTORY_LIMIT = 40;
	const BOARD_SYNC_DEBOUNCE_MS = 320;
	const SCRATCHPAD_SYNC_DEBOUNCE_MS = 440;
	const CHAT_SYNC_DEBOUNCE_MS = 520;
	const SETTINGS_SYNC_DEBOUNCE_MS = 350;
	const REMOTE_REFRESH_DEBOUNCE_MS = 160;
	const SYNC_FEEDBACK_MS = 1400;

	const boardSyncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingBoardSyncs = new Map<
		string,
		{ previousKanbanData: Project['kanbanData']; nextKanbanData: Project['kanbanData'] }
	>();
	const scratchpadSyncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingScratchpadSyncs = new Map<
		string,
		{ scratchpadData: Project['scratchpadData']; expectedRev: number }
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
	$: currentBoardHistory = currentProject ? boardSessionHistory[currentProject.id] || null : null;
	$: desktopTitle = getWorkspaceTitle(desktopWorkspaceTab, currentProject);
	$: mobileTitle = getWorkspaceTitle(mobileTab, currentProject);
	$: currentScratchpadPad = currentProject
		? getActiveScratchpadPad(currentProject.scratchpadData)
		: null;
	$: activePendingProposal =
		pendingProposal && pendingProposal.projectId === currentProjectId ? pendingProposal : null;
	$: visibleScratchpadPad =
		currentProject &&
		proposalPreviewTarget === 'scratchpad' &&
		activePendingProposal?.proposal.kind === 'scratchpad'
			? getScratchpadPad(
					currentProject.scratchpadData,
					activePendingProposal.scratchpadPadId || ''
				) || currentScratchpadPad
			: currentScratchpadPad;
	$: scratchpadContent =
		proposalPreviewTarget === 'scratchpad' &&
		activePendingProposal?.proposal.kind === 'scratchpad' &&
		activePendingProposal.proposal.scratchpadData !== undefined
			? activePendingProposal.proposal.scratchpadData
			: currentScratchpadPad?.content || '';
	$: scratchpadComparisonContent =
		proposalPreviewTarget === 'scratchpad' && activePendingProposal?.proposal.kind === 'scratchpad'
			? activePendingProposal.originalScratchpadData
			: undefined;
	$: kanbanData =
		proposalPreviewTarget === 'kanban' &&
		activePendingProposal?.proposal.kind === 'kanban' &&
		activePendingProposal.proposal.kanbanData
			? activePendingProposal.proposal.kanbanData
			: currentProject?.kanbanData || [];
	$: kanbanComparisonData =
		proposalPreviewTarget === 'kanban' && activePendingProposal?.proposal.kind === 'kanban'
			? activePendingProposal.originalKanbanData
			: undefined;
	$: timedTasks = buildTimedTasks(projects);
	$: activeScratchpadConflict =
		scratchpadConflict && scratchpadConflict.projectId === currentProjectId
			? scratchpadConflict
			: null;
	$: visibleWorkspaceTab = isMobile ? mobileTab : desktopWorkspaceTab;
	$: canUndoBoardHistory = Boolean(currentBoardHistory?.past.length);
	$: canRedoBoardHistory = Boolean(currentBoardHistory?.future.length);
	$: showBoardHistoryControls = Boolean(
		currentProject &&
			isBoardWorkspaceTab(visibleWorkspaceTab) &&
			currentBoardHistory &&
			(currentBoardHistory.past.length || currentBoardHistory.future.length)
	);
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
	$: void ensureBackgroundSignedUrl('personal', settings.backgroundTheme);
	$: void ensureBackgroundSignedUrl('project', currentProject?.backgroundTheme ?? null);
	$: if (!activePendingProposal && proposalPreviewTarget) {
		proposalPreviewTarget = null;
	}

	function isBoardWorkspaceTab(tab: WorkspaceTab) {
		return tab === 'kanban' || tab === 'scratchpad' || tab === 'chat';
	}

	function getWorkspaceTitle(tab: WorkspaceTab, project: Project | null) {
		if (tab === 'dashboard') return 'Dashboard';
		if (tab === 'settings') return 'Settings';
		return project?.name || 'Pick a board';
	}
	const getProjectRevisionState = (projectId: string): ProjectRevisionState =>
		projectRevisions[projectId] || { kanban: 0, scratchpad: 0 };
	const sortProjects = (nextProjects: Project[]) =>
		[...nextProjects].sort(
			(left, right) =>
				right.viewerLastOpenedAt - left.viewerLastOpenedAt || right.updatedAt - left.updatedAt
		);
	const resolveCurrentProjectId = (nextProjects: Project[], preferredProjectId: string) =>
		nextProjects.some((project) => project.id === preferredProjectId)
			? preferredProjectId
			: nextProjects[0]?.id || '';
	const isProjectPending = (projectId: string) =>
		pendingBoardSyncs.has(projectId) ||
		pendingScratchpadSyncs.has(projectId) ||
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
	};

	const getScratchpadPadForProject = (project: Project, padId?: string) =>
		(padId ? getScratchpadPad(project.scratchpadData, padId) : undefined) ||
		getActiveScratchpadPad(project.scratchpadData);

	const formatTaskCardsForPrompt = (taskCards: ChatTaskCard[]) =>
		taskCards
			.map((taskCard, index) => {
				const lines = [
					`Task card ${index + 1}:`,
					`Column: ${taskCard.columnTitle}`,
					`Title: ${taskCard.title}`
				];

				if (taskCard.description) lines.push(`Description:\n${taskCard.description}`);
				if (taskCard.tags.length) {
					lines.push(`Tags: ${taskCard.tags.map((tag) => tag.label).join(', ')}`);
				}
				if (taskCard.checked) lines.push('Status: completed');

				return lines.join('\n');
			})
			.join('\n\n');

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
	const areKanbanDataEqual = (
		left: Project['kanbanData'],
		right: Project['kanbanData']
	) => JSON.stringify(left) === JSON.stringify(right);
	const getBoardHistoryState = (projectId: string): BoardHistoryState =>
		boardSessionHistory[projectId] || { past: [], future: [] };
	const setBoardHistoryState = (projectId: string, nextHistory: BoardHistoryState) => {
		const { [projectId]: _discarded, ...remainingHistory } = boardSessionHistory;

		if (!nextHistory.past.length && !nextHistory.future.length) {
			boardSessionHistory = remainingHistory;
			return;
		}

		boardSessionHistory = {
			...remainingHistory,
			[projectId]: nextHistory
		};
	};
	const recordBoardHistory = (
		projectId: string,
		previousKanbanData: Project['kanbanData'],
		nextKanbanData: Project['kanbanData']
	) => {
		if (areKanbanDataEqual(previousKanbanData, nextKanbanData)) {
			return;
		}

		const currentHistory = getBoardHistoryState(projectId);
		const latestPast = currentHistory.past.at(-1);
		const nextPast =
			latestPast && areKanbanDataEqual(latestPast, previousKanbanData)
				? currentHistory.past
				: [...currentHistory.past, cloneKanbanData(previousKanbanData)].slice(-BOARD_HISTORY_LIMIT);

		setBoardHistoryState(projectId, {
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
		const previousKanbanData = cloneKanbanData(project.kanbanData);
		const normalizedNextKanbanData = cloneKanbanData(nextKanbanData);

		if (areKanbanDataEqual(previousKanbanData, normalizedNextKanbanData)) {
			return false;
		}

		const updateResult = updateProjectLocal(project.id, (currentProject) => ({
			...currentProject,
			kanbanData: normalizedNextKanbanData
		}));

		if (!updateResult) return false;

		if (options.recordHistory !== false) {
			recordBoardHistory(project.id, previousKanbanData, normalizedNextKanbanData);
		}

		highlightedTaskIds = [];
		bumpProjectRevision(project.id, 'kanban');
		scheduleBoardSync(
			project.id,
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
			version: 2,
			userId: user.id,
			currentProjectId,
			projects,
			settings,
			dirtySettings,
			projectRevisions,
			lastProjectSyncAt,
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
		const sortedProjects = sortProjects(nextProjects);
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

			if (boardSessionHistory[project.id]) {
				nextBoardSessionHistory[project.id] = boardSessionHistory[project.id];
			}
		}

		projects = sortedProjects;
		incomingInvites = nextIncomingInvites;
		currentProjectId = resolvedProjectId;
		settings = nextSettings;
		dirtySettings = nextDirtySettings;
		projectRevisions = normalizedRevisions;
		lastProjectSyncAt = normalizedLastProjectSyncAt;
		lastSettingsSyncAt = nextLastSettingsSyncAt;
		lastSuccessfulSyncAt = nextLastSuccessfulSyncAt;
		boardSessionHistory = nextBoardSessionHistory;

		const activePendingProposal = pendingProposal;
		if (
			activePendingProposal &&
			!sortedProjects.some((project) => project.id === activePendingProposal.projectId)
		) {
			pendingProposal = null;
			proposalPreviewTarget = null;
		}

		if (pendingProposal?.projectId !== resolvedProjectId) {
			proposalPreviewTarget = null;
		}

		const activeConflict = scratchpadConflict;
		if (
			activeConflict &&
			!sortedProjects.some((project) => project.id === activeConflict.projectId)
		) {
			scratchpadConflict = null;
		}

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const resetWorkspaceState = () => {
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
		dirtySettings = false;
		projectRevisions = {};
		lastProjectSyncAt = {};
		lastSettingsSyncAt = undefined;
		lastSuccessfulSyncAt = undefined;
		pendingProposal = null;
		scratchpadConflict = null;
		boardSessionHistory = {};
		workspaceError = '';
		syncErrorMessage = '';
		clearBackgroundSignedUrl('personal');
		clearBackgroundSignedUrl('project');
		clearActiveViewState();
		refreshSyncStatus();
	};

	const setSyncError = (message: string) => {
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
		if (
			pendingProposal &&
			pendingProposal.projectId === projectId &&
			pendingProposal.target === target &&
			!pendingProposal.stale &&
			nextRevision[target] > pendingProposal.baseRevision
		) {
			pendingProposal = {
				...pendingProposal,
				stale: true
			};
		}
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

		const nextProject = {
			...updater(current),
			updatedAt: Date.now()
		};
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
		previousKanbanData: Project['kanbanData'],
		nextKanbanData: Project['kanbanData'],
		delay = BOARD_SYNC_DEBOUNCE_MS
	) => {
		const current = pendingBoardSyncs.get(projectId);
		pendingBoardSyncs.set(projectId, {
			previousKanbanData: current?.previousKanbanData || previousKanbanData,
			nextKanbanData
		});

		if (boardSyncTimeouts.has(projectId)) {
			clearTimeout(boardSyncTimeouts.get(projectId));
		}

		boardSyncTimeouts.set(
			projectId,
			setTimeout(() => {
				boardSyncTimeouts.delete(projectId);
				void flushBoardSync(projectId);
			}, delay)
		);

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const flushBoardSync = async (projectId: string) => {
		if (!user) return;
		const pending = pendingBoardSyncs.get(projectId);
		if (!pending) return;

		try {
			await runSyncAction(
				() => syncProjectBoard(projectId, pending.previousKanbanData, pending.nextKanbanData),
				'Unable to sync the board right now.'
			);
			pendingBoardSyncs.delete(projectId);
			lastProjectSyncAt = {
				...lastProjectSyncAt,
				[projectId]: Date.now()
			};
		} finally {
			refreshSyncStatus(syncErrorMessage.length === 0 && !hasPendingLocalChanges());
		}
	};

	const scheduleScratchpadSync = (
		projectId: string,
		scratchpadData: Project['scratchpadData'],
		expectedRev: number,
		delay = SCRATCHPAD_SYNC_DEBOUNCE_MS
	) => {
		const current = pendingScratchpadSyncs.get(projectId);
		pendingScratchpadSyncs.set(projectId, {
			scratchpadData,
			expectedRev: current?.expectedRev ?? expectedRev
		});

		if (scratchpadSyncTimeouts.has(projectId)) {
			clearTimeout(scratchpadSyncTimeouts.get(projectId));
		}

		scratchpadSyncTimeouts.set(
			projectId,
			setTimeout(() => {
				scratchpadSyncTimeouts.delete(projectId);
				void flushScratchpadSync(projectId);
			}, delay)
		);

		refreshSyncStatus();
		scheduleSnapshotPersist();
	};

	const flushScratchpadSync = async (projectId: string) => {
		const pending = pendingScratchpadSyncs.get(projectId);
		if (!pending) return;

		try {
			const result = await runSyncAction(
				() => updateProjectScratchpad(projectId, pending.scratchpadData, pending.expectedRev),
				'Unable to sync the shared notes right now.'
			);

			if (result.ok) {
				pendingScratchpadSyncs.delete(projectId);
				scratchpadConflict = null;
				updateProjectLocal(projectId, (project) => ({
					...project,
					scratchpadRev: result.scratchpadRev,
					updatedAt: result.updatedAt
				}));
				lastProjectSyncAt = {
					...lastProjectSyncAt,
					[projectId]: Date.now()
				};
				return;
			}

			pendingScratchpadSyncs.delete(projectId);
			scratchpadConflict = {
				projectId,
				remoteData: result.scratchpadData,
				remoteRev: result.scratchpadRev
			};
			updateProjectLocal(projectId, (project) => ({
				...project,
				scratchpadRev: result.scratchpadRev
			}));
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
				() => saveProjectChatHistory(projectId, currentUser.id, project.chatHistory),
				'Unable to sync your private chat right now.'
			);
			pendingChatSyncs.delete(projectId);
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
			merged.push({
				...remoteProject,
				backgroundTheme: preferLocalFallback
					? localProject.backgroundTheme
					: remoteProject.backgroundTheme,
				kanbanData:
					pendingBoardSyncs.has(remoteProject.id) || preferLocalFallback
						? localProject.kanbanData
						: remoteProject.kanbanData,
				scratchpadData:
					pendingScratchpadSyncs.has(remoteProject.id) || preferLocalFallback
						? localProject.scratchpadData
						: remoteProject.scratchpadData,
				scratchpadRev:
					pendingScratchpadSyncs.has(remoteProject.id) || preferLocalFallback
						? localProject.scratchpadRev
						: remoteProject.scratchpadRev,
				chatHistory:
					pendingChatSyncs.has(remoteProject.id) || preferLocalFallback
						? localProject.chatHistory
						: remoteProject.chatHistory,
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

	const bootstrapWorkspace = async (currentUser: User) => {
		const loadVersion = ++workspaceLoadVersion;
		workspaceHydrating = true;
		workspaceError = '';
		const localSnapshot = loadWorkspaceSnapshot(currentUser.id);

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
			workspaceHydrating = false;
		}

		try {
			const [workspaceResult, settingsResult] = await Promise.allSettled([
				withTimeout(
					fetchWorkspace(currentUser.id),
					STARTUP_TIMEOUT_MS,
					'Loading your boards timed out. Please retry.'
				),
				withTimeout(
					fetchUserSettings(currentUser.id),
					STARTUP_TIMEOUT_MS,
					'Loading your settings timed out. Please retry.'
				)
			]);

			if (loadVersion !== workspaceLoadVersion) return;

			if (workspaceResult.status !== 'fulfilled') {
				throw workspaceResult.reason;
			}

			if (settingsResult.status === 'rejected') {
				workspaceError =
					settingsResult.reason instanceof Error
						? settingsResult.reason.message
						: 'Unable to load your preferences.';
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
		} catch (error) {
			console.error(error);
			workspaceError = error instanceof Error ? error.message : 'Unable to load your workspace.';
		} finally {
			if (loadVersion === workspaceLoadVersion) {
				workspaceHydrating = false;
			}
		}
	};

	const refreshWorkspaceFromRemote = async (currentUser: User) => {
		try {
			const workspace = await fetchWorkspace(currentUser.id);
			applyWorkspaceState({
				nextProjects: mergeRemoteProjects(projects, workspace.projects),
				nextIncomingInvites: workspace.incomingInvites,
				preferredProjectId: currentProjectId
			});
		} catch (error) {
			console.error(error);
			setSyncError(error instanceof Error ? error.message : 'Unable to refresh workspace changes.');
		}
	};

	const scheduleRemoteRefresh = () => {
		if (!user) return;
		if (remoteRefreshTimeout) clearTimeout(remoteRefreshTimeout);
		remoteRefreshTimeout = setTimeout(() => {
			remoteRefreshTimeout = null;
			if (user) void refreshWorkspaceFromRemote(user);
		}, REMOTE_REFRESH_DEBOUNCE_MS);
	};

	const startWorkspaceSubscription = (currentUser: User) => {
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = subscribeToWorkspaceChanges(currentUser.id, () => {
			scheduleRemoteRefresh();
		});
	};

	const scheduleWorkspaceReload = (nextUser: User) => {
		if (authStateReloadTimeout) clearTimeout(authStateReloadTimeout);
		authStateReloadTimeout = setTimeout(() => {
			authStateReloadTimeout = null;
			startWorkspaceSubscription(nextUser);
			void bootstrapWorkspace(nextUser);
		}, 0);
	};

	const recoverWorkspaceIfNeeded = () => {
		if (!user || document.visibilityState === 'hidden') return;
		if (workspaceHydrating || Boolean(workspaceError)) {
			void bootstrapWorkspace(user);
			return;
		}
		void refreshWorkspaceFromRemote(user);
	};

	const shouldReloadWorkspaceForAuthEvent = (
		event: AuthChangeEvent,
		previousUserId: string | null,
		nextUser: User
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
				const { error } = await supabase.auth.signUp({
					email: payload.email,
					password: payload.password,
					options: {
						emailRedirectTo: window.location.origin
					}
				});
				if (error) throw error;
				authInfoMessage = 'Check your email for the confirmation link, then come back and sign in.';
				return;
			}

			const { error } = await supabase.auth.signInWithPassword({
				email: payload.email,
				password: payload.password
			});
			if (error) throw error;
		} catch (error) {
			console.error(error);
			authErrorMessage =
				error instanceof Error ? error.message : 'Unable to authenticate right now.';
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

	const clearProjectSyncState = (projectId: string) => {
		const boardTimeout = boardSyncTimeouts.get(projectId);
		if (boardTimeout) clearTimeout(boardTimeout);
		boardSyncTimeouts.delete(projectId);
		pendingBoardSyncs.delete(projectId);

		const scratchpadTimeout = scratchpadSyncTimeouts.get(projectId);
		if (scratchpadTimeout) clearTimeout(scratchpadTimeout);
		scratchpadSyncTimeouts.delete(projectId);
		pendingScratchpadSyncs.delete(projectId);

		const chatTimeout = chatSyncTimeouts.get(projectId);
		if (chatTimeout) clearTimeout(chatTimeout);
		chatSyncTimeouts.delete(projectId);
		pendingChatSyncs.delete(projectId);

		const { [projectId]: _removedRevision, ...remainingRevisions } = projectRevisions;
		projectRevisions = remainingRevisions;

		const { [projectId]: _removedSyncAt, ...remainingSyncAt } = lastProjectSyncAt;
		lastProjectSyncAt = remainingSyncAt;

		if (scratchpadConflict?.projectId === projectId) {
			scratchpadConflict = null;
		}

		if (pendingProposal?.projectId === projectId) {
			pendingProposal = null;
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

	const selectProject = (projectId: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		if (!project) return;

		const switchingProjects = projectId !== currentProjectId;
		if (switchingProjects) {
			clearComposerState();
			clearActiveViewState();
		}

		const openedAt = Date.now();
		applyWorkspaceState({
			nextProjects: projects.map((entry) =>
				entry.id === projectId
					? {
							...entry,
							viewerLastOpenedAt: openedAt
						}
					: entry
			),
			preferredProjectId: projectId
		});

		void runSyncAction(
			() => touchProjectLastOpened(projectId),
			'Unable to update board ordering right now.'
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
		selectProject(projectId);
		desktopWorkspaceTab = 'kanban';
		mobileTab = 'kanban';
		desktopChatCollapsed = true;
		showProjectSheet = false;
	};

	const handleCreateProject = async () => {
		if (!user) return;
		const currentUser = user;

		const suggestedName = `Board ${projects.length + 1}`;
		const input = window.prompt('Name this board', suggestedName);
		if (input === null) return;

		const name = input.trim() || suggestedName;

		try {
			const createdProject = await runSyncAction(
				() => createProjectRemote(currentUser.id, name),
				'Unable to create a new board right now.'
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

	const handleSettingsChange = (nextSettings: UserSettings) => {
		settings = nextSettings;
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

		settings = nextSettings;
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

	const openSettings = () => {
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

		updateProjectLocal(currentProject.id, (project) => ({
			...project,
			chatHistory: structuredClone(DEFAULT_CHAT_HISTORY)
		}));
		pendingProposal = pendingProposal?.projectId === currentProject.id ? null : pendingProposal;
		proposalPreviewTarget = null;
		highlightedTaskIds = [];
		scheduleChatSync(currentProject.id, 0);
	};

	const handleChatModeChange = (mode: UserSettings['preferredChatMode']) => {
		handleSettingsChange({
			...settings,
			preferredChatMode: mode
		});
	};

	const handleModelPresetChange = (preset: ModelPreset) => {
		handleSettingsChange({
			...settings,
			preferredModelPreset: preset
		});
	};

	const mutateScratchpad = (
		mutator: (scratchpadData: Project['scratchpadData']) => Project['scratchpadData']
	) => {
		if (!currentProject) return;

		const previousProject = currentProject;
		const nextScratchpadData = mutator(previousProject.scratchpadData);
		const updateResult = updateProjectLocal(previousProject.id, (project) => ({
			...project,
			scratchpadData: nextScratchpadData
		}));

		if (!updateResult) return;

		bumpProjectRevision(previousProject.id, 'scratchpad');

		if (scratchpadConflict?.projectId !== previousProject.id) {
			scheduleScratchpadSync(previousProject.id, nextScratchpadData, previousProject.scratchpadRev);
		}
	};

	const handleSelectScratchpadPad = (padId: string) => {
		if (!currentProject || proposalPreviewTarget === 'scratchpad') return;
		mutateScratchpad((scratchpadData) => setActiveScratchpadPad(scratchpadData, padId));
	};

	const handleCreateScratchpadPad = () => {
		if (!currentProject || proposalPreviewTarget === 'scratchpad') return;
		mutateScratchpad((scratchpadData) => addScratchpadPad(scratchpadData));
	};

	const handleDeleteScratchpadPad = (padId: string) => {
		if (!currentProject || proposalPreviewTarget === 'scratchpad') return;
		mutateScratchpad((scratchpadData) => deleteScratchpadPad(scratchpadData, padId));
	};

	const handleScratchpadChange = (value: string) => {
		if (!currentProject || !currentScratchpadPad || proposalPreviewTarget === 'scratchpad') return;
		mutateScratchpad((scratchpadData) =>
			updateScratchpadPadContent(scratchpadData, currentScratchpadPad.id, value)
		);
	};

	const handleKanbanChange = (nextKanbanData: Project['kanbanData']) => {
		if (!currentProject || proposalPreviewTarget === 'kanban') return;

		applyLocalKanbanChange(currentProject, nextKanbanData);
	};

	const handleKanbanUndo = () => {
		if (!currentProject || proposalPreviewTarget === 'kanban') return;

		const history = getBoardHistoryState(currentProject.id);
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

		setBoardHistoryState(currentProject.id, nextHistory);
	};

	const handleKanbanRedo = () => {
		if (!currentProject || proposalPreviewTarget === 'kanban') return;

		const history = getBoardHistoryState(currentProject.id);
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

		setBoardHistoryState(currentProject.id, nextHistory);
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

	const handleReviewProposal = () => {
		if (!activePendingProposal) return;

		proposalPreviewTarget = activePendingProposal.target;
		if (activePendingProposal.target === 'kanban') {
			desktopWorkspaceTab = 'kanban';
			mobileTab = 'kanban';
			return;
		}

		desktopWorkspaceTab = 'scratchpad';
		mobileTab = 'scratchpad';
	};

	const handleAcceptProposal = () => {
		if (!currentProject || !activePendingProposal || activePendingProposal.stale) return;

		if (
			activePendingProposal.target === 'kanban' &&
			activePendingProposal.proposal.kind === 'kanban' &&
			activePendingProposal.proposal.kanbanData
		) {
			const nextKanbanData = activePendingProposal.proposal.kanbanData;
			applyLocalKanbanChange(currentProject, nextKanbanData, { syncDelay: 0 });
			desktopWorkspaceTab = 'kanban';
			mobileTab = 'kanban';
		}

		if (
			activePendingProposal.target === 'scratchpad' &&
			activePendingProposal.proposal.kind === 'scratchpad' &&
			activePendingProposal.proposal.scratchpadData !== undefined
		) {
			const targetPadId =
				activePendingProposal.scratchpadPadId || currentProject.scratchpadData.activePadId;
			const nextScratchpadData = updateScratchpadPadContent(
				currentProject.scratchpadData,
				targetPadId,
				activePendingProposal.proposal.scratchpadData
			);

			updateProjectLocal(currentProject.id, (project) => ({
				...project,
				scratchpadData: nextScratchpadData
			}));
			bumpProjectRevision(currentProject.id, 'scratchpad');
			scheduleScratchpadSync(
				currentProject.id,
				nextScratchpadData,
				currentProject.scratchpadRev,
				0
			);
			desktopWorkspaceTab = 'scratchpad';
			mobileTab = 'scratchpad';
		}

		pendingProposal = null;
		proposalPreviewTarget = null;
	};

	const handleRejectProposal = () => {
		pendingProposal = null;
		proposalPreviewTarget = null;
	};

	const handleSendMessage = async () => {
		if (!user || !currentProject || isAiProcessing) return;
		if (
			!composerDraft.trim().length &&
			queuedAttachments.length === 0 &&
			queuedTaskCards.length === 0
		) {
			return;
		}

		const projectSnapshot = currentProject;
		const revisionSnapshot = getProjectRevisionState(projectSnapshot.id);
		const attachmentSnapshot = [...queuedAttachments];
		const taskCardSnapshot = [...queuedTaskCards];
		const baseText = composerDraft.trim();
		const fallbackText = taskCardSnapshot.length
			? 'Shared task cards for context.'
			: 'Shared attachments for context.';
		const displayText = baseText || fallbackText;
		const requestText = taskCardSnapshot.length
			? `${displayText}\n\n${formatTaskCardsForPrompt(taskCardSnapshot)}`
			: displayText;
		const timestamp = Date.now();
		const userMessage: ChatMessage = {
			id: createId(),
			role: 'user',
			text: displayText,
			timestamp,
			...(attachmentSnapshot.length ? { attachments: attachmentSnapshot } : {}),
			...(taskCardSnapshot.length ? { taskCards: taskCardSnapshot } : {})
		};
		const requestMessage: ChatMessage = {
			...userMessage,
			text: requestText
		};
		const scratchpadPad = getScratchpadPadForProject(projectSnapshot);

		updateProjectLocal(projectSnapshot.id, (project) => ({
			...project,
			chatHistory: [...project.chatHistory, userMessage]
		}));
		scheduleChatSync(projectSnapshot.id);
		clearComposerState();
		highlightedTaskIds = [];
		isAiProcessing = true;

		try {
			const response = await invokeWorkspaceAi({
				projectId: projectSnapshot.id,
				chatMode: settings.preferredChatMode,
				modelPreset: settings.preferredModelPreset,
				history: [...projectSnapshot.chatHistory, requestMessage],
				kanbanData: projectSnapshot.kanbanData,
				scratchpadData: scratchpadPad?.content || '',
				attachments: attachmentSnapshot
			});

			const assistantMessage: ChatMessage = {
				id: createId(),
				role: 'assistant',
				text: response.reply,
				timestamp: Date.now(),
				metadata: {
					model: response.model,
					latencyMs: response.latencyMs,
					mode: response.mode
				},
				annotations: response.annotations,
				toolActions: response.toolActions
			};

			updateProjectLocal(projectSnapshot.id, (project) => ({
				...project,
				chatHistory: [...project.chatHistory, assistantMessage]
			}));
			scheduleChatSync(projectSnapshot.id);
			highlightedTaskIds = response.highlightedTaskIds;

			if (response.proposal.kind !== 'none') {
				const target: ProposalTarget =
					response.proposal.kind === 'kanban' ? 'kanban' : 'scratchpad';
				const baseRevision = revisionSnapshot[target];
				const latestRevision = getProjectRevisionState(projectSnapshot.id)[target];

				pendingProposal = {
					projectId: projectSnapshot.id,
					proposal: response.proposal,
					target,
					baseRevision,
					stale: latestRevision > baseRevision,
					...(target === 'kanban'
						? { originalKanbanData: projectSnapshot.kanbanData }
						: {
								originalScratchpadData: scratchpadPad?.content || '',
								scratchpadPadId: scratchpadPad?.id
							})
				};
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
					model: 'System',
					latencyMs: 0,
					mode: settings.preferredChatMode
				}
			};

			updateProjectLocal(projectSnapshot.id, (project) => ({
				...project,
				chatHistory: [...project.chatHistory, assistantErrorMessage]
			}));
			scheduleChatSync(projectSnapshot.id);
		} finally {
			isAiProcessing = false;
		}
	};

	const handleExportProjects = () => {
		exportProjectsToFile(projects);
	};

	const handleRestoreProjects = async (file: File) => {
		if (!user) return;
		const currentUser = user;

		isRestoring = true;

		try {
			const importedProjects = await parseProjectsImport(file, currentUser.id);
			const createdProjects: Project[] = [];

			for (const importedProject of importedProjects) {
				const createdProject = await runSyncAction(
					() => createProjectRemote(currentUser.id, importedProject.name, importedProject),
					`Unable to restore "${importedProject.name}" right now.`
				);
				createdProjects.push(createdProject);
			}

			if (createdProjects.length) {
				applyWorkspaceState({
					nextProjects: [
						...createdProjects,
						...projects.filter(
							(project) =>
								!createdProjects.some((createdProject) => createdProject.id === project.id)
						)
					],
					preferredProjectId: createdProjects[0].id
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
		}
	};

	const handleLoadRemoteScratchpad = () => {
		if (!currentProject || !activeScratchpadConflict) return;

		const scratchpadTimeout = scratchpadSyncTimeouts.get(currentProject.id);
		if (scratchpadTimeout) clearTimeout(scratchpadTimeout);
		scratchpadSyncTimeouts.delete(currentProject.id);
		pendingScratchpadSyncs.delete(currentProject.id);

		updateProjectLocal(currentProject.id, (project) => ({
			...project,
			scratchpadData: activeScratchpadConflict.remoteData,
			scratchpadRev: activeScratchpadConflict.remoteRev
		}));
		bumpProjectRevision(currentProject.id, 'scratchpad');
		scratchpadConflict = null;
	};

	const handleSyncMergedScratchpad = () => {
		if (!currentProject || !activeScratchpadConflict) return;

		const remoteRevision = activeScratchpadConflict.remoteRev;
		scratchpadConflict = null;
		scheduleScratchpadSync(currentProject.id, currentProject.scratchpadData, remoteRevision, 0);
	};

	const handleInvite = async (projectId: string, email: string) => {
		const project = projects.find((entry) => entry.id === projectId);
		const inviteeEmail = email.trim().toLowerCase();

		if (!project || project.accessRole !== 'owner' || !inviteeEmail) return;

		try {
			await runSyncAction(
				() => createProjectInvite(projectId, inviteeEmail),
				'Unable to send that invite right now.'
			);
			if (user) {
				await refreshWorkspaceFromRemote(user);
			}
		} catch (error) {
			console.error(error);
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
			await supabase.auth.signOut();
		} catch (error) {
			console.error(error);
			workspaceError = error instanceof Error ? error.message : 'Unable to sign out right now.';
		}
	};

	const handleRetryInitialization = async () => {
		if (!user) return;
		workspaceError = '';
		await bootstrapWorkspace(user);
	};

	const handleAuthStateChange = (event: AuthChangeEvent, nextUser: User | null) => {
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
		authHydrating = false;

		if (shouldReloadWorkspaceForAuthEvent(event, previousUserId, nextUser)) {
			scheduleWorkspaceReload(nextUser);
		}
	};

	onMount(() => {
		if (!isSupabaseConfigured) {
			authHydrating = false;
			return;
		}

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				recoverWorkspaceIfNeeded();
			}
		};

		stopVisibilityListener = () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (event === 'INITIAL_SESSION') return;
			handleAuthStateChange(event, session?.user || null);
		});

		stopAuthListener = () => {
			subscription.unsubscribe();
		};

		void supabase.auth
			.getSession()
			.then(({ data }) => {
				handleAuthStateChange('INITIAL_SESSION', data.session?.user || null);
			})
			.catch((error) => {
				console.error(error);
				authHydrating = false;
				authErrorMessage =
					error instanceof Error ? error.message : 'Unable to restore your session.';
			});
	});

	onDestroy(() => {
		persistSnapshotNow();
		stopAuthListener?.();
		stopAuthListener = null;
		stopVisibilityListener?.();
		stopVisibilityListener = null;
		stopWorkspaceSubscription?.();
		stopWorkspaceSubscription = null;

		if (authStateReloadTimeout) clearTimeout(authStateReloadTimeout);
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

<svelte:window bind:innerWidth={viewportWidth} on:focus={recoverWorkspaceIfNeeded} />

<svelte:head>
	<title>{currentProject ? `${currentProject.name} | Kainbu` : 'Kainbu'}</title>
</svelte:head>

{#if authHydrating}
	<div
		class="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-app-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-app-text"
	>
		<div class="absolute inset-0 bg-kainbu-grid opacity-35"></div>
		<div
			class="absolute left-[-8%] top-[-10%] h-[26rem] w-[26rem] rounded-full bg-app-primary/12 blur-[110px]"
		></div>
		<div
			class="absolute bottom-[-12%] right-[-6%] h-[24rem] w-[24rem] rounded-full bg-app-accent/12 blur-[120px]"
		></div>
		<div
			class="relative flex flex-col items-center gap-4 rounded-[1.8rem] border border-app-border bg-app-surface/88 px-8 py-7 shadow-kainbu-xl"
		>
			<BrandMark size={58} alt="" />
			<LoaderCircle size={28} class="animate-spin text-app-primary" />
			<div class="text-center">
				<p class="text-[10px] font-bold uppercase tracking-[0.32em] text-app-primary">Kainbu</p>
				<p class="mt-2 text-sm text-app-subtext">
					Restoring your workspace, invites, and shared boards.
				</p>
			</div>
		</div>
	</div>
{:else if !user}
	<AuthView
		loading={isAuthLoading}
		configured={isSupabaseConfigured}
		infoMessage={authInfoMessage}
		errorMessage={authErrorMessage}
		theme={settings.backgroundTheme}
		backgroundImageUrl={personalBackgroundImageUrl}
		on:submit={(event) => handleAuthSubmit(event.detail)}
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
				visible={!isMobile && projectRailExpanded}
				{syncStatus}
				onSwitch={openProjectWorkspace}
				onCreate={handleCreateProject}
				onRename={handleRenameProject}
				onDelete={handleDeleteProject}
				onExport={handleExportProjects}
				onRestore={handleRestoreProjects}
				onOpenSettings={openSettings}
				onSignOut={handleSignOut}
			/>

			<div class="relative flex min-h-0 min-w-0 flex-1">
				<div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<header
						class="border-b border-app-border/80 bg-app-bg/82 px-3 py-2 backdrop-blur-xl lg:px-4"
					>
						<div class="flex flex-wrap items-center gap-2.5">
							{#if isMobile}
								<button
									type="button"
									class="inline-flex h-10 w-10 items-center justify-center rounded-[0.95rem] border border-app-border bg-app-element text-app-text"
									on:click={() => (showProjectSheet = true)}
									aria-label="Open workspace menu"
									title="Open workspace menu"
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="290 100 220 220" class="h-5 w-5">
										<polygon points="290,100 400,100 400,210" fill="#d47a2e" />
										<polygon points="290,100 290,210 400,210" fill="#c26a1f" />
										<polygon points="400,100 510,100 400,210" fill="#636363" />
										<polygon points="290,210 400,210 400,320" fill="#454545" />
										<polygon points="290,210 290,320 400,320" fill="#3a3a3a" />
										<polygon points="400,210 510,320 400,320" fill="#d47a2e" />
										<polygon points="348,158 400,100 400,210" fill="#4a4a4a" />
										<polygon points="452,262 400,210 400,320" fill="#a8551a" />
										<polygon points="290,320 400,320 290,210" fill="#3a3a3a" opacity="0.3" />
									</svg>
								</button>
							{:else}
								<button
									type="button"
									class="inline-flex h-10 w-10 items-center justify-center rounded-[0.95rem] border border-app-border bg-app-element text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
									on:click={() => (projectRailExpanded = !projectRailExpanded)}
									aria-label={projectRailExpanded ? 'Hide boards sidebar' : 'Show boards sidebar'}
									title={projectRailExpanded ? 'Hide boards sidebar' : 'Show boards sidebar'}
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="290 100 220 220" class="h-5 w-5">
										<polygon points="290,100 400,100 400,210" fill="#d47a2e" />
										<polygon points="290,100 290,210 400,210" fill="#c26a1f" />
										<polygon points="400,100 510,100 400,210" fill="#636363" />
										<polygon points="290,210 400,210 400,320" fill="#454545" />
										<polygon points="290,210 290,320 400,320" fill="#3a3a3a" />
										<polygon points="400,210 510,320 400,320" fill="#d47a2e" />
										<polygon points="348,158 400,100 400,210" fill="#4a4a4a" />
										<polygon points="452,262 400,210 400,320" fill="#a8551a" />
										<polygon points="290,320 400,320 290,210" fill="#3a3a3a" opacity="0.3" />
									</svg>
								</button>
							{/if}

							<div class="min-w-0 flex-1">
								<h1
									class="truncate text-base font-semibold tracking-tight text-app-text lg:text-lg"
								>
									{isMobile ? mobileTitle : desktopTitle}
								</h1>
							</div>

							{#if !isMobile}
								<div
									class="inline-flex items-center rounded-[1rem] border border-app-border bg-app-element/80 p-1"
								>
									<button
										type="button"
										class={`inline-flex items-center gap-2 rounded-[0.8rem] px-3 py-1.5 text-sm font-semibold transition ${
											desktopWorkspaceTab === 'dashboard'
												? 'bg-app-primary text-white'
												: 'text-app-subtext hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab('dashboard')}
									>
										<LayoutDashboard size={14} />
										Dashboard
									</button>
									<button
										type="button"
										class={`inline-flex items-center gap-2 rounded-[0.8rem] px-3 py-1.5 text-sm font-semibold transition ${
											desktopWorkspaceTab === 'kanban'
												? 'bg-app-primary text-white'
												: 'text-app-subtext hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab('kanban')}
									>
										<Sparkles size={14} />
										Kanban
									</button>
									<button
										type="button"
										class={`inline-flex items-center gap-2 rounded-[0.8rem] px-3 py-1.5 text-sm font-semibold transition ${
											desktopWorkspaceTab === 'scratchpad'
												? 'bg-app-primary text-white'
												: 'text-app-subtext hover:text-app-text'
										}`}
										on:click={() => setWorkspaceTab('scratchpad')}
									>
										<NotebookPen size={14} />
										Scratchpad
									</button>
								</div>
							{/if}

							{#if showBoardHistoryControls}
								<div
									class="inline-flex items-center rounded-[1rem] border border-app-border bg-app-element/80 p-1"
								>
									<button
										type="button"
										class={`inline-flex h-9 w-9 items-center justify-center rounded-[0.8rem] transition ${
											canUndoBoardHistory && proposalPreviewTarget !== 'kanban'
												? 'text-app-subtext hover:bg-app-bg/80 hover:text-app-text'
												: 'cursor-not-allowed text-app-subtext/40'
										}`}
										on:click={handleKanbanUndo}
										disabled={!canUndoBoardHistory || proposalPreviewTarget === 'kanban'}
										aria-label="Undo board change"
										title={
											proposalPreviewTarget === 'kanban'
												? 'Finish reviewing the proposal before undoing'
												: canUndoBoardHistory
													? 'Undo board change'
													: 'Nothing to undo'
										}
									>
										<Undo2 size={16} />
									</button>
									<button
										type="button"
										class={`inline-flex h-9 w-9 items-center justify-center rounded-[0.8rem] transition ${
											canRedoBoardHistory && proposalPreviewTarget !== 'kanban'
												? 'text-app-subtext hover:bg-app-bg/80 hover:text-app-text'
												: 'cursor-not-allowed text-app-subtext/40'
										}`}
										on:click={handleKanbanRedo}
										disabled={!canRedoBoardHistory || proposalPreviewTarget === 'kanban'}
										aria-label="Redo board change"
										title={
											proposalPreviewTarget === 'kanban'
												? 'Finish reviewing the proposal before redoing'
												: canRedoBoardHistory
													? 'Redo board change'
													: 'Nothing to redo'
										}
									>
										<Redo2 size={16} />
									</button>
								</div>
							{/if}

							<SyncBadge status={syncStatus} compact={true} />

							{#if isMobile}
								<button
									type="button"
									class="inline-flex h-10 w-10 items-center justify-center rounded-[0.95rem] border border-app-border bg-app-element text-app-text"
									on:click={handleSignOut}
								>
									<LogOut size={16} />
								</button>
							{/if}
						</div>
					</header>

					<div class="space-y-2 px-3 pt-2 lg:px-4">
						{#if workspaceError}
							<div class="rounded-[1.2rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-rose-100">
											Workspace refresh needs attention
										</p>
										<p class="mt-1 text-sm text-rose-100/80">{workspaceError}</p>
									</div>
									<button
										type="button"
										class="rounded-[0.95rem] border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100"
										on:click={handleRetryInitialization}
									>
										Retry
									</button>
								</div>
							</div>
						{/if}

						{#if syncErrorMessage}
							<div
								class="rounded-[1.2rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
							>
								{syncErrorMessage}
							</div>
						{/if}

						{#if isRestoring}
							<div
								class="rounded-[1.2rem] border border-app-primary/25 bg-app-primary/10 px-4 py-3 text-sm text-app-text"
							>
								Restoring boards from backup. Shared board data is being recreated now.
							</div>
						{/if}
					</div>

					{#if workspaceHydrating && projects.length === 0}
						<div class="flex min-h-0 flex-1 items-center justify-center p-6">
							<div
								class="flex max-w-md flex-col items-center gap-4 rounded-[1.8rem] border border-app-border bg-app-surface/88 px-8 py-7 text-center shadow-kainbu-xl"
							>
								<BrandMark size={58} alt="" />
								<LoaderCircle size={26} class="animate-spin text-app-primary" />
								<div>
									<p class="font-display text-2xl font-bold text-app-text">Loading your boards</p>
									<p class="mt-2 text-sm leading-relaxed text-app-subtext">
										Pulling shared projects, private chat history, invites, and due dates into
										place.
									</p>
								</div>
							</div>
						</div>
					{:else}
						<div class="min-h-0 flex-1 overflow-hidden lg:px-4 lg:pb-4 lg:pt-3">
							{#if isMobile}
								<div class="relative h-full min-h-0 overflow-hidden">
									{#if mobileTab === 'dashboard'}
										<DashboardView
											{projects}
											{currentProjectId}
											{incomingInvites}
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
										/>
									{:else if mobileTab === 'kanban' && currentProject}
										<KanbanBoard
											data={kanbanData}
											comparisonData={kanbanComparisonData}
											{highlightedTaskIds}
											isLocked={proposalPreviewTarget === 'kanban'}
											defaultShowCheckbox={settings.defaultShowCheckbox}
											active={mobileTab === 'kanban'}
											members={currentProject.members}
											onChange={handleKanbanChange}
											onSendToChat={handleSendTaskToChat}
										/>
									{:else if mobileTab === 'scratchpad' && currentProject}
										<div class="absolute inset-0 flex flex-col">
											{#if activeScratchpadConflict}
												<div class="border-b border-app-border bg-amber-500/10 px-4 py-3">
													<p class="text-sm font-semibold text-amber-100">
														Shared notes changed somewhere else
													</p>
													<p class="mt-1 text-sm text-amber-100/80">
														Review the remote copy below, then either load it or explicitly sync
														your merged notes.
													</p>
													<pre
														class="mt-3 max-h-28 overflow-auto rounded-[1rem] border border-amber-300/15 bg-app-bg/60 p-3 text-xs leading-relaxed text-amber-50">{JSON.stringify(
															activeScratchpadConflict.remoteData.pads,
															null,
															2
														)}</pre>
													<div class="mt-3 flex gap-2">
														<button
															type="button"
															class="rounded-[0.95rem] bg-app-primary px-3 py-2 text-sm font-semibold text-white"
															on:click={handleLoadRemoteScratchpad}
														>
															Load remote version
														</button>
														<button
															type="button"
															class="rounded-[0.95rem] border border-app-border bg-app-element px-3 py-2 text-sm font-semibold text-app-text"
															on:click={handleSyncMergedScratchpad}
														>
															Use my merged notes
														</button>
													</div>
												</div>
											{/if}

											<ScratchpadPane
												pads={currentProject.scratchpadData.pads}
												activePadId={visibleScratchpadPad?.id ||
													currentProject.scratchpadData.activePadId}
												content={scratchpadContent}
												isLocked={proposalPreviewTarget === 'scratchpad'}
												comparisonContent={scratchpadComparisonContent}
												active={mobileTab === 'scratchpad'}
												onSelectPad={handleSelectScratchpadPad}
												onCreatePad={handleCreateScratchpadPad}
												onDeletePad={handleDeleteScratchpadPad}
												onChange={handleScratchpadChange}
											/>
										</div>
									{:else if mobileTab === 'chat' && currentProject}
										<ChatPane
											history={currentProject.chatHistory}
											draft={composerDraft}
											{queuedAttachments}
											{queuedTaskCards}
											isProcessing={isAiProcessing}
											pendingProposal={activePendingProposal}
											proposalPreviewActive={Boolean(
												activePendingProposal &&
												proposalPreviewTarget === activePendingProposal.target
											)}
											chatMode={settings.preferredChatMode}
											modelPreset={settings.preferredModelPreset}
											active={mobileTab === 'chat'}
											chrome="mobile"
											onDraftChange={handleDraftChange}
											onSend={handleSendMessage}
											onAddAttachments={handleAddAttachments}
											onRemoveAttachment={handleRemoveAttachment}
											onRemoveTaskCard={handleRemoveTaskCard}
											onClearHistory={handleClearHistory}
											onChatModeChange={handleChatModeChange}
											onModelPresetChange={handleModelPresetChange}
											onReviewProposal={activePendingProposal ? handleReviewProposal : null}
											onAcceptProposal={handleAcceptProposal}
											onRejectProposal={handleRejectProposal}
										/>
									{:else if mobileTab === 'settings'}
										<SettingsView
											{settings}
											{currentProject}
											personalImageUrl={personalBackgroundImageUrl}
											boardImageUrl={projectBackgroundImageUrl}
											personalImageUploading={personalBackgroundUploading}
											boardImageUploading={projectBackgroundUploading}
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
												class="max-w-sm rounded-[1.6rem] border border-dashed border-app-border bg-app-bg/70 p-6 text-center"
											>
												<BrandMark size={56} className="mx-auto" alt="" />
												<p class="mt-4 font-display text-2xl font-bold text-app-text">
													Open a board first
												</p>
												<p class="mt-2 text-sm leading-relaxed text-app-subtext">
													Use the dashboard tab to create or select a board before jumping into
													Kanban, notes, or private AI chat.
												</p>
												<div class="mt-4 flex justify-center gap-2">
													<button
														type="button"
														class="rounded-[0.95rem] bg-app-primary px-4 py-2 text-sm font-semibold text-white"
														on:click={() => setWorkspaceTab('dashboard')}
													>
														Go to dashboard
													</button>
													<button
														type="button"
														class="rounded-[0.95rem] border border-app-border bg-app-element px-4 py-2 text-sm font-semibold text-app-text"
														on:click={handleCreateProject}
													>
														New board
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
										/>
									{:else if desktopWorkspaceTab === 'kanban' && currentProject}
										<KanbanBoard
											data={kanbanData}
											comparisonData={kanbanComparisonData}
											{highlightedTaskIds}
											isLocked={proposalPreviewTarget === 'kanban'}
											defaultShowCheckbox={settings.defaultShowCheckbox}
											active={desktopWorkspaceTab === 'kanban'}
											members={currentProject.members}
											onChange={handleKanbanChange}
											onSendToChat={handleSendTaskToChat}
										/>
									{:else if desktopWorkspaceTab === 'scratchpad' && currentProject}
										<div class="absolute inset-0 flex flex-col">
											{#if activeScratchpadConflict}
												<div class="border-b border-app-border bg-amber-500/10 px-4 py-3">
													<p class="text-sm font-semibold text-amber-100">
														Shared notes changed somewhere else
													</p>
													<p class="mt-1 text-sm text-amber-100/80">
														Review the remote copy below, then either load it or explicitly sync
														your merged notes.
													</p>
													<pre
														class="mt-3 max-h-32 overflow-auto rounded-[1rem] border border-amber-300/15 bg-app-bg/60 p-3 text-xs leading-relaxed text-amber-50">{JSON.stringify(
															activeScratchpadConflict.remoteData.pads,
															null,
															2
														)}</pre>
													<div class="mt-3 flex gap-2">
														<button
															type="button"
															class="rounded-[0.95rem] bg-app-primary px-3 py-2 text-sm font-semibold text-white"
															on:click={handleLoadRemoteScratchpad}
														>
															Load remote version
														</button>
														<button
															type="button"
															class="rounded-[0.95rem] border border-app-border bg-app-element px-3 py-2 text-sm font-semibold text-app-text"
															on:click={handleSyncMergedScratchpad}
														>
															Use my merged notes
														</button>
													</div>
												</div>
											{/if}

											<ScratchpadPane
												pads={currentProject.scratchpadData.pads}
												activePadId={visibleScratchpadPad?.id ||
													currentProject.scratchpadData.activePadId}
												content={scratchpadContent}
												isLocked={proposalPreviewTarget === 'scratchpad'}
												comparisonContent={scratchpadComparisonContent}
												active={desktopWorkspaceTab === 'scratchpad'}
												onSelectPad={handleSelectScratchpadPad}
												onCreatePad={handleCreateScratchpadPad}
												onDeletePad={handleDeleteScratchpadPad}
												onChange={handleScratchpadChange}
											/>
										</div>
									{:else if desktopWorkspaceTab === 'settings'}
										<SettingsView
											{settings}
											{currentProject}
											personalImageUrl={personalBackgroundImageUrl}
											boardImageUrl={projectBackgroundImageUrl}
											personalImageUploading={personalBackgroundUploading}
											boardImageUploading={projectBackgroundUploading}
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
												class="max-w-md rounded-[1.6rem] border border-dashed border-app-border bg-app-bg/70 p-6 text-center"
											>
												<BrandMark size={56} className="mx-auto" alt="" />
												<p class="mt-4 font-display text-2xl font-bold text-app-text">
													Open a board first
												</p>
												<p class="mt-2 text-sm leading-relaxed text-app-subtext">
													Choose a board from the dashboard or rail to start editing columns, notes,
													or your private AI thread.
												</p>
												<div class="mt-4 flex justify-center gap-2">
													<button
														type="button"
														class="rounded-[0.95rem] bg-app-primary px-4 py-2 text-sm font-semibold text-white"
														on:click={() => setWorkspaceTab('dashboard')}
													>
														Go to dashboard
													</button>
													<button
														type="button"
														class="rounded-[0.95rem] border border-app-border bg-app-element px-4 py-2 text-sm font-semibold text-app-text"
														on:click={handleCreateProject}
													>
														New board
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
						<nav
							class="border-t border-app-border bg-app-surface/92 px-2 pt-2 pb-[calc(0.5rem+var(--safe-bottom))] backdrop-blur-xl"
						>
							<div class="grid grid-cols-5 gap-1">
								<button
									type="button"
									class={`inline-flex flex-col items-center justify-center gap-1 rounded-[1rem] px-1 py-2 text-[10px] font-semibold transition ${
										mobileTab === 'dashboard' ? 'bg-app-primary text-white' : 'text-app-subtext'
									}`}
									on:click={() => setWorkspaceTab('dashboard')}
								>
									<LayoutDashboard size={16} />
									Home
								</button>
								<button
									type="button"
									class={`inline-flex flex-col items-center justify-center gap-1 rounded-[1rem] px-1 py-2 text-[10px] font-semibold transition ${
										mobileTab === 'kanban' ? 'bg-app-primary text-white' : 'text-app-subtext'
									}`}
									on:click={() => setWorkspaceTab('kanban')}
								>
									<Sparkles size={16} />
									Kanban
								</button>
								<button
									type="button"
									class={`inline-flex flex-col items-center justify-center gap-1 rounded-[1rem] px-1 py-2 text-[10px] font-semibold transition ${
										mobileTab === 'scratchpad' ? 'bg-app-primary text-white' : 'text-app-subtext'
									}`}
									on:click={() => setWorkspaceTab('scratchpad')}
								>
									<NotebookPen size={16} />
									Notes
								</button>
								<button
									type="button"
									class={`inline-flex flex-col items-center justify-center gap-1 rounded-[1rem] px-1 py-2 text-[10px] font-semibold transition ${
										mobileTab === 'chat' ? 'bg-app-primary text-white' : 'text-app-subtext'
									}`}
									on:click={() => setWorkspaceTab('chat')}
								>
									<MessageSquare size={16} />
									Chat
								</button>
								<button
									type="button"
									class={`inline-flex flex-col items-center justify-center gap-1 rounded-[1rem] px-1 py-2 text-[10px] font-semibold transition ${
										mobileTab === 'settings' ? 'bg-app-primary text-white' : 'text-app-subtext'
									}`}
									on:click={() => setWorkspaceTab('settings')}
								>
									<Settings2 size={16} />
									Settings
								</button>
							</div>
						</nav>
					{/if}
				</div>

				{#if !isMobile && currentProject && desktopWorkspaceTab !== 'settings'}
					{#if desktopChatCollapsed}
						<button
							type="button"
							class="absolute bottom-4 right-4 z-20 grid h-14 w-14 place-items-center rounded-full bg-app-primary text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)] transition hover:scale-[1.03] hover:bg-app-primary-hover"
							on:click={() => (desktopChatCollapsed = false)}
							aria-label="Open chat sidebar"
							title="Open chat sidebar"
						>
							<MessageSquare size={20} />
						</button>
					{:else}
						<div
							class="h-full w-2 shrink-0 cursor-col-resize bg-app-bg/35 transition hover:bg-app-primary/20"
							on:pointerdown={handleDesktopChatResizeStart}
						></div>
						<div
							class="relative h-full min-w-0 shrink-0 border-l border-app-border bg-app-surface/92 backdrop-blur-xl"
							style={`width:${desktopChatWidth}rem;`}
						>
							<ChatPane
								history={currentProject.chatHistory}
								draft={composerDraft}
								{queuedAttachments}
								{queuedTaskCards}
								isProcessing={isAiProcessing}
								pendingProposal={activePendingProposal}
								proposalPreviewActive={Boolean(
									activePendingProposal && proposalPreviewTarget === activePendingProposal.target
								)}
								chatMode={settings.preferredChatMode}
								modelPreset={settings.preferredModelPreset}
								active={true}
								chrome="sidebar"
								onDraftChange={handleDraftChange}
								onSend={handleSendMessage}
								onAddAttachments={handleAddAttachments}
								onRemoveAttachment={handleRemoveAttachment}
								onRemoveTaskCard={handleRemoveTaskCard}
								onClearHistory={handleClearHistory}
								onChatModeChange={handleChatModeChange}
								onModelPresetChange={handleModelPresetChange}
								onReviewProposal={activePendingProposal ? handleReviewProposal : null}
								onAcceptProposal={handleAcceptProposal}
								onRejectProposal={handleRejectProposal}
								onCollapseSidebar={() => (desktopChatCollapsed = true)}
							/>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		{#if showProjectSheet}
			<ProjectSheet
				{projects}
				{currentProjectId}
				onClose={() => (showProjectSheet = false)}
				onSwitch={openProjectWorkspace}
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
