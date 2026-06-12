<script lang="ts">
	import { afterUpdate, tick } from 'svelte';
	import {
		Check,
		CheckCircle2,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Circle,
		Copy,
		Ellipsis,
		ExternalLink,
		Info,
		LoaderCircle,
		PanelRight,
		Pencil,
		Paperclip,
		Plus,
		RefreshCw,
		Search,
		Send,
		SlidersHorizontal,
		Trash2,
		Upload,
		X,
		XCircle
	} from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { createId } from '$lib/kainbu/id';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import { thinkingLevelLabel } from '$lib/kainbu/models';
	import type {
		AiModelConfig,
		AiModelId,
		AiProgressEvent,
		ChatAttachment,
		ChatMessage,
		ChatTaskCard,
		PendingProposal,
		ProjectAiSession,
		ProposalTarget
	} from '$lib/kainbu/types';
	import RichText from '$lib/components/RichText.svelte';
	import { sanitizeUserFacingAiReply } from '$lib/kainbu/sanitizeAiReply';
	import AiActivityTrace from '$lib/components/AiActivityTrace.svelte';

	export let history: ChatMessage[] = [];
	export let draft = '';
	export let queuedAttachments: ChatAttachment[] = [];
	export let queuedTaskCards: ChatTaskCard[] = [];
	export let isProcessing = false;
	export let processingEvents: AiProgressEvent[] = [];
	export let pendingProposals: PendingProposal[] = [];
	export let proposalApplyErrors: Record<string, string> = {};
	export let applyingProposalId: string | null = null;
	export let activeProposalTarget: ProposalTarget | null = null;
	export let sessions: ProjectAiSession[] = [];
	export let activeSessionId = '';
	export let modelId: AiModelId = '';
	export let modelOptions: AiModelConfig[] = [];
	export let thinkingLevel: import('$lib/kainbu/types').AiThinkingLevel = 'none';
	export let onThinkingLevelChange: (level: import('$lib/kainbu/types').AiThinkingLevel) => void;
	export let active = true;
	export let chrome: 'floating' | 'sidebar' | 'mobile' = 'floating';
	export let onDraftChange: (value: string) => void;
	export let onSend: () => void;
	export let onAddAttachments: (attachments: ChatAttachment[]) => void;
	export let onRemoveAttachment: (attachmentId: string) => void;
	export let onRemoveTaskCard: (taskCardId: string) => void;
	export let onClearHistory: (() => void) | null = null;
	export let onSessionChange: (sessionId: string) => void;
	export let onCreateSession: () => void;
	export let onRenameSession: (sessionId: string, title: string) => void;
	export let onDeleteSession: (sessionId: string) => void;
	export let onModelChange: (modelId: AiModelId) => void;
	export let onReviewProposal: ((target: ProposalTarget) => void) | null = null;
	export let onAcceptProposal: (proposalId: string) => void;
	export let onRejectProposal: (proposalId: string) => void;
	export let onAnswerQuestion: (questionId: string, optionId?: string, text?: string) => void;
	export let onAnswerQuestions: (
		answers: { questionId: string; optionId?: string; text?: string }[]
	) => void = (answers) => {
		const [answer] = answers;
		if (answer) onAnswerQuestion(answer.questionId, answer.optionId, answer.text);
	};
	export let onCollapseSidebar: (() => void) | null = null;
	export let hideHeader = false;
	export let sessionSwitcherAnchor: HTMLElement | null = null;

	$: activeModel = modelOptions.find((entry) => entry.id === modelId) ?? modelOptions[0] ?? null;
	$: thinkingChoices = activeModel?.allowedThinkingLevels?.length
		? activeModel.allowedThinkingLevels
		: (['none'] as const);
	$: showThinkingSelect = thinkingChoices.some((level) => level !== 'none');
	$: mobileAiSettingsLabel = `${activeModel?.id || modelId || 'Model'}${
		showThinkingSelect ? `, ${thinkingLevelLabel(thinkingLevel)}` : ''
	}`;

	// The orb pulses while we're waiting (preparing, tools, idle) and holds steady
	// once text is actively streaming, so the motion reads as "thinking" not "stalled".
	$: isStreamingText =
		processingEvents.at(-1)?.kind === 'thinking' ||
		processingEvents.at(-1)?.kind === 'assistant_draft';

	let fileInput: HTMLInputElement | null = null;
	let historyViewport: HTMLDivElement | null = null;
	let previewViewport: HTMLDivElement | null = null;
	const COMPOSER_MIN_HEIGHT = 44;
	const COMPOSER_MAX_HEIGHT = 176;
	const PREVIEW_MIN_SCALE = 1;
	const PREVIEW_MAX_SCALE = 4;
	const TEXT_ATTACHMENT_EXTENSIONS = [
		'.txt',
		'.md',
		'.json',
		'.js',
		'.jsx',
		'.ts',
		'.tsx',
		'.css',
		'.html'
	];

	$: isSidebar = chrome === 'sidebar';
	$: isMobileChrome = chrome === 'mobile';
	$: isDesktopSidebar = isSidebar && !isMobileChrome;
	$: isFramelessChrome = isSidebar || isMobileChrome;
	$: sidebarSectionLabelClass =
		'text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext/70';
	$: activeSession =
		sessions.find((session) => session.id === activeSessionId) || sessions[0] || null;

	// Sidebar opens on the active session; use back to browse all sessions.
	let showingSessionsList = false;
	let showAllSessions = false;
	let sessionSearchActive = false;
	let sessionSearchQuery = '';
	const VISIBLE_SESSION_COUNT = 5;

	$: sortedSessions = [...sessions].sort(
		(a, b) => (b.lastMessageAt || b.updatedAt) - (a.lastMessageAt || a.updatedAt)
	);
	$: filteredSessions = sessionSearchQuery.trim()
		? sortedSessions.filter((s) =>
				s.title.toLowerCase().includes(sessionSearchQuery.trim().toLowerCase())
			)
		: sortedSessions;
	$: displayedSessions = sessionSearchActive
		? filteredSessions
		: showAllSessions
			? sortedSessions
			: sortedSessions.slice(0, VISIBLE_SESSION_COUNT);
	$: remainingSessionCount = Math.max(0, sessions.length - VISIBLE_SESSION_COUNT);

	let sessionSwitcherOpen = false;
	let switcherSearchQuery = '';
	let hoveredSwitcherSessionId = '';
	let sessionSwitcherTrigger: HTMLButtonElement | null = null;
	let switcherSearchInput: HTMLInputElement | null = null;
	let switcherPosition: { top: number; left: number; width: number } | null = null;

	type ComposerMenuKind = 'model' | 'thinking' | 'settings';
	let composerMenu: ComposerMenuKind | null = null;
	let modelMenuTrigger: HTMLButtonElement | null = null;
	let thinkingMenuTrigger: HTMLButtonElement | null = null;
	let settingsMenuTrigger: HTMLButtonElement | null = null;
	let composerMenuPosition: {
		top?: number;
		bottom?: number;
		left: number;
		width: number;
	} | null = null;

	$: switcherFilteredSessions = switcherSearchQuery.trim()
		? sortedSessions.filter((session) =>
				session.title.toLowerCase().includes(switcherSearchQuery.trim().toLowerCase())
			)
		: sortedSessions;

	type SessionTimeGroup = {
		label: string;
		sessions: ProjectAiSession[];
	};

	const sessionActivityTimestamp = (session: ProjectAiSession) =>
		session.lastMessageAt || session.updatedAt;

	const startOfLocalDay = (timestamp: number) => {
		const date = new Date(timestamp);
		date.setHours(0, 0, 0, 0);
		return date.getTime();
	};

	const groupSessionsByDate = (sessionList: ProjectAiSession[]): SessionTimeGroup[] => {
		const todayStart = startOfLocalDay(Date.now());
		const yesterdayStart = todayStart - 86_400_000;
		const weekStart = todayStart - 6 * 86_400_000;
		const buckets = {
			Today: [] as ProjectAiSession[],
			Yesterday: [] as ProjectAiSession[],
			'Previous 7 days': [] as ProjectAiSession[],
			Older: [] as ProjectAiSession[]
		};

		for (const session of sessionList) {
			const timestamp = sessionActivityTimestamp(session);
			if (timestamp >= todayStart) buckets.Today.push(session);
			else if (timestamp >= yesterdayStart) buckets.Yesterday.push(session);
			else if (timestamp >= weekStart) buckets['Previous 7 days'].push(session);
			else buckets.Older.push(session);
		}

		return [
			{ label: 'Today', sessions: buckets.Today },
			{ label: 'Yesterday', sessions: buckets.Yesterday },
			{ label: 'Previous 7 days', sessions: buckets['Previous 7 days'] },
			{ label: 'Older', sessions: buckets.Older }
		].filter((group) => group.sessions.length > 0);
	};

	$: switcherGroupedSessions = groupSessionsByDate(switcherFilteredSessions);

	const portal = (node: HTMLElement) => {
		if (typeof document === 'undefined') return {};
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	};

	const updateSwitcherPosition = () => {
		const anchor = sessionSwitcherAnchor || sessionSwitcherTrigger;
		if (!anchor) return;
		const rect = anchor.getBoundingClientRect();
		const width = Math.max(rect.width, isMobileChrome ? 260 : 288);
		const maxLeft = Math.max(8, window.innerWidth - width - 8);
		const panelHeight = 384;
		const belowTop = rect.bottom + 6;
		const fitsBelow = belowTop + panelHeight <= window.innerHeight - 8;
		switcherPosition = {
			top: fitsBelow ? belowTop : Math.max(8, rect.top - panelHeight - 6),
			left: Math.min(rect.left, maxLeft),
			width
		};
	};

	const openSessionSwitcher = async () => {
		sessionSwitcherOpen = true;
		switcherSearchQuery = '';
		hoveredSwitcherSessionId = '';
		await tick();
		updateSwitcherPosition();
		switcherSearchInput?.focus();
	};

	const closeSessionSwitcher = () => {
		sessionSwitcherOpen = false;
		switcherPosition = null;
		switcherSearchQuery = '';
		hoveredSwitcherSessionId = '';
	};

	const closeComposerMenu = () => {
		composerMenu = null;
		composerMenuPosition = null;
	};

	const getComposerMenuTrigger = (kind: ComposerMenuKind) => {
		if (kind === 'model') return modelMenuTrigger;
		if (kind === 'thinking') return thinkingMenuTrigger;
		return settingsMenuTrigger;
	};

	const updateComposerMenuPosition = (kind: ComposerMenuKind) => {
		const trigger = getComposerMenuTrigger(kind);
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const width =
			kind === 'settings'
				? Math.min(Math.max(rect.width, 280), window.innerWidth - 16)
				: kind === 'model'
					? Math.max(rect.width, isMobileChrome ? 240 : 288)
					: Math.max(rect.width, 168);
		const maxLeft = Math.max(8, window.innerWidth - width - 8);
		const maxPanelHeight = kind === 'settings' ? 320 : 256;
		const gap = 6;
		const fitsAbove = rect.top - maxPanelHeight - gap >= 8;
		composerMenuPosition = fitsAbove
			? {
					bottom: window.innerHeight - rect.top + gap,
					left: Math.min(rect.left, maxLeft),
					width
				}
			: {
					top: Math.max(8, rect.bottom + gap),
					left: Math.min(rect.left, maxLeft),
					width
				};
	};

	const openComposerMenu = async (kind: ComposerMenuKind) => {
		if (sessionSwitcherOpen) closeSessionSwitcher();
		composerMenu = kind;
		await tick();
		updateComposerMenuPosition(kind);
	};

	const toggleComposerMenu = (kind: ComposerMenuKind) => {
		if (composerMenu === kind) closeComposerMenu();
		else void openComposerMenu(kind);
	};

	const selectComposerModel = (nextModelId: AiModelId) => {
		onModelChange(nextModelId);
		closeComposerMenu();
	};

	const selectComposerThinkingLevel = (
		level: import('$lib/kainbu/types').AiThinkingLevel
	) => {
		onThinkingLevelChange(level);
		closeComposerMenu();
	};

	export const toggleSessionSwitcher = () => {
		if (sessionSwitcherOpen) closeSessionSwitcher();
		else {
			closeComposerMenu();
			void openSessionSwitcher();
		}
	};

	const selectSwitcherSession = (sessionId: string) => {
		onSessionChange(sessionId);
		closeSessionSwitcher();
	};

	const requestSessionRenameById = (session: ProjectAiSession) => {
		if (typeof window === 'undefined') return;
		const nextTitle = window.prompt('Rename this chat', session.title);
		if (nextTitle == null) return;
		const trimmed = nextTitle.trim();
		if (!trimmed || trimmed === session.title) return;
		onRenameSession(session.id, trimmed);
	};

	const requestSessionDeleteById = (session: ProjectAiSession) => {
		if (typeof window === 'undefined') return;
		if (!window.confirm(`Delete "${session.title}"?`)) return;
		onDeleteSession(session.id);
		closeSessionSwitcher();
	};

	$: if (!active && sessionSwitcherOpen) {
		closeSessionSwitcher();
	}

	$: if (!active && composerMenu) {
		closeComposerMenu();
	}

	const relativeTime = (timestamp: number) => {
		if (!timestamp) return '';
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hrs ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		const weeks = Math.floor(days / 7);
		return `${weeks}w ago`;
	};

	const absoluteTime = (timestamp: number) =>
		timestamp
			? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
			: '';

	const openSession = (sessionId: string) => {
		showingSessionsList = false;
		showAllSessions = false;
		onSessionChange(sessionId);
	};

	const backToSessionsList = () => {
		showingSessionsList = true;
	};

	let previousHistorySignature = '';
	let previousActive = false;
	let previousIsProcessing = false;
	let pinnedTurnUserMessageId: string | null = null;
	let pinnedSpacerHeight = 0;
	let historyViewportHeight = 0;
	const USER_MESSAGE_PEEK_PX = 40;
	let previewAttachment: ChatAttachment | null = null;
	let previewScale = PREVIEW_MIN_SCALE;
	let previewOffsetX = 0;
	let previewOffsetY = 0;
	let previewIsDragging = false;
	let previewPointers = new Map<number, { x: number; y: number }>();
	let previewPinchStartDistance = 0;
	let previewPinchStartScale = PREVIEW_MIN_SCALE;
	let previewDragStartX = 0;
	let previewDragStartY = 0;
	let previewDragOriginX = 0;
	let previewDragOriginY = 0;
	let questionDrafts: Record<string, string> = {};
	let stagedOptionByQuestion: Record<string, string | undefined> = {};
	let activeOpenQuestionIndex = 0;
	let copiedMessageId = '';
	let copiedMessageTimeout: ReturnType<typeof setTimeout> | null = null;

	$: openQuestions = history
		.filter((message) => message.question?.status === 'open')
		.map((message) => message.question!)
		.filter(
			(question, index, questions) =>
				questions.findIndex((entry) => entry.id === question.id) === index
		);
	$: if (activeOpenQuestionIndex >= openQuestions.length) {
		activeOpenQuestionIndex = Math.max(0, openQuestions.length - 1);
	}
	$: activeOpenQuestion = openQuestions[activeOpenQuestionIndex] || null;
	$: showQuestionCarousel = openQuestions.length > 0;
	$: questionStaged = (questionId: string) =>
		Boolean(stagedOptionByQuestion[questionId]) ||
		Boolean((questionDrafts[questionId] || '').trim());
	$: stagedQuestionCount = openQuestions.filter((question) => questionStaged(question.id)).length;
	$: allQuestionsStaged =
		openQuestions.length > 0 && stagedQuestionCount === openQuestions.length;

	$: if (!active && previewAttachment) {
		previewAttachment = null;
	}

	const toDataUrl = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => resolve(reader.result as string);
			reader.readAsDataURL(file);
		});

	const toText = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => resolve(reader.result as string);
			reader.readAsText(file);
		});

	const isSupportedTextAttachment = (file: File) => {
		const normalizedName = file.name.toLowerCase();
		return (
			file.type.startsWith('text/') ||
			file.type === 'application/json' ||
			file.type === 'application/javascript' ||
			TEXT_ATTACHMENT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
		);
	};

	const handleFiles = async (fileList: FileList | null) => {
		if (!fileList?.length) return;

		const nextAttachments: ChatAttachment[] = [];
		for (const file of Array.from(fileList)) {
			if (file.type.startsWith('image/')) {
				nextAttachments.push({
					id: createId(),
					kind: 'image',
					name: file.name,
					mimeType: file.type,
					content: await toDataUrl(file)
				});
				continue;
			}

			if (isSupportedTextAttachment(file)) {
				nextAttachments.push({
					id: createId(),
					kind: 'text',
					name: file.name,
					mimeType: file.type || 'text/plain',
					content: await toText(file)
				});
			}
		}

		if (nextAttachments.length) {
			onAddAttachments(nextAttachments);
		}
		if (fileInput) fileInput.value = '';
	};

	$: canSend =
		(draft.trim().length > 0 || queuedAttachments.length > 0 || queuedTaskCards.length > 0) &&
		!isProcessing;

	const submitComposer = () => {
		if (!canSend) return;
		if (showingSessionsList) {
			onCreateSession();
			showingSessionsList = false;
		}
		onSend();
	};

	const handleComposerPaste = async (event: ClipboardEvent) => {
		if (isProcessing) return;
		const clipboardFiles = Array.from(event.clipboardData?.items || [])
			.filter((item) => item.type.startsWith('image/'))
			.map((item) => item.getAsFile())
			.filter((file): file is File => Boolean(file));

		if (!clipboardFiles.length) return;
		event.preventDefault();
		const transfer = new DataTransfer();
		clipboardFiles.forEach((file) => transfer.items.add(file));
		await handleFiles(transfer.files);
	};

	const clampPreviewScale = (value: number) =>
		Math.max(PREVIEW_MIN_SCALE, Math.min(PREVIEW_MAX_SCALE, value));

	const clampPreviewOffset = (nextX: number, nextY: number, scale = previewScale) => {
		if (!previewViewport || scale <= PREVIEW_MIN_SCALE) {
			return { x: 0, y: 0 };
		}

		const bounds = previewViewport.getBoundingClientRect();
		const maxX = Math.max(0, (bounds.width * scale - bounds.width) / 2);
		const maxY = Math.max(0, (bounds.height * scale - bounds.height) / 2);

		return {
			x: Math.max(-maxX, Math.min(maxX, nextX)),
			y: Math.max(-maxY, Math.min(maxY, nextY))
		};
	};

	const applyPreviewTransform = (scale: number, nextX = previewOffsetX, nextY = previewOffsetY) => {
		previewScale = clampPreviewScale(scale);
		const nextOffset = clampPreviewOffset(nextX, nextY, previewScale);
		previewOffsetX = nextOffset.x;
		previewOffsetY = nextOffset.y;
		if (previewScale <= PREVIEW_MIN_SCALE) {
			previewIsDragging = false;
		}
	};

	const resetPreviewTransform = () => {
		previewScale = PREVIEW_MIN_SCALE;
		previewOffsetX = 0;
		previewOffsetY = 0;
		previewIsDragging = false;
		previewPointers = new Map();
		previewPinchStartDistance = 0;
		previewPinchStartScale = PREVIEW_MIN_SCALE;
		previewDragStartX = 0;
		previewDragStartY = 0;
		previewDragOriginX = 0;
		previewDragOriginY = 0;
	};

	const openAttachmentPreview = (attachment: ChatAttachment) => {
		if (attachment.kind !== 'image') return;
		resetPreviewTransform();
		previewAttachment = attachment;
	};

	const closeAttachmentPreview = () => {
		resetPreviewTransform();
		previewAttachment = null;
	};

	const requestSessionRename = () => {
		if (!activeSession || typeof window === 'undefined') return;
		const nextTitle = window.prompt('Rename this chat', activeSession.title);
		if (nextTitle == null) return;
		const trimmed = nextTitle.trim();
		if (!trimmed || trimmed === activeSession.title) return;
		onRenameSession(activeSession.id, trimmed);
	};

	const requestSessionDelete = () => {
		if (!activeSession || typeof window === 'undefined') return;
		if (!window.confirm(`Delete "${activeSession.title}"?`)) return;
		onDeleteSession(activeSession.id);
	};

	const openPreviewInNewTab = () => {
		if (!previewAttachment) return;
		window.open(previewAttachment.content, '_blank', 'noopener,noreferrer');
	};

	const getPointerDistance = (points: Array<{ x: number; y: number }>) =>
		points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;

	const handlePreviewPointerDown = (event: PointerEvent) => {
		if (!previewAttachment) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		previewPointers = new Map(previewPointers).set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});

		if (previewPointers.size === 1) {
			previewDragStartX = event.clientX;
			previewDragStartY = event.clientY;
			previewDragOriginX = previewOffsetX;
			previewDragOriginY = previewOffsetY;
			previewIsDragging = previewScale > PREVIEW_MIN_SCALE;
		}

		if (previewPointers.size === 2) {
			previewPinchStartDistance = getPointerDistance([...previewPointers.values()]);
			previewPinchStartScale = previewScale;
			previewIsDragging = false;
		}
	};

	const handlePreviewPointerMove = (event: PointerEvent) => {
		if (!previewPointers.has(event.pointerId)) return;
		previewPointers = new Map(previewPointers).set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});

		if (previewPointers.size >= 2) {
			const distance = getPointerDistance([...previewPointers.values()]);
			if (!previewPinchStartDistance) {
				previewPinchStartDistance = distance;
				previewPinchStartScale = previewScale;
				return;
			}

			const nextScale = clampPreviewScale(
				previewPinchStartScale * (distance / previewPinchStartDistance)
			);
			applyPreviewTransform(nextScale);
			return;
		}

		if (previewPointers.size === 1 && previewScale > PREVIEW_MIN_SCALE) {
			const nextX = previewDragOriginX + (event.clientX - previewDragStartX);
			const nextY = previewDragOriginY + (event.clientY - previewDragStartY);
			const nextOffset = clampPreviewOffset(nextX, nextY);
			previewOffsetX = nextOffset.x;
			previewOffsetY = nextOffset.y;
			previewIsDragging = true;
		}
	};

	const handlePreviewPointerEnd = (event: PointerEvent) => {
		if (previewPointers.has(event.pointerId)) {
			previewPointers = new Map(previewPointers);
			previewPointers.delete(event.pointerId);
		}

		if (previewPointers.size < 2) {
			previewPinchStartDistance = 0;
			previewPinchStartScale = previewScale;
		}

		if (previewPointers.size === 1) {
			const [point] = [...previewPointers.values()];
			previewDragStartX = point.x;
			previewDragStartY = point.y;
			previewDragOriginX = previewOffsetX;
			previewDragOriginY = previewOffsetY;
			previewIsDragging = previewScale > PREVIEW_MIN_SCALE;
			return;
		}

		if (!previewPointers.size && previewScale <= PREVIEW_MIN_SCALE) {
			previewIsDragging = false;
		}
	};

	const handlePreviewWheel = (event: WheelEvent) => {
		if (!previewAttachment) return;
		event.preventDefault();
		const nextScale = clampPreviewScale(previewScale - event.deltaY * 0.002);
		applyPreviewTransform(nextScale);
	};

	const togglePreviewZoom = () => {
		if (!previewAttachment) return;

		if (previewScale > PREVIEW_MIN_SCALE) {
			resetPreviewTransform();
			return;
		}

		applyPreviewTransform(2);
	};

	const attachmentExcerpt = (attachment: ChatAttachment, maxLength = 84) => {
		if (attachment.kind !== 'text') {
			return 'Preview ready';
		}

		const compactContent = attachment.content.replace(/\s+/g, ' ').trim();
		return compactContent ? summarize(compactContent, maxLength) : 'Text attachment';
	};

	const uniqueCitations = (message: ChatMessage) => {
		const map = new Map<string, { title?: string; url?: string }>();
		for (const annotation of message.annotations || []) {
			if (annotation.url) {
				map.set(annotation.url, {
					title: annotation.title,
					url: annotation.url
				});
			}
		}
		return [...map.values()];
	};

	const summarize = (value = '', maxLength = 92) =>
		value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
	const proposalStatusText = (proposal: PendingProposal) => {
		if (proposal.stale) {
			return 'Workspace changed since this was generated. Review the diff — you can still apply if it looks right.';
		}

		if (proposal.proposalSafety.outOfScope) {
			return 'Review carefully before applying. This one reaches beyond the original target.';
		}

		if (proposal.editCallCount > 1) {
			return proposal.target === 'kanban'
				? `${proposal.editCallCount} smaller card edits are batched into one board diff. Review the grouped insertions, edits, and deletions before applying them.`
				: `${proposal.editCallCount} smaller page edits are batched into one diff so you can review the full page change before applying it.`;
		}

		return proposal.target === 'kanban'
			? 'Board changes are ready to review and apply to the project.'
			: 'Page changes are ready to review and apply to the project.';
	};

	const setQuestionDraft = (questionId: string, value: string) => {
		questionDrafts = {
			...questionDrafts,
			[questionId]: value
		};
	};

	const toggleStagedOption = (questionId: string, optionId: string) => {
		stagedOptionByQuestion = {
			...stagedOptionByQuestion,
			[questionId]: stagedOptionByQuestion[questionId] === optionId ? undefined : optionId
		};
	};

	const showPreviousOpenQuestion = () => {
		if (activeOpenQuestionIndex <= 0) return;
		activeOpenQuestionIndex -= 1;
	};

	const showNextOpenQuestion = () => {
		if (activeOpenQuestionIndex >= openQuestions.length - 1) return;
		activeOpenQuestionIndex += 1;
	};

	const submitStagedAnswers = () => {
		if (isProcessing || !openQuestions.length) return;
		const answers = openQuestions.map((question) => {
			const optionId = stagedOptionByQuestion[question.id];
			const text = (questionDrafts[question.id] || '').trim();
			return {
				questionId: question.id,
				...(optionId ? { optionId } : {}),
				...(text ? { text } : {})
			};
		});
		// Every open question must carry an option or freeform answer; the batch
		// handler rejects partial submissions.
		if (!answers.every((answer) => answer.optionId || answer.text)) return;
		onAnswerQuestions(answers);
		stagedOptionByQuestion = {};
		questionDrafts = {};
		activeOpenQuestionIndex = 0;
	};

	const copyMessageText = async (message: ChatMessage) => {
		if (!message.text.trim()) return;
		await navigator.clipboard.writeText(message.text);
		copiedMessageId = message.id;
		if (copiedMessageTimeout) clearTimeout(copiedMessageTimeout);
		copiedMessageTimeout = setTimeout(() => {
			copiedMessageId = '';
			copiedMessageTimeout = null;
		}, 1200);
	};

	const shareMessageText = async (message: ChatMessage) => {
		if (!message.text.trim()) return;
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ text: message.text });
				return;
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
			}
		}
		await copyMessageText(message);
	};

	const regenerateFromAssistant = async (message: ChatMessage) => {
		if (isProcessing) return;
		const messageIndex = history.findIndex((entry) => entry.id === message.id);
		if (messageIndex < 0) return;
		for (let index = messageIndex - 1; index >= 0; index -= 1) {
			const previous = history[index];
			if (previous.role === 'user' && previous.text?.trim()) {
				onDraftChange(previous.text.trim());
				await tick();
				onSend();
				return;
			}
		}
	};

	const messageActionDetails = (message: ChatMessage) => {
		const parts = [absoluteTime(message.timestamp)];
		if (message.metadata?.latencyMs) {
			parts.push(`${(message.metadata.latencyMs / 1000).toFixed(2)}s`);
		}
		return parts.filter(Boolean).join(' · ');
	};

	const isCompactStatusMessage = (message: ChatMessage) =>
		message.role === 'assistant' &&
		(message.progressEvents?.length || 0) > 0 &&
		!message.text.trim().length &&
		!(message.attachments?.length || 0) &&
		!(message.taskCards?.length || 0) &&
		!message.question &&
		!(message.toolActions?.length || 0) &&
		!(message.annotations?.length || 0) &&
		!message.metadata &&
		!message.usage;

	const summarizeProgressEvent = (event: AiProgressEvent) => {
		const baseMessage = summarize(
			event.message.trim() || 'Thinking…',
			event.kind === 'assistant_draft' ? 120 : 88
		);
		const detail = summarize((event.detail || '').trim(), 88);
		if (event.kind === 'assistant_draft') {
			return `Drafting reply: ${baseMessage}`;
		}
		return detail ? `${baseMessage} ${detail}` : baseMessage;
	};
	const latestProgressText = (events: AiProgressEvent[] = []) =>
		events.length ? summarizeProgressEvent(events.at(-1)!) : 'Thinking…';

	const composerMinHeight = () => (isMobileChrome ? 32 : COMPOSER_MIN_HEIGHT);

	const resizeComposer = (node: HTMLTextAreaElement) => {
		const minHeight = composerMinHeight();
		node.style.height = 'auto';
		if (!node.value.trim()) {
			node.style.height = `${minHeight}px`;
			node.style.overflowY = 'hidden';
			return;
		}
		const nextHeight = Math.min(
			COMPOSER_MAX_HEIGHT,
			Math.max(minHeight, node.scrollHeight)
		);
		node.style.height = `${nextHeight}px`;
		node.style.overflowY = node.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
	};

	const autosizeComposer = (node: HTMLTextAreaElement, _draft: string) => {
		const syncSize = () => {
			tick().then(() => resizeComposer(node));
		};

		syncSize();

		return {
			update(_nextDraft: string) {
				syncSize();
			}
		};
	};

	const observeHistoryViewport = (node: HTMLDivElement) => {
		const syncHeight = () => {
			historyViewportHeight = node.clientHeight;
		};

		syncHeight();
		const resizeObserver = new ResizeObserver(syncHeight);
		resizeObserver.observe(node);

		return {
			destroy() {
				resizeObserver.disconnect();
			}
		};
	};

	const scrollHistoryToEnd = async (behavior: ScrollBehavior = 'smooth') => {
		await tick();
		if (!historyViewport) return;

		historyViewport.scrollTo({
			top: historyViewport.scrollHeight,
			behavior
		});

		// Late-loading content (rendered markdown, images) can grow the list after
		// an instant jump; re-anchor to the bottom on the next frames so a refresh
		// reliably lands at the end instead of mid-list.
		if (behavior === 'auto') {
			requestAnimationFrame(() => {
				if (!historyViewport) return;
				historyViewport.scrollTop = historyViewport.scrollHeight;
				requestAnimationFrame(() => {
					if (!historyViewport) return;
					historyViewport.scrollTop = historyViewport.scrollHeight;
				});
			});
		}
	};

	const findPinnedUserMessageEl = () => {
		if (!historyViewport || !pinnedTurnUserMessageId) return null;
		return historyViewport.querySelector<HTMLElement>(
			`[data-chat-message-id="${pinnedTurnUserMessageId}"]`
		);
	};

	// Spacer height that guarantees the pinned user message can sit near the top
	// (with a small peek) regardless of how short the assistant reply is.
	const measurePinnedSpacer = () => {
		if (!historyViewport) return 0;
		const messageEl = findPinnedUserMessageEl();
		if (!messageEl) return pinnedSpacerHeight;

		const viewportRect = historyViewport.getBoundingClientRect();
		const messageRect = messageEl.getBoundingClientRect();
		const messageTopInContent =
			historyViewport.scrollTop + (messageRect.top - viewportRect.top);
		const baseContentHeight = historyViewport.scrollHeight - pinnedSpacerHeight;
		const needed =
			historyViewport.clientHeight +
			messageTopInContent -
			USER_MESSAGE_PEEK_PX -
			baseContentHeight;

		return Math.max(0, Math.ceil(needed));
	};

	const pinUserMessageToTop = (behavior: ScrollBehavior = 'auto') => {
		if (!historyViewport) return;
		const messageEl = findPinnedUserMessageEl();
		if (!messageEl) return;

		const viewportRect = historyViewport.getBoundingClientRect();
		const messageTopInContent =
			historyViewport.scrollTop + (messageEl.getBoundingClientRect().top - viewportRect.top);
		const maxScrollTop = Math.max(
			0,
			historyViewport.scrollHeight - historyViewport.clientHeight
		);
		const nextScrollTop = Math.min(
			Math.max(0, messageTopInContent - USER_MESSAGE_PEEK_PX),
			maxScrollTop
		);

		if (Math.abs(historyViewport.scrollTop - nextScrollTop) < 2) return;
		historyViewport.scrollTo({ top: nextScrollTop, behavior });
	};

	const startPinnedTurn = (userMessageId: string) => {
		pinnedTurnUserMessageId = userMessageId;
		// Reserve a full viewport's worth of room up front so the reply can stream
		// below the pinned message. This is a one-time set — we do NOT remeasure on
		// every render (that caused a feedback loop) — so the layout height stays
		// stable from send through completion and there is no jump.
		pinnedSpacerHeight = Math.max(
			0,
			(historyViewport?.clientHeight ?? historyViewportHeight) - USER_MESSAGE_PEEK_PX
		);
		void tick().then(() => pinUserMessageToTop('smooth'));
	};

	// Trim the reserved space down to just what's needed once the reply is final,
	// without moving the pinned message. Runs a single time per turn.
	const trimPinnedSpacer = () => {
		void tick().then(() => {
			const next = measurePinnedSpacer();
			if (next !== pinnedSpacerHeight) pinnedSpacerHeight = next;
		});
	};

	const clearPinnedTurn = () => {
		if (pinnedTurnUserMessageId === null && pinnedSpacerHeight === 0) return;
		pinnedTurnUserMessageId = null;
		pinnedSpacerHeight = 0;
	};

	// Once the user scrolls to the bottom (past the reply), release the reserved
	// space so it doesn't linger. Only collapses when already at the bottom, so
	// there is no visible jump. Never runs while a reply is still streaming.
	const handleHistoryScroll = () => {
		if (!pinnedTurnUserMessageId || isProcessing || !historyViewport) return;
		const distanceFromBottom =
			historyViewport.scrollHeight -
			historyViewport.scrollTop -
			historyViewport.clientHeight;
		if (distanceFromBottom - pinnedSpacerHeight <= 4) {
			clearPinnedTurn();
		}
	};

	afterUpdate(() => {
		const historySignature = history.map((message) => message.id).join(':');
		const historyChanged = historySignature !== previousHistorySignature;
		const becameActive = active && !previousActive;
		const lastMessage = history.at(-1);
		const userMessageJustAdded =
			active && historyChanged && lastMessage?.role === 'user';
		const finishedProcessing = !isProcessing && previousIsProcessing;
		const sessionSwitched = becameActive || (historyChanged && !previousHistorySignature);

		if (sessionSwitched && !userMessageJustAdded) {
			clearPinnedTurn();
		}

		if (userMessageJustAdded && lastMessage) {
			// New turn: pin this user message near the top and stream below it.
			// Spacer is reserved once here — NOT recomputed every render.
			startPinnedTurn(lastMessage.id);
		} else if (finishedProcessing && pinnedTurnUserMessageId) {
			// Reply is final: trim the reserved space once (no position change).
			trimPinnedSpacer();
		} else if (!pinnedTurnUserMessageId && active && historyChanged) {
			const previousCount = previousHistorySignature
				? previousHistorySignature.split(':').length
				: 0;
			// Smooth only for a genuine single append to an existing list; initial
			// loads and bulk syncs jump instantly so refresh lands at the bottom.
			const isSingleAppend =
				previousHistorySignature !== '' && history.length === previousCount + 1;
			void scrollHistoryToEnd(isSingleAppend ? 'smooth' : 'auto');
		} else if (!pinnedTurnUserMessageId && active && becameActive) {
			void scrollHistoryToEnd('auto');
		}
		// While a turn is pinned and still streaming we intentionally do nothing,
		// so re-renders from streaming/realtime never schedule layout work.

		previousHistorySignature = historySignature;
		previousActive = active;
		previousIsProcessing = isProcessing;
	});
</script>

<svelte:window
	on:keydown={(event) => {
		if (event.key !== 'Escape') return;
		if (sessionSwitcherOpen) {
			event.preventDefault();
			closeSessionSwitcher();
			return;
		}
		if (composerMenu) {
			event.preventDefault();
			closeComposerMenu();
			return;
		}
		if (previewAttachment) {
			event.preventDefault();
			closeAttachmentPreview();
		}
	}}
	on:resize={() => {
		if (sessionSwitcherOpen) updateSwitcherPosition();
		if (composerMenu) updateComposerMenuPosition(composerMenu);
	}}
/>

<section
	class:hidden={!active}
	class={`absolute inset-0 flex flex-col overflow-hidden ${
		isFramelessChrome
			? 'bg-app-bg'
			: 'rounded-lg border border-app-border bg-app-surface'
	} ${isSidebar ? 'pb-1' : ''}`}
>
	{#if showingSessionsList && isSidebar}
		<header
			class={`flex items-center justify-between px-4 py-2.5 ${
				isDesktopSidebar ? 'border-b border-app-border/40' : 'border-b border-app-border'
			}`}
		>
			<span class={isDesktopSidebar ? sidebarSectionLabelClass : 'text-[11px] font-bold uppercase tracking-[0.28em] text-app-subtext'}
				>Sessions</span
			>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="rounded-md p-1.5 text-app-subtext transition hover:text-app-text"
					title="Refresh"
					aria-label="Refresh sessions"
				>
					<RefreshCw size={15} />
				</button>
				<button
					type="button"
					class={`rounded-md p-1.5 transition ${sessionSearchActive ? 'text-app-text bg-app-element' : 'text-app-subtext hover:text-app-text'}`}
					title="Search"
					aria-label="Search sessions"
					on:click={() => {
						sessionSearchActive = !sessionSearchActive;
						if (!sessionSearchActive) sessionSearchQuery = '';
					}}
				>
					<Search size={15} />
				</button>
				<button
					type="button"
					class="rounded-md p-1.5 text-app-subtext transition hover:text-app-text"
					title="Filter"
					aria-label="Filter sessions"
				>
					<SlidersHorizontal size={15} />
				</button>
				{#if onCollapseSidebar}
					<button
						type="button"
						class="rounded-md p-1.5 text-app-subtext transition hover:text-app-text"
						title="Collapse AI sidebar"
						aria-label="Collapse AI sidebar"
						on:click={onCollapseSidebar}
					>
						<PanelRight size={15} />
					</button>
				{/if}
			</div>
		</header>

		{#if sessionSearchActive}
			<div
				class={`px-4 py-2 ${
					isDesktopSidebar ? 'border-b border-app-border/40' : 'border-b border-app-border'
				}`}
			>
				<input
					type="text"
					class="w-full rounded-md border border-app-border bg-app-bg px-2.5 py-1.5 text-sm text-app-text outline-none placeholder:text-app-subtext/50 focus:border-app-primary/50"
					placeholder="Search sessions…"
					bind:value={sessionSearchQuery}
				/>
			</div>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#each displayedSessions as session (session.id)}
				<div
					class={`group relative px-4 text-left transition ${
						isDesktopSidebar ? 'hover:bg-app-element/40' : 'hover:bg-app-element/30'
					}`}
				>
					<button
						type="button"
						class={`flex w-full items-start gap-3 py-3`}
						on:click={() => openSession(session.id)}
					>
						{#if session.id === activeSessionId && isProcessing}
							<div class="mt-0.5 shrink-0">
								<LoaderCircle size={12} class="animate-spin text-app-subtext" />
							</div>
						{:else}
							<div class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"></div>
						{/if}
						<div class="min-w-0 flex-1">
							<p
								class={`truncate text-[13px] text-app-text transition ${
									isDesktopSidebar ? 'group-hover:text-app-text' : 'group-hover:text-amber-300'
								}`}
							>
								{session.title}
							</p>
							<p class="mt-0.5 text-xs text-app-subtext">
								{#if session.id === activeSessionId && isProcessing}
									{@const liveProgress = latestProgressText(processingEvents)}
									{liveProgress || 'Thinking…'}
								{:else}
									{relativeTime(session.lastMessageAt || session.updatedAt)}
								{/if}
							</p>
						</div>
					</button>
				</div>
			{/each}

			{#if !sessionSearchActive && !showAllSessions && remainingSessionCount > 0}
				<button
					type="button"
					class="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-app-element/50"
					on:click={() => (showAllSessions = true)}
				>
					<span
						class={isDesktopSidebar
							? sidebarSectionLabelClass
							: 'text-[11px] font-bold uppercase tracking-[0.24em] text-app-subtext'}
						>More</span
					>
					<span class="text-xs text-app-subtext">{sessions.length}</span>
				</button>
			{/if}

			{#if !sessions.length}
				<div class="flex h-full flex-col items-center justify-center text-center text-app-subtext">
					<BrandMark size={isDesktopSidebar ? 24 : 60} className="mb-3" alt="" />
					<p
						class={isDesktopSidebar
							? 'text-sm font-bold tracking-tight text-app-text'
							: 'font-display text-2xl tracking-[0.18em] text-app-text'}
					>
						KAINBU AI
					</p>
					<p
						class={isDesktopSidebar
							? `mt-2 ${sidebarSectionLabelClass}`
							: 'mt-2 text-[11px] uppercase tracking-[0.32em]'}
					>
						No sessions yet
					</p>
				</div>
			{/if}
		</div>
	{:else}
		{#if !hideHeader}
			<header
				class={`flex items-center gap-2 ${
					isDesktopSidebar ? 'border-b border-app-border/40' : 'border-b border-app-border'
				} ${isMobileChrome ? 'px-3 py-2' : 'px-4 py-2.5'}`}
			>
			{#if isSidebar}
				<button
					type="button"
					class="rounded-md p-1.5 text-app-subtext transition hover:text-app-text"
					on:click={backToSessionsList}
					title="Back to sessions"
					aria-label="Back to sessions"
				>
					<ChevronLeft size={16} />
				</button>
			{/if}
			<div class="relative min-w-0 flex-1">
				<button
					bind:this={sessionSwitcherTrigger}
					type="button"
					class={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-left text-app-text transition hover:border-app-border hover:bg-app-element/60 ${
						sessionSwitcherOpen ? 'border-app-border bg-app-element/60' : ''
					} ${isMobileChrome ? 'max-w-[11rem] text-[12px]' : 'max-w-[15rem] text-sm'}`}
					aria-haspopup="listbox"
					aria-expanded={sessionSwitcherOpen}
					aria-label="Switch chat"
					on:click={toggleSessionSwitcher}
				>
					<span class="min-w-0 flex-1 truncate font-medium">
						{activeSession?.title || 'New chat'}
					</span>
					<ChevronDown
						size={14}
						class={`shrink-0 text-app-subtext transition ${sessionSwitcherOpen ? 'rotate-180' : ''}`}
					/>
				</button>
			</div>

			<div class={`ml-auto flex items-center ${isMobileChrome ? 'gap-1' : 'gap-1.5'}`}>
				<button
					type="button"
					class={`rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text ${
						isMobileChrome ? 'p-1' : 'p-1.5'
					}`}
					on:click={onCreateSession}
					title="New chat"
					aria-label="New chat"
				>
					<Plus size={16} />
				</button>

				{#if isSidebar && onCollapseSidebar}
					<div class="mx-0.5 h-4 w-px bg-app-border"></div>
					<button
						type="button"
						class={`rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text ${
							isMobileChrome ? 'p-1' : 'p-1.5'
						}`}
						on:click={onCollapseSidebar}
						title="Collapse AI sidebar"
						aria-label="Collapse AI sidebar"
					>
						<PanelRight size={16} />
					</button>
				{/if}
			</div>
			</header>
		{/if}

		<div
			bind:this={historyViewport}
			use:observeHistoryViewport
			on:scroll={handleHistoryScroll}
			class={`min-h-0 flex-1 overflow-y-auto [overflow-anchor:none] ${
				isMobileChrome ? 'kainbu-chat-history--top-fade px-4 py-4' : 'px-5 py-5'
			}`}
		>
			{#if !history.length}
				<div class="flex h-full flex-col items-center justify-center text-center text-app-subtext">
					<BrandMark
						size={isDesktopSidebar ? 24 : isMobileChrome ? 52 : 60}
						className="mb-3"
						alt=""
					/>
					<p
						class={isDesktopSidebar
							? 'text-sm font-bold tracking-tight text-app-text'
							: `font-display tracking-[0.18em] text-app-text ${isMobileChrome ? 'text-xl' : 'text-2xl'}`}
					>
						KAINBU AI
					</p>
					<p
						class={isDesktopSidebar
							? `mt-2 ${sidebarSectionLabelClass}`
							: `mt-2 uppercase ${isMobileChrome ? 'text-[10px] tracking-[0.24em]' : 'text-[11px] tracking-[0.32em]'}`}
					>
						Awaiting instructions
					</p>
				</div>
			{/if}

			<div class={`${isMobileChrome ? 'space-y-8' : 'space-y-10'}`}>
				{#each history as message (message.id)}
					<div
						data-chat-message-id={message.id}
						class={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
					>
						{#if isCompactStatusMessage(message)}
							{@const compactProgress = latestProgressText(message.progressEvents || [])}
							{#if compactProgress}
								<div class="mb-1.5 px-1 text-[11px] text-app-subtext/70">
									{compactProgress}
								</div>
							{/if}
						{:else if (message.progressEvents?.length || 0) > 0 && !message.text?.trim()}
							<div class="mb-2">
								<AiActivityTrace events={message.progressEvents || []} />
							</div>
						{/if}

						{#if !isCompactStatusMessage(message)}
							{@const hasMessageText = Boolean(message.text?.trim())}
							{@const imageAttachments =
								message.attachments?.filter((attachment) => attachment.kind === 'image') ?? []}
							{@const fileAttachments =
								message.attachments?.filter((attachment) => attachment.kind !== 'image') ?? []}
							{@const imageOnlyBubble =
								message.role === 'user' &&
								imageAttachments.length > 0 &&
								!hasMessageText &&
								!fileAttachments.length &&
								!(message.taskCards?.length || 0)}
							<div
								class={message.role === 'user'
									? `kainbu-chat-user-bubble${
											imageOnlyBubble ? ' kainbu-chat-user-bubble--image-only' : ''
										}`
									: 'max-w-[min(100%,46rem)] text-app-text'}
							>
								{#if message.taskCards?.length}
									<div class="mb-3 flex gap-2 overflow-x-auto pb-1">
										{#each message.taskCards as taskCard (taskCard.id)}
											<div
												class="w-[14rem] shrink-0 rounded-lg border border-app-border bg-app-surface/85 px-3 py-2.5"
											>
												<div class="flex items-center justify-between gap-2">
													<p
														class="truncate text-xs font-semibold uppercase tracking-[0.2em] text-app-subtext"
													>
														{taskCard.columnTitle}
													</p>
													{#if taskCard.checked}
														<span
															class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200"
														>
															Done
														</span>
													{/if}
												</div>
												<p class="mt-2 text-sm font-semibold text-app-text">{taskCard.title}</p>
												{#if taskCard.description}
													<p class="mt-1 text-xs leading-relaxed text-app-subtext">
														{summarize(taskCard.description)}
													</p>
												{/if}
												{#if taskCard.tags.length}
													<div class="mt-2 flex flex-wrap gap-1.5">
														{#each taskCard.tags.slice(0, 3) as tag (tag.id)}
															<span class={getTagToneClasses(tag.color)}>
																{tag.label}
															</span>
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}

								{#if imageAttachments.length || fileAttachments.length}
									{#if imageAttachments.length}
										<div
											class={`flex flex-wrap gap-1.5 ${hasMessageText || fileAttachments.length ? 'mb-2' : ''}`}
										>
											{#each imageAttachments as attachment (attachment.id)}
												<button
													type="button"
													class="block max-w-full overflow-hidden rounded-md border border-app-border/60 transition hover:border-app-primary/40"
													on:click={() => openAttachmentPreview(attachment)}
													aria-label={`Open ${attachment.name}`}
												>
													<img
														src={attachment.content}
														alt={attachment.name}
														class="block max-h-56 max-w-full object-contain"
													/>
												</button>
											{/each}
										</div>
									{/if}

									{#if fileAttachments.length}
										<div class={`space-y-2 ${hasMessageText ? 'mb-2' : ''}`}>
											{#each fileAttachments as attachment (attachment.id)}
												<div
													class="flex items-center gap-3 rounded-lg border border-app-border bg-app-surface/85 px-3 py-2.5"
												>
													<div
														class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-app-border bg-app-element text-app-subtext"
													>
														<Paperclip size={15} />
													</div>
													<div class="min-w-0 flex-1">
														<p class="truncate text-xs font-medium text-app-text">
															{attachment.name}
														</p>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								{/if}

								{#if message.role === 'assistant'}
									<RichText
										value={sanitizeUserFacingAiReply(message.text)}
										className={`kainbu-chat-prose${isMobileChrome ? ' kainbu-chat-prose--mobile' : ''}`}
									/>
								{:else if hasMessageText}
									<p class="whitespace-pre-wrap">{message.text}</p>
								{/if}

								{#if message.question?.status === 'answered'}
									<div class="mt-2">
										<div class="mb-1.5">
											<span
												class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200"
											>
												Answered
											</span>
										</div>
										<p class="text-sm font-semibold text-app-text">{message.question.prompt}</p>
										{#if message.question.answerText || message.question.answeredOptionId}
											<p class="mt-1 text-xs text-app-subtext">
												{message.question.answerText ||
													message.question.options.find(
														(option) => option.id === message.question?.answeredOptionId
													)?.label}
											</p>
										{/if}
									</div>
								{/if}

								{#if message.role === 'assistant' && hasMessageText}
									<div class="kainbu-chat-actions">
										<button
											type="button"
											class="kainbu-chat-actions__button"
											on:click={() => void copyMessageText(message)}
											aria-label="Copy response"
											title={copiedMessageId === message.id ? 'Copied' : 'Copy response'}
										>
											<Copy size={15} strokeWidth={1.75} />
										</button>
										<button
											type="button"
											class="kainbu-chat-actions__button"
											on:click={() => void shareMessageText(message)}
											aria-label="Share response"
											title="Share response"
										>
											<Upload size={15} strokeWidth={1.75} />
										</button>
										<button
											type="button"
											class="kainbu-chat-actions__button"
											disabled={isProcessing}
											on:click={() => void regenerateFromAssistant(message)}
											aria-label="Regenerate response"
											title="Regenerate response"
										>
											<RefreshCw size={15} strokeWidth={1.75} />
										</button>
										<button
											type="button"
											class="kainbu-chat-actions__button"
											aria-label="Response details"
											title={messageActionDetails(message) || 'Response details'}
										>
											<Ellipsis size={15} strokeWidth={1.75} />
										</button>
									</div>
								{/if}

								{#if uniqueCitations(message).length}
									<div class="mt-3 flex flex-wrap gap-2">
										{#each uniqueCitations(message) as citation}
											<a
												href={citation.url}
												target="_blank"
												rel="noreferrer"
												class="rounded-full border border-app-accent/25 bg-app-accent/10 px-3 py-1 text-[11px] font-semibold text-app-accent transition hover:bg-app-accent/20"
											>
												{citation.title || citation.url}
											</a>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				{#if showQuestionCarousel && activeOpenQuestion}
					<div class="rounded-lg border border-app-primary/25 bg-app-primary/10 p-3">
						<div class="flex items-center justify-between gap-2">
							<p class="text-[10px] font-bold uppercase tracking-[0.18em] text-app-primary">
								Question {activeOpenQuestionIndex + 1} of {openQuestions.length}
							</p>
							<div class="flex items-center gap-1">
								<button
									type="button"
									class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-border bg-app-surface text-app-subtext transition hover:text-app-text disabled:cursor-not-allowed disabled:opacity-40"
									disabled={activeOpenQuestionIndex <= 0 || isProcessing}
									aria-label="Previous question"
									on:click={showPreviousOpenQuestion}
								>
									<ChevronLeft size={14} />
								</button>
								<button
									type="button"
									class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-border bg-app-surface text-app-subtext transition hover:text-app-text disabled:cursor-not-allowed disabled:opacity-40"
									disabled={activeOpenQuestionIndex >= openQuestions.length - 1 || isProcessing}
									aria-label="Next question"
									on:click={showNextOpenQuestion}
								>
									<ChevronRight size={14} />
								</button>
							</div>
						</div>
						<p class="mt-2 text-sm font-semibold text-app-text">{activeOpenQuestion.prompt}</p>
						{#if activeOpenQuestion.reason}
							<p class="mt-0.5 text-xs leading-relaxed text-app-subtext">
								{activeOpenQuestion.reason}
							</p>
						{/if}
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each activeOpenQuestion.options as option (option.id)}
								{@const isStaged = stagedOptionByQuestion[activeOpenQuestion.id] === option.id}
								<button
									type="button"
									disabled={isProcessing}
									aria-pressed={isStaged}
									class={[
										'rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45',
										isStaged
											? 'border-app-primary bg-app-primary/15 text-app-primary'
											: 'border-app-border bg-app-element text-app-text hover:border-app-primary/35 hover:text-app-primary'
									].join(' ')}
									on:click={() => toggleStagedOption(activeOpenQuestion.id, option.id)}
								>
									<span>{option.label}</span>
									{#if option.description}
										<span class="mt-0.5 block text-[10px] font-normal text-app-subtext">
											{option.description}
										</span>
									{/if}
								</button>
							{/each}
						</div>
						{#if activeOpenQuestion.allowFreeform}
							<textarea
								rows={2}
								disabled={isProcessing}
								class="mt-2 min-h-14 w-full resize-none rounded-lg border border-app-border bg-app-bg px-2.5 py-1.5 text-xs text-app-text outline-none placeholder:text-app-subtext/50 disabled:cursor-not-allowed disabled:opacity-60"
								placeholder="Add your own answer…"
								value={questionDrafts[activeOpenQuestion.id] || ''}
								on:input={(event) =>
									setQuestionDraft(
										activeOpenQuestion.id,
										(event.currentTarget as HTMLTextAreaElement).value
									)}
							></textarea>
						{/if}
						<div class="mt-3 flex items-center justify-between gap-2">
							<p class="text-[10px] font-medium text-app-subtext">
								{stagedQuestionCount} of {openQuestions.length} answered
							</p>
							<button
								type="button"
								disabled={isProcessing || !allQuestionsStaged}
								class="kainbu-btn kainbu-btn--primary kainbu-btn--compact disabled:cursor-not-allowed disabled:opacity-45"
								on:click={submitStagedAnswers}
							>
								{openQuestions.length > 1 ? 'Submit answers' : 'Submit'}
							</button>
						</div>
					</div>
				{/if}

				{#if isProcessing}
					{@const streamingDraft = processingEvents
						.filter((event) => event.kind === 'assistant_draft')
						.at(-1)
						?.message?.trim()}
					{@const traceCompact = Boolean(streamingDraft)}
					<div class="flex flex-col items-start gap-3" data-chat-processing>
						<div class="flex items-start gap-2 px-0.5">
							<div
								class="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-app-primary/15 shadow-[0_0_18px_color-mix(in_oklab,var(--color-app-primary)_55%,transparent)]"
								aria-hidden="true"
							>
								<span
									class="ai-stream-orb h-2.5 w-2.5 rounded-full bg-app-primary"
									class:ai-stream-orb--steady={isStreamingText}
								></span>
							</div>
							<div class="min-w-0 flex-1 pt-0.5">
								<AiActivityTrace
									events={processingEvents}
									isLive
									compact={traceCompact}
									defaultExpanded={!traceCompact}
									showSpinner={false}
								/>
							</div>
						</div>
						{#if streamingDraft}
							<div class="max-w-[min(100%,46rem)] w-full">
								<RichText
									value={sanitizeUserFacingAiReply(streamingDraft)}
									className={`kainbu-chat-prose${isMobileChrome ? ' kainbu-chat-prose--mobile' : ''}`}
								/>
							</div>
						{/if}
					</div>
				{/if}

				{#each pendingProposals as pendingProposal (pendingProposal.id)}
					<div class="rounded-lg border border-app-primary/25 bg-app-primary/10 p-3.5">
						<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-app-subtext">
							Sync proposal
						</p>
						<h3 class="mt-2 text-base font-semibold leading-snug text-app-text">
							{pendingProposal.summary || 'Review AI changes'}
						</h3>
						<p class="mt-2 text-sm text-app-subtext">
							{proposalStatusText(pendingProposal)}
						</p>
						<div
							class="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.22em]"
						>
							<span
								class="rounded-full border border-app-border bg-app-element/70 px-3 py-1 text-app-subtext"
							>
								{pendingProposal.target}
							</span>
							{#if activeProposalTarget === pendingProposal.target}
								<span
									class="rounded-full border border-app-accent/25 bg-app-accent/10 px-3 py-1 text-app-accent"
								>
									Preview Open
								</span>
							{/if}
							{#if pendingProposal.proposalSafety.outOfScope}
								<span
									class="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200"
								>
									Review Carefully
								</span>
							{/if}
						</div>
						{#if proposalApplyErrors[pendingProposal.id]}
							<p class="mt-2 text-sm text-rose-300">{proposalApplyErrors[pendingProposal.id]}</p>
						{/if}
						<div class="mt-3 flex flex-wrap gap-2.5">
							{#if onReviewProposal}
								<button
									type="button"
									class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-app-border bg-app-element px-4 py-2 text-sm font-semibold text-app-text"
									on:click={() => onReviewProposal && onReviewProposal(pendingProposal.target)}
								>
									<Info size={16} />
									Review
								</button>
							{/if}
							<button
								type="button"
								disabled={applyingProposalId === pendingProposal.id}
								class="kainbu-btn kainbu-btn--primary inline-flex flex-1 disabled:cursor-not-allowed disabled:opacity-60"
								on:click={() => onAcceptProposal(pendingProposal.id)}
							>
								<Check size={16} />
								{applyingProposalId === pendingProposal.id ? 'Applying…' : 'Apply'}
							</button>
							<button
								type="button"
								class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-app-border bg-app-element px-4 py-2 text-sm font-semibold text-app-text"
								on:click={() => onRejectProposal(pendingProposal.id)}
							>
								<XCircle size={16} />
								Discard
							</button>
						</div>
					</div>
				{/each}

				{#if pinnedSpacerHeight > 0}
					<div aria-hidden="true" style:height={`${pinnedSpacerHeight}px`}></div>
				{/if}
			</div>
		</div>
	{/if}

	<div
		class={`${
			isDesktopSidebar
				? 'border-t border-app-border/40'
				: isMobileChrome
					? 'border-t border-app-border bg-app-surface/96'
					: 'border-t border-app-border'
		} px-0 py-0`}
	>
		<form
			class={isMobileChrome ? 'space-y-2' : 'space-y-0'}
			on:submit|preventDefault={submitComposer}
		>
			{#if queuedTaskCards.length}
				<div
					class={`${isMobileChrome ? 'flex gap-2 overflow-x-auto px-3 pt-2 pb-1' : 'mb-3 flex gap-2 overflow-x-auto pb-1'}`}
				>
					{#each queuedTaskCards as taskCard (taskCard.id)}
						<div
							class={`relative shrink-0 rounded-lg border border-app-border bg-app-surface/90 ${
								isMobileChrome ? 'w-[12.5rem] px-2.5 py-2' : 'w-[13.5rem] px-3 py-2.5'
							}`}
						>
							<div class="flex items-center justify-between gap-2">
								<p
									class="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext"
								>
									{taskCard.columnTitle}
								</p>
								<button
									type="button"
									class="rounded-full bg-app-element p-1 text-app-subtext transition hover:text-rose-300"
									on:click={() => onRemoveTaskCard(taskCard.id)}
								>
									<X size={11} />
								</button>
							</div>
							<p class="mt-2 text-sm font-semibold text-app-text">{taskCard.title}</p>
							{#if taskCard.description}
								<p class="mt-1 text-xs leading-relaxed text-app-subtext">
									{summarize(taskCard.description, 84)}
								</p>
							{/if}
							{#if taskCard.tags.length}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each taskCard.tags.slice(0, 3) as tag (tag.id)}
										<span class={getTagToneClasses(tag.color)}>
											{tag.label}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if queuedAttachments.length}
				<div
					class={`space-y-2 px-3${queuedTaskCards.length ? '' : ' pt-2'}${isMobileChrome ? '' : ' mb-3'}`}
				>
					{#each queuedAttachments as attachment (attachment.id)}
						<div
							class="relative flex items-center gap-2.5 rounded-lg border border-app-border bg-app-surface/90 py-2 pl-2.5 pr-10"
						>
							{#if attachment.kind === 'image'}
								<button
									type="button"
									class="shrink-0 overflow-hidden rounded-md border border-app-border/60 transition hover:border-app-primary/40"
									on:click={() => openAttachmentPreview(attachment)}
									aria-label={`Open ${attachment.name}`}
								>
									<img
										src={attachment.content}
										alt={attachment.name}
										class="h-14 w-14 object-cover"
									/>
								</button>
							{:else}
								<div
									class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-app-border bg-app-element text-app-subtext"
								>
									<Paperclip size={16} />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm text-app-text">{attachment.name}</p>
								{#if attachment.kind !== 'image'}
									<p class="mt-0.5 truncate text-xs text-app-subtext">
										{attachmentExcerpt(attachment, isMobileChrome ? 56 : 92)}
									</p>
								{/if}
							</div>
							<button
								type="button"
								class="absolute right-2 top-2 z-10 rounded-full bg-rose-500 p-1 text-white shadow-lg"
								on:click={() => onRemoveAttachment(attachment.id)}
							>
								<X size={12} />
							</button>
						</div>
					{/each}
				</div>
			{/if}

			{#if isMobileChrome}
				<div
					class={`px-3 pb-2${queuedAttachments.length || queuedTaskCards.length ? '' : ' pt-2'}`}
				>
					<div
						class="flex items-end gap-0.5 rounded-xl border border-app-border bg-app-element/35 px-1 py-0.5 transition focus-within:border-app-primary/35"
					>
						<label
							class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-subtext transition hover:bg-app-element hover:text-app-text focus-within:bg-app-element focus-within:text-app-text"
							title="Add attachment"
							aria-label="Add attachment"
						>
							<Paperclip size={16} />
							<input
								bind:this={fileInput}
								type="file"
								multiple
								aria-label="Add attachment"
								class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
								accept="image/*,text/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html"
								on:change={(event) => handleFiles((event.currentTarget as HTMLInputElement).files)}
							/>
						</label>

						<textarea
							use:autosizeComposer={draft}
							rows={1}
							class="min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] leading-5 text-app-text outline-none transition-[height] duration-200 ease-out placeholder:text-app-subtext/50"
							placeholder={isProcessing ? 'Keep typing…' : 'Message'}
							enterkeyhint="enter"
							bind:value={draft}
							on:input={() => onDraftChange(draft)}
							on:change={() => onDraftChange(draft)}
							on:paste={handleComposerPaste}
						></textarea>

						<button
							bind:this={settingsMenuTrigger}
							type="button"
							class={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-subtext transition hover:bg-app-element hover:text-app-text ${
								composerMenu === 'settings'
									? 'bg-app-element text-app-text'
									: ''
							}`}
							aria-haspopup="listbox"
							aria-expanded={composerMenu === 'settings'}
							aria-label={`AI settings: ${mobileAiSettingsLabel}`}
							title={mobileAiSettingsLabel}
							on:click={() => toggleComposerMenu('settings')}
						>
							<SlidersHorizontal size={16} />
						</button>

						<button
							type="submit"
							disabled={!canSend}
							class={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
								canSend
									? 'text-app-primary hover:bg-app-element'
									: 'cursor-not-allowed text-app-subtext opacity-50'
							}`}
							title="Send message"
							aria-label="Send message"
						>
							{#if isProcessing}
								<LoaderCircle size={16} class="animate-spin" />
							{:else}
								<Send size={16} />
							{/if}
						</button>
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					<textarea
						use:autosizeComposer={draft}
						rows={1}
						class="min-h-0 w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.55] text-app-text outline-none transition-[height] duration-200 ease-out placeholder:text-app-subtext/50"
						placeholder={isProcessing
							? 'Keep typing while the current reply finishes…'
							: 'Describe a task or problem to research'}
						enterkeyhint="send"
						bind:value={draft}
						on:input={() => onDraftChange(draft)}
						on:change={() => onDraftChange(draft)}
						on:keydown={(event) => {
							if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
							event.preventDefault();
							submitComposer();
						}}
						on:paste={handleComposerPaste}
					></textarea>

					<div class="flex items-center justify-between px-3">
						<div class="flex items-center gap-1.5">
							<label
								class="relative rounded-md p-1.5 text-app-subtext transition hover:bg-app-element hover:text-app-text focus-within:bg-app-element focus-within:text-app-text"
								title="Add attachment"
								aria-label="Add attachment"
							>
								<Paperclip size={16} />
								<input
									bind:this={fileInput}
									type="file"
									multiple
									aria-label="Add attachment"
									class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
									accept="image/*,text/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html"
									on:change={(event) =>
										handleFiles((event.currentTarget as HTMLInputElement).files)}
								/>
							</label>

							<button
								bind:this={modelMenuTrigger}
								type="button"
								class={`inline-flex max-w-[9.5rem] items-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-xs text-app-subtext transition hover:border-app-border hover:bg-app-element hover:text-app-text ${
									composerMenu === 'model' ? 'border-app-border bg-app-element text-app-text' : ''
								}`}
								aria-haspopup="listbox"
								aria-expanded={composerMenu === 'model'}
								aria-label="Choose model"
								on:click={() => toggleComposerMenu('model')}
							>
								<span class="min-w-0 truncate">{activeModel?.id || modelId || 'Model'}</span>
								<ChevronDown
									size={12}
									class={`shrink-0 transition ${composerMenu === 'model' ? 'rotate-180' : ''}`}
								/>
							</button>

							{#if showThinkingSelect}
								<button
									bind:this={thinkingMenuTrigger}
									type="button"
									class={`inline-flex max-w-[8.5rem] items-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-xs text-app-subtext transition hover:border-app-border hover:bg-app-element hover:text-app-text ${
										composerMenu === 'thinking'
											? 'border-app-border bg-app-element text-app-text'
											: ''
									}`}
									aria-haspopup="listbox"
									aria-expanded={composerMenu === 'thinking'}
									aria-label="Choose thinking level"
									on:click={() => toggleComposerMenu('thinking')}
								>
									<span class="min-w-0 truncate">{thinkingLevelLabel(thinkingLevel)}</span>
									<ChevronDown
										size={12}
										class={`shrink-0 transition ${composerMenu === 'thinking' ? 'rotate-180' : ''}`}
									/>
								</button>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-1.5 pb-1">
							<button
								type="submit"
								disabled={!canSend}
								class={`inline-flex items-center justify-center rounded-md p-1.5 text-app-subtext transition ${
									canSend
										? 'hover:text-app-text hover:bg-app-element'
										: 'cursor-not-allowed opacity-50'
								}`}
								title="Send message"
								aria-label="Send message"
							>
								{#if isProcessing}
									<LoaderCircle size={16} class="animate-spin" />
								{:else}
									<Send size={16} />
								{/if}
							</button>
						</div>
					</div>
				</div>
			{/if}
		</form>
	</div>
</section>

{#if composerMenu && composerMenuPosition}
	<div use:portal class="pointer-events-none fixed inset-0 z-[160]">
		<button
			type="button"
			class="pointer-events-auto absolute inset-0 cursor-default bg-transparent"
			aria-label="Close composer menu"
			on:click={closeComposerMenu}
		></button>
		<div
			role="listbox"
			aria-label={composerMenu === 'model'
				? 'AI models'
				: composerMenu === 'thinking'
					? 'Thinking level'
					: 'AI settings'}
			class="pointer-events-auto fixed overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-kainbu-xl"
			style={`${
				composerMenuPosition.top != null ? `top:${composerMenuPosition.top}px;` : ''
			}${
				composerMenuPosition.bottom != null ? `bottom:${composerMenuPosition.bottom}px;` : ''
			} left:${composerMenuPosition.left}px; width:${composerMenuPosition.width}px;`}
			on:mousedown|stopPropagation
		>
			<div
				class={`overflow-y-auto p-1.5 ${
					composerMenu === 'settings'
						? 'max-h-[min(20rem,calc(100vh-6rem))]'
						: 'max-h-[min(16rem,calc(100vh-8rem))]'
				}`}
			>
				{#if composerMenu === 'settings'}
					<p class="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-subtext/80">
						Model
					</p>
					{#each modelOptions as option (option.id)}
						<button
							type="button"
							role="option"
							aria-selected={option.id === modelId}
							class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
								option.id === modelId
									? 'bg-app-element text-app-text'
									: 'text-app-text hover:bg-app-element/70'
							}`}
							on:click={() => selectComposerModel(option.id)}
						>
							<span class="min-w-0 flex-1 truncate">{option.id}</span>
							{#if option.id === modelId}
								<Check size={14} class="shrink-0 text-app-primary" />
							{/if}
						</button>
					{/each}
					{#if showThinkingSelect}
						<p class="mt-1 border-t border-app-border/60 px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-subtext/80">
							Thinking
						</p>
						{#each thinkingChoices as level (level)}
							<button
								type="button"
								role="option"
								aria-selected={level === thinkingLevel}
								class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
									level === thinkingLevel
										? 'bg-app-element text-app-text'
										: 'text-app-text hover:bg-app-element/70'
								}`}
								on:click={() => selectComposerThinkingLevel(level)}
							>
								<span class="min-w-0 flex-1 truncate">{thinkingLevelLabel(level)}</span>
								{#if level === thinkingLevel}
									<Check size={14} class="shrink-0 text-app-primary" />
								{/if}
							</button>
						{/each}
					{/if}
				{:else if composerMenu === 'model'}
					{#each modelOptions as option (option.id)}
						<button
							type="button"
							role="option"
							aria-selected={option.id === modelId}
							class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
								option.id === modelId
									? 'bg-app-element text-app-text'
									: 'text-app-text hover:bg-app-element/70'
							}`}
							on:click={() => selectComposerModel(option.id)}
						>
							<span class="min-w-0 flex-1 truncate">{option.id}</span>
							{#if option.id === modelId}
								<Check size={14} class="shrink-0 text-app-primary" />
							{/if}
						</button>
					{/each}
				{:else}
					{#each thinkingChoices as level (level)}
						<button
							type="button"
							role="option"
							aria-selected={level === thinkingLevel}
							class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
								level === thinkingLevel
									? 'bg-app-element text-app-text'
									: 'text-app-text hover:bg-app-element/70'
							}`}
							on:click={() => selectComposerThinkingLevel(level)}
						>
							<span class="min-w-0 flex-1 truncate">{thinkingLevelLabel(level)}</span>
							{#if level === thinkingLevel}
								<Check size={14} class="shrink-0 text-app-primary" />
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if sessionSwitcherOpen && switcherPosition}
	<div use:portal class="pointer-events-none fixed inset-0 z-[160]">
		<button
			type="button"
			class="pointer-events-auto absolute inset-0 cursor-default bg-transparent"
			aria-label="Close chat switcher"
			on:click={closeSessionSwitcher}
		></button>
		<div
			role="listbox"
			aria-label="Chat sessions"
			class="pointer-events-auto fixed overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-kainbu-xl"
			style={`top:${switcherPosition.top}px; left:${switcherPosition.left}px; width:${switcherPosition.width}px;`}
			on:mousedown|stopPropagation
		>
			<div class="border-b border-app-border px-3 py-2.5">
				<label class="flex items-center gap-2 rounded-lg bg-app-bg/80 px-2.5 py-2">
					<Search size={14} class="shrink-0 text-app-subtext" />
					<input
						bind:this={switcherSearchInput}
						bind:value={switcherSearchQuery}
						type="search"
						placeholder="Search chats…"
						class="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-app-subtext/60"
					/>
				</label>
			</div>

			<div class="max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto p-1.5">
				{#if !switcherFilteredSessions.length}
					<p class="px-3 py-4 text-sm text-app-subtext">No chats match.</p>
				{:else}
					{#each switcherGroupedSessions as group (group.label)}
						<div class="px-2 pb-1 pt-2">
							<p class="px-2 pb-1.5 text-[11px] font-medium text-app-subtext">{group.label}</p>
							<div class="space-y-0.5">
								{#each group.sessions as session (session.id)}
									<div
										class={`group flex items-center gap-1 rounded-lg transition ${
											session.id === activeSessionId ? 'bg-app-element' : 'hover:bg-app-element/70'
										}`}
										role="presentation"
										on:mouseenter={() => (hoveredSwitcherSessionId = session.id)}
										on:mouseleave={() => {
											if (hoveredSwitcherSessionId === session.id) {
												hoveredSwitcherSessionId = '';
											}
										}}
									>
										<button
											type="button"
											role="option"
											aria-selected={session.id === activeSessionId}
											class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-app-text"
											on:click={() => selectSwitcherSession(session.id)}
										>
											<span class="shrink-0 text-app-subtext">
												{#if session.id === activeSessionId && isProcessing}
													<LoaderCircle size={15} class="animate-spin" />
												{:else if session.id === activeSessionId}
													<CheckCircle2 size={15} class="text-app-text" />
												{:else}
													<Circle size={15} />
												{/if}
											</span>
											<span class="min-w-0 flex-1 truncate text-[13px]">{session.title}</span>
										</button>
										{#if hoveredSwitcherSessionId === session.id}
											<span class="flex shrink-0 items-center gap-0.5 pr-1.5">
												<button
													type="button"
													class="rounded-md p-1 text-app-subtext transition hover:bg-app-bg hover:text-app-text"
													title="Rename chat"
													aria-label="Rename chat"
													on:click={() => requestSessionRenameById(session)}
												>
													<Pencil size={13} />
												</button>
												<button
													type="button"
													class="rounded-md p-1 text-app-subtext transition hover:bg-app-bg hover:text-rose-300"
													title="Delete chat"
													aria-label="Delete chat"
													on:click={() => requestSessionDeleteById(session)}
												>
													<Trash2 size={13} />
												</button>
											</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if previewAttachment}
	<div class="fixed inset-0 z-[90] flex bg-black/88">
		<button
			type="button"
			class="absolute inset-0"
			aria-label="Close image preview"
			on:click={closeAttachmentPreview}
		></button>

		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Image preview: ${previewAttachment.name}`}
			class="relative z-10 h-full w-full"
		>
			<div
				class={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-end gap-1 ${
					isMobileChrome
						? 'p-3 pt-[max(0.75rem,var(--safe-top))]'
						: 'p-4'
				}`}
			>
				<button
					type="button"
					class="pointer-events-auto rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
					on:click={openPreviewInNewTab}
					aria-label="Open image in full screen"
					title="Open full screen"
				>
					<ExternalLink size={16} />
				</button>
				<button
					type="button"
					class="pointer-events-auto rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
					on:click={closeAttachmentPreview}
					aria-label="Close image preview"
					title="Close"
				>
					<X size={18} />
				</button>
			</div>

			<div
				bind:this={previewViewport}
				role="button"
				tabindex="0"
				aria-label={`Zoom image preview for ${previewAttachment.name}`}
				class="flex h-full w-full items-center justify-center overflow-hidden"
				style="touch-action: none;"
				on:pointerdown={handlePreviewPointerDown}
				on:pointermove={handlePreviewPointerMove}
				on:pointerup={handlePreviewPointerEnd}
				on:pointercancel={handlePreviewPointerEnd}
				on:pointerleave={handlePreviewPointerEnd}
				on:wheel={handlePreviewWheel}
				on:dblclick={togglePreviewZoom}
				on:keydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						togglePreviewZoom();
					}
				}}
			>
				<img
					src={previewAttachment.content}
					alt={previewAttachment.name}
					draggable="false"
					class={`max-h-full max-w-full object-contain transition-transform duration-150 ease-out ${
						previewScale > PREVIEW_MIN_SCALE
							? previewIsDragging
								? 'cursor-grabbing'
								: 'cursor-grab'
							: 'cursor-zoom-in'
					}`}
					style={`transform: translate3d(${previewOffsetX}px, ${previewOffsetY}px, 0) scale(${previewScale}); transform-origin: center center;`}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	.ai-stream-orb {
		animation: ai-stream-orb 1.25s ease-in-out infinite;
		box-shadow:
			0 0 10px color-mix(in oklab, var(--color-app-primary) 80%, transparent),
			0 0 22px color-mix(in oklab, var(--color-app-primary) 45%, transparent);
	}

	@keyframes ai-stream-orb {
		0%,
		100% {
			opacity: 0.72;
			transform: scale(0.82);
		}
		50% {
			opacity: 1;
			transform: scale(1.18);
		}
	}

	/* While text is streaming, hold the orb steady so the pulse signals "waiting". */
	.ai-stream-orb--steady {
		animation: none;
		opacity: 1;
		transform: scale(1);
	}

	@media (prefers-reduced-motion: reduce) {
		.ai-stream-orb {
			animation: none;
		}
	}
</style>
