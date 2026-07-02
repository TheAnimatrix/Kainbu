<script lang="ts">
	import { browser } from '$app/environment';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { tick } from 'svelte';
	import {
		Check,
		ArrowDownToLine,
		ArrowLeft,
		ArrowRight,
		ArrowUpToLine,
		CheckSquare,
		ChevronDown,
		ClipboardCopy,
		Clock3,
		Copy,
		Ellipsis,
		FileText,
		Info,
		Link2,
		LoaderCircle,
		MessageSquarePlus,
		Network,
		Palette,
		Pencil,
		Plus,
		RectangleHorizontal,
		Repeat2,
		RotateCcw,
		Search,
		Settings2,
		Sparkles,
		Square,
		Tag as TagIcon,
		Trash2,
		Unlink,
		UserPlus,
		X
	} from '$lib/icons';
	import {
		dragHandle,
		dragHandleZone,
		dndzone,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		TRIGGERS,
		type DndEvent
	} from 'svelte-dnd-action';
	import {
		clampColumnWidth,
		DEFAULT_COLUMN_WIDTH,
		MAX_COLUMN_WIDTH,
		MIN_COLUMN_WIDTH,
		SURFACE_TONE_OPTIONS,
		TAG_COLORS,
		TAG_COLORS as TAG_COLOR_PRESETS
	} from '$lib/kainbu/constants';
	import { filterColumnsForBoardSearch, normalizeBoardSearchQuery } from '$lib/kainbu/boardSearch';
	import { rewriteTaskTitle } from '$lib/kainbu/ai';
	import {
		areKanbanTasksEqualForDiff,
		computeKanbanDiff,
		diffWords,
		formatDiffTaskSnapshot,
		type DiffColumn,
		type DiffTask
	} from '$lib/kainbu/diff';
	import { createId } from '$lib/kainbu/id';
	import {
		getMemberAvatarInitials,
		getMemberAvatarUrl as resolveMemberAvatarUrl,
		getProjectMemberDisplayName
	} from '$lib/kainbu/members';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import {
		hasLeadingCardCheckboxLine,
		stripLeadingCardCheckboxLine,
		syncLeadingCardCheckboxLine,
		toggleMarkdownCheckbox
	} from '$lib/kainbu/taskMarkdown';
	import { getBoardPresenceViewers } from '$lib/kainbu/boardPresence';
	import { formatTimingLabel, getTaskDueAt } from '$lib/kainbu/timing';
	import BoardOptionsSheet from '$lib/components/BoardOptionsSheet.svelte';
	import BoardViewersPill from '$lib/components/BoardViewersPill.svelte';
	import { resolveCheckedMoveTargetColumnId } from '$lib/kainbu/boardPreferences';
	import ShareBoardModal from '$lib/components/ShareBoardModal.svelte';
	import {
		addBidirectionalLink,
		buildLinkGroupLayout,
		buildTaskLinkGraph,
		createLinkedTask,
		getComponentEdges,
		getConnectedComponent,
		countUniqueTaskLinks,
		getDescriptionReferencedPlacements,
		getExplicitLinkedTasks,
		normalizeLinkedTaskIds,
		parseTaskReferenceIds,
		purgeTaskLinks,
		removeBidirectionalLink,
		removeTaskReferenceFromMarkdown
	} from '$lib/kainbu/taskLinks';
	import TaskLinkOverlay from '$lib/components/TaskLinkOverlay.svelte';
	import TaskLinkPicker from '$lib/components/TaskLinkPicker.svelte';
	import type { TaskLinkPickerOption } from '$lib/kainbu/taskLinkPicker';
	import {
		getCardToneStyle,
		getColumnToneStyle,
		getTagToneClasses,
		getToneSurfaceClass
	} from '$lib/kainbu/tags';
	import type {
		BoardPreferences,
		ChatAttachment,
		Column,
		KanbanData,
		ProjectMembership,
		Tag,
		Task
	} from '$lib/kainbu/types';
	import TaskModal from '$lib/components/TaskModal.svelte';
	import RichText from '$lib/components/RichText.svelte';

	type MenuPosition = {
		top: number;
		left: number;
	};

	type ColumnMenuState = {
		columnId: string;
		position: MenuPosition;
	};

	type TaskMenuState = {
		colId: string;
		taskId: string;
		position: MenuPosition;
		opensAbove?: boolean;
	};

	type DesktopTaskEditorLayoutMode = 'modal' | 'dock' | 'fullscreen';
	type BoardChangeOptions = {
		recordHistory?: boolean;
		syncDelay?: number;
	};

	type BoardLayoutMode = 'columns' | 'link-groups';

	type DisplayColumn = Column & {
		isLinkGroup?: boolean;
		linkGroupSubtitle?: string;
		taskColumnTitles?: Record<string, string>;
	};

	type TaskLinkPickerState = {
		sourceColId: string;
		sourceTaskId: string;
		position: MenuPosition;
	};

	type LastColumnMove = {
		fromColumnId: string;
		toColumnId: string;
	};

	export let data: KanbanData;
	export let projectId = '';
	export let comparisonData: KanbanData | undefined = undefined;
	export let highlightedTaskIds: string[] = [];
	export let activeTaskId: string | undefined = undefined;
	export let isLocked = false;
	export let boardPreferences: BoardPreferences;
	export let colorMode: import('$lib/kainbu/types').ColorMode = 'dark';
	export let active = true;
	export let members: ProjectMembership[] = [];
	export let activeBoardId = '';
	export let currentUserId = '';
	export let currentUserAvatarUrl: string | null = null;
	export let boardName = '';
	export let shareSlug: string | null = null;
	export let sharePublic = false;
	export let isOwner = false;
	export let showShareButton = true;
	export let showCollaborationChrome = true;
	export let shareSaving = false;
	export let shareErrorMessage = '';
	export let onShareSettingsChange: (payload: {
		sharePublic?: boolean;
	}) => void | Promise<void> = () => {};
	export let onChange: (nextData: KanbanData, options?: BoardChangeOptions) => void;
	export let onSendToChat: (payload: { task: Task; column: Column }) => void;
	export let onActiveTaskChange: (
		payload: { taskId?: string; columnId?: string } | null
	) => void = () => {};
	export let onTaskReferenceNavigate: (payload: {
		taskId: string;
		columnId: string;
	}) => void = () => {};
	export let onAddAttachments: (attachments: ChatAttachment[]) => void = () => {};
	export let onDockedEditorChange: (isDocked: boolean) => void = () => {};
	export let onBoardPreferencesChange: (
		boardId: string,
		nextPreferences: BoardPreferences
	) => void = () => {};
	export let boardSearchActive = false;
	export let boardSearchQuery = '';

	const flipDurationMs = 180;
	const boardToolbarPillClass =
		'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition';
	const boardToolbarPillActiveClass = 'text-app-primary';
	const boardToolbarPillIdleClass = 'text-app-subtext hover:text-app-text';
	const dndDropTargetStyle = {};
	const kanbanOrderFingerprint = (columns: KanbanData) =>
		columns
			.map((column) => {
				const taskIds = column.tasks
					.filter(
						(task) =>
							!(task as Task & Record<string, unknown>)[SHADOW_ITEM_MARKER_PROPERTY_NAME]
					)
					.map((task) => task.id);
				return `${column.id}:${taskIds.join(',')}`;
			})
			.join('|');
	let viewportWidth = 0;
	let boardData: KanbanData = data;
	let lastEmittedOrderFingerprint = '';

	let editingColumnId: string | null = null;
	let editingColumnTitle = '';
	let openColumnMenu: ColumnMenuState | null = null;
	let shareModalOpen = false;
	let openTaskMenu: TaskMenuState | null = null;
	let rewritingTaskId: string | null = null;
	let rewriteTaskError = '';
	let columnTonePickerOpen = false;
	let editingTask: { column: Column; task: Task } | null = null;
	let editingTaskTitle: { columnId: string; taskId: string } | null = null;
	let editingTaskTitleValue = '';
	let taskTitleInput: HTMLTextAreaElement | null = null;
	let lastTaskTitleTap: { columnId: string; taskId: string; at: number } | null = null;
	let suppressTaskOpenUntil = 0;
	let assignMenuOpen: TaskMenuState | null = null;
	let taskTagMenuOpen: TaskMenuState | null = null;
	let taskTagMenuMode: 'list' | 'create' = 'list';
	let taskTagMenuSearchOpen = false;
	let taskTagMenuSearchQuery = '';
	let taskTagMenuNewLabel = '';
	let taskTagMenuNewColor: string = TAG_COLORS[0]?.value ?? '';
	let taskTagMenuSearchInput: HTMLInputElement | null = null;
	let taskTagMenuCreateInput: HTMLInputElement | null = null;
	let taskInfoMenuOpen: TaskMenuState | null = null;
	let taskMenuPanel: HTMLDivElement | null = null;
	let taskMenuTrigger: HTMLElement | null = null;
	let boardScrollViewport: HTMLDivElement | null = null;
	let taskDragInProgress = false;
	let boardDataAtDragStart: KanbanData | null = null;
	let expandedDiffTaskId: string | null = null;
	let boardLayoutMode: BoardLayoutMode = 'columns';
	let linkViewAnchorId: string | null = null;
	let boardSearchInput: HTMLInputElement | null = null;
	let taskLinkPicker: TaskLinkPickerState | null = null;
	let linkOverlayRedrawToken = 0;
	let lastReportedActiveTaskSignature = '';
	let lastReportedPaneEditorState = false;
	let lastScrolledHighlightedTaskId = '';
	let lastColumnMove: LastColumnMove | null = null;
	let lastColumnMoveProjectId = '';
	let boardOptionsOpen = false;
	let menuSuppressScrollCloseUntil = 0;
	const MENU_GAP = 8;
	const MENU_SCROLL_CLOSE_GRACE_MS = 400;
	const MENU_GUTTER = 12;
	const COLUMN_MENU_WIDTH = 288;
	const COLUMN_MENU_HEIGHT = 520;
	const TASK_MENU_WIDTH = 224;
	const TASK_MENU_HEIGHT = 500;
	const LINK_PICKER_WIDTH = 288;
	const LINK_PICKER_HEIGHT = 360;
	const TAG_MENU_WIDTH = 208;
	const TAG_MENU_HEIGHT = 248;
	const TAG_MENU_ROW_HEIGHT = 26;
	const TAG_MENU_VISIBLE_ROWS = 7;
	const TAG_MENU_LIST_MAX_HEIGHT = TAG_MENU_ROW_HEIGHT * TAG_MENU_VISIBLE_ROWS;
	const TASK_INFO_MENU_WIDTH = 232;
	const TASK_INFO_MENU_HEIGHT = 148;
	const TASK_INFO_MENU_HEIGHT_CHECKABLE = 188;
	const ASSIGN_MENU_WIDTH = 168;
	const ASSIGN_MENU_ROW_HEIGHT = 34;
	const ASSIGN_MENU_UNASSIGN_HEIGHT = 38;
	const ASSIGN_MENU_PADDING = 12;
	const ASSIGN_MENU_MAX_HEIGHT = 280;

	const getAssignMenuHeight = (memberCount: number, hasAssignee: boolean) =>
		Math.min(
			ASSIGN_MENU_MAX_HEIGHT,
			memberCount * ASSIGN_MENU_ROW_HEIGHT +
				(hasAssignee ? ASSIGN_MENU_UNASSIGN_HEIGHT : 0) +
				ASSIGN_MENU_PADDING
		);
	const TITLE_DOUBLE_TAP_MS = 320;
	const TASK_EDITOR_LAYOUT_STORAGE_KEY = 'kainbu:task-modal-layout-mode';
	const TASK_EDITOR_DOCK_WIDTH_STORAGE_KEY = 'kainbu:task-editor-dock-width-rem';
	const TASK_EDITOR_DOCK_DEFAULT_WIDTH = 44;
	const TASK_EDITOR_DOCK_MIN_WIDTH = 26;
	const TASK_EDITOR_DOCK_MAX_WIDTH = 60;

	const isDesktopTaskEditorLayoutMode = (
		value: string | null
	): value is DesktopTaskEditorLayoutMode =>
		value === 'modal' || value === 'dock' || value === 'fullscreen';
	const readDesktopTaskEditorLayoutMode = (): DesktopTaskEditorLayoutMode => {
		if (!browser) return 'modal';
		const storedValue = window.localStorage.getItem(TASK_EDITOR_LAYOUT_STORAGE_KEY);
		return isDesktopTaskEditorLayoutMode(storedValue) ? storedValue : 'modal';
	};
	const clampTaskEditorDockWidth = (value: number) =>
		Math.max(TASK_EDITOR_DOCK_MIN_WIDTH, Math.min(TASK_EDITOR_DOCK_MAX_WIDTH, value));
	const readTaskEditorDockWidth = () => {
		if (!browser) return TASK_EDITOR_DOCK_DEFAULT_WIDTH;
		const storedValue = Number(window.localStorage.getItem(TASK_EDITOR_DOCK_WIDTH_STORAGE_KEY));
		return Number.isFinite(storedValue)
			? clampTaskEditorDockWidth(storedValue)
			: TASK_EDITOR_DOCK_DEFAULT_WIDTH;
	};

	let desktopTaskEditorLayoutMode: DesktopTaskEditorLayoutMode = readDesktopTaskEditorLayoutMode();
	let taskEditorDockWidth = readTaskEditorDockWidth();

	$: isMobile = viewportWidth > 0 && viewportWidth < 1024;
	$: resolvedTaskEditorLayoutMode = isMobile ? 'fullscreen' : desktopTaskEditorLayoutMode;
	$: showDockedTaskEditor = Boolean(
		editingTask && !isDiffMode && !isMobile && resolvedTaskEditorLayoutMode === 'dock'
	);
	$: showFullscreenTaskEditor = Boolean(
		editingTask && !isDiffMode && !isMobile && resolvedTaskEditorLayoutMode === 'fullscreen'
	);
	$: showOverlayTaskEditor = Boolean(
		editingTask && (isMobile || resolvedTaskEditorLayoutMode === 'modal')
	);
	$: isDiffMode = comparisonData !== undefined;
	$: isCollaborative = members.length > 1;
	$: {
		const incomingFingerprint = kanbanOrderFingerprint(data);
		if (incomingFingerprint === lastEmittedOrderFingerprint) {
			lastEmittedOrderFingerprint = '';
		} else if (data !== boardData && !taskDragInProgress) {
			boardData = data;
		}
	}
	$: if (projectId !== lastColumnMoveProjectId) {
		lastColumnMoveProjectId = projectId;
		lastColumnMove = null;
	}
	$: diffData = isDiffMode && comparisonData ? computeKanbanDiff(comparisonData, boardData) : [];
	$: existingTags = (() => {
		const orderedTags: Tag[] = [];
		const orderByLabel = new Map<string, number>();
		const latestByLabel = new Map<string, { tag: Tag; lastUsedAt: number }>();

		for (const column of boardData) {
			for (const task of column.tasks) {
				const lastUsedAt = task.updatedAt ?? task.createdAt ?? 0;
				for (const tag of task.tags || []) {
					const key = tag.label.toLowerCase();
					if (!orderByLabel.has(key)) {
						orderByLabel.set(key, orderedTags.length);
						orderedTags.push(tag);
					}

					const current = latestByLabel.get(key);
					if (!current || lastUsedAt > current.lastUsedAt) {
						latestByLabel.set(key, { tag, lastUsedAt });
					}
				}
			}
		}

		if (![...latestByLabel.values()].some((entry) => entry.lastUsedAt > 0)) {
			return orderedTags;
		}

		return [...latestByLabel.entries()]
			.sort((left, right) => {
				const timestampDelta = right[1].lastUsedAt - left[1].lastUsedAt;
				if (timestampDelta !== 0) return timestampDelta;
				return (orderByLabel.get(left[0]) ?? 0) - (orderByLabel.get(right[0]) ?? 0);
			})
			.map(([, entry]) => entry.tag);
	})();
	$: taskTagMenuFilteredTags = (() => {
		const query = taskTagMenuSearchQuery.trim().toLowerCase();
		if (!query) return existingTags;
		return existingTags.filter((tag) => tag.label.trim().toLowerCase().includes(query));
	})();
	$: taskTagMenuNewColorSwatch =
		TAG_COLORS.find((color) => color.value === taskTagMenuNewColor) ?? TAG_COLORS[0];
	$: taskLinkGraph = buildTaskLinkGraph(boardData);
	$: linkGroupLayout = buildLinkGroupLayout(boardData);
	$: displayColumns = (() => {
		if (boardLayoutMode !== 'link-groups') {
			return boardData.map(
				(column): DisplayColumn => ({
					...column,
					isLinkGroup: false
				})
			);
		}

		const groupColumns: DisplayColumn[] = linkGroupLayout.linkGroupColumns.map((group) => ({
			id: group.id,
			title: group.title,
			width: DEFAULT_COLUMN_WIDTH,
			tasks: group.tasks.map((placement) => placement.task),
			isLinkGroup: true,
			linkGroupSubtitle: group.subtitle,
			taskColumnTitles: Object.fromEntries(
				group.tasks.map((placement) => [placement.task.id, placement.columnTitle])
			)
		}));

		const residualColumns: DisplayColumn[] = linkGroupLayout.residualColumns.map((column) => ({
			...column,
			isLinkGroup: false
		}));

		return [...groupColumns, ...residualColumns];
	})();
	let priorBoardSearchActive = false;
	$: if (active && boardSearchActive && !priorBoardSearchActive && !isMobile) {
		void tick().then(() => {
			boardSearchInput?.focus();
			boardSearchInput?.select();
		});
	}
	$: priorBoardSearchActive = boardSearchActive;
	$: boardSearchFiltering =
		boardSearchActive && normalizeBoardSearchQuery(boardSearchQuery).length > 0;
	$: visibleDisplayColumns = boardSearchFiltering
		? filterColumnsForBoardSearch(displayColumns, boardSearchQuery)
		: displayColumns;
	$: visibleDiffData = boardSearchFiltering
		? filterColumnsForBoardSearch(diffData, boardSearchQuery)
		: diffData;
	$: boardPresenceViewers = getBoardPresenceViewers(members, activeBoardId, currentUserId);
	$: linkViewComponentIds = linkViewAnchorId
		? new Set(getConnectedComponent(linkViewAnchorId, taskLinkGraph))
		: new Set<string>();
	$: effectiveHighlightedTaskIds = linkViewAnchorId
		? [...linkViewComponentIds]
		: highlightedTaskIds;
	$: linkOverlayEdges =
		linkViewAnchorId && linkViewComponentIds.size
			? getComponentEdges(taskLinkGraph, linkViewComponentIds)
			: [];
	$: taskLinkPickerOptions = (() => {
		if (!taskLinkPicker) return [] as TaskLinkPickerOption[];

		const sourceTask = boardData
			.flatMap((column) => column.tasks)
			.find((task) => task.id === taskLinkPicker?.sourceTaskId);
		const excluded = new Set([
			taskLinkPicker.sourceTaskId,
			...normalizeLinkedTaskIds(sourceTask?.linkedTaskIds)
		]);

		return boardData.flatMap((column) =>
			column.tasks
				.filter((task) => !excluded.has(task.id))
				.map((task) => ({
					taskId: task.id,
					title: task.title.trim() || 'Untitled task',
					columnTitle: column.title,
					tagLabels: (task.tags || []).map((tag) => tag.label)
				}))
		);
	})();
	$: if (!active || isDiffMode) {
		closeMenus();
		cancelTaskTitleEdit();
		linkViewAnchorId = null;
		boardLayoutMode = 'columns';
	}
	$: if (!isDiffMode) {
		expandedDiffTaskId = null;
	}
	$: if (openColumnMenu && !boardData.some((column) => column.id === openColumnMenu?.columnId)) {
		openColumnMenu = null;
	}
	$: if (
		openTaskMenu &&
		!boardData.some(
			(column) =>
				column.id === openTaskMenu?.colId &&
				column.tasks.some((task) => task.id === openTaskMenu?.taskId)
		)
	) {
		openTaskMenu = null;
	}
	$: if (
		taskTagMenuOpen &&
		!boardData.some(
			(column) =>
				column.id === taskTagMenuOpen?.colId &&
				column.tasks.some((task) => task.id === taskTagMenuOpen?.taskId)
		)
	) {
		taskTagMenuOpen = null;
	}
	$: if (
		taskInfoMenuOpen &&
		!boardData.some(
			(column) =>
				column.id === taskInfoMenuOpen?.colId &&
				column.tasks.some((task) => task.id === taskInfoMenuOpen?.taskId)
		)
	) {
		taskInfoMenuOpen = null;
	}
	$: if (
		editingTaskTitle &&
		!boardData.some(
			(column) =>
				column.id === editingTaskTitle?.columnId &&
				column.tasks.some((task) => task.id === editingTaskTitle?.taskId)
		)
	) {
		cancelTaskTitleEdit();
	}
	$: {
		const nextSignature = editingTask ? `${editingTask.column.id}:${editingTask.task.id}` : '';
		if (nextSignature !== lastReportedActiveTaskSignature) {
			lastReportedActiveTaskSignature = nextSignature;
			onActiveTaskChange(
				editingTask
					? {
							taskId: editingTask.task.id,
							columnId: editingTask.column.id
						}
					: null
			);
		}
	}
	$: if (editingTask) {
		const latestColumn = boardData.find((column) => column.id === editingTask?.column.id);
		const latestTask = latestColumn?.tasks.find((task) => task.id === editingTask?.task.id);
		if (!latestColumn || !latestTask) {
			editingTask = null;
		} else if (latestColumn !== editingTask.column || latestTask !== editingTask.task) {
			editingTask = {
				column: latestColumn,
				task: latestTask
			};
		}
	}
	$: if (editingTask && activeTaskId !== undefined && editingTask.task.id !== activeTaskId) {
		editingTask = null;
	}
	$: {
		const isPaneEditor = showDockedTaskEditor || showFullscreenTaskEditor;
		if (isPaneEditor !== lastReportedPaneEditorState) {
			lastReportedPaneEditorState = isPaneEditor;
			onDockedEditorChange(isPaneEditor);
		}
	}
	$: {
		const nextHighlightedTaskId = highlightedTaskIds[0] || '';
		if (!nextHighlightedTaskId) {
			lastScrolledHighlightedTaskId = '';
		} else if (nextHighlightedTaskId !== lastScrolledHighlightedTaskId) {
			lastScrolledHighlightedTaskId = nextHighlightedTaskId;
			void scrollTaskIntoView(nextHighlightedTaskId);
		}
	}

	const closeMenus = () => {
		openColumnMenu = null;
		openTaskMenu = null;
		taskMenuTrigger = null;
		columnTonePickerOpen = false;
		assignMenuOpen = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
		taskLinkPicker = null;
		rewriteTaskError = '';
	};

	const markMenuOpened = () => {
		menuSuppressScrollCloseUntil = Date.now() + MENU_SCROLL_CLOSE_GRACE_MS;
	};

	const handleMenuViewportScroll = () => {
		if (Date.now() < menuSuppressScrollCloseUntil) return;
		closeMenus();
		bumpLinkOverlay();
	};

	const portalToBody = (node: HTMLElement) => {
		if (!browser) return {};
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	};

	const isFloatingMenuTarget = (target: HTMLElement | null) =>
		Boolean(
			target?.closest(
				'[data-task-menu], [data-column-menu], [data-task-info-menu], [data-task-tag-menu], [data-task-link-picker]'
			)
		);

	const closeMenusFromBackdrop = (event: MouseEvent) => {
		event.stopPropagation();
		closeMenus();
	};

	const clearLinkView = () => {
		linkViewAnchorId = null;
	};

	const toggleLinkView = (taskId: string) => {
		if (isLocked || isDiffMode) return;
		linkViewAnchorId = linkViewAnchorId === taskId ? null : taskId;
		linkOverlayRedrawToken += 1;
	};

	const toggleBoardLayoutMode = () => {
		boardLayoutMode = boardLayoutMode === 'columns' ? 'link-groups' : 'columns';
		closeMenus();
		linkOverlayRedrawToken += 1;
	};

	const openTaskLinkPicker = async (
		columnId: string,
		taskId: string,
		trigger: HTMLButtonElement
	) => {
		markMenuOpened();
		taskLinkPicker = {
			sourceColId: columnId,
			sourceTaskId: taskId,
			position: await resolveMenuPosition(trigger, LINK_PICKER_WIDTH, LINK_PICKER_HEIGHT)
		};
		openTaskMenu = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
	};

	const linkTaskTo = (sourceTaskId: string, targetTaskId: string) => {
		emitBoardChange(addBidirectionalLink(boardData, sourceTaskId, targetTaskId));
		closeMenus();
	};

	const unlinkTaskFrom = (taskAId: string, taskBId: string) => {
		emitBoardChange(removeBidirectionalLink(boardData, taskAId, taskBId));
	};

	const createLinkedTaskFromMenu = async (columnId: string, sourceTaskId: string) => {
		const result = createLinkedTask(boardData, sourceTaskId, columnId);
		if (!result) return;

		emitBoardChange(result.data);
		closeMenus();

		const column = result.data.find((entry) => entry.id === result.columnId);
		const task = column?.tasks.find((entry) => entry.id === result.taskId);
		if (column && task) {
			editingTask = { column, task };
		}

		await scrollTaskIntoView(result.taskId);
	};

	const resolveRealColumn = (taskId: string) =>
		boardData.find((column) => column.tasks.some((task) => task.id === taskId)) || null;

	const getTaskColumnId = (taskId: string, fallbackColumnId = '') =>
		resolveRealColumn(taskId)?.id ?? fallbackColumnId;

	const getTaskLinkCount = (task: Task) => countUniqueTaskLinks(task);

	const removeDescriptionReference = (sourceTaskId: string, referencedTaskId: string) => {
		const sourceColumn = resolveRealColumn(sourceTaskId);
		if (!sourceColumn) return;

		emitBoardChange(
			boardData.map((column) => {
				if (column.id !== sourceColumn.id) return column;
				return {
					...column,
					tasks: column.tasks.map((task) => {
						if (task.id !== sourceTaskId) return task;
						return {
							...task,
							description: removeTaskReferenceFromMarkdown(task.description, referencedTaskId)
						};
					})
				};
			})
		);
		closeMenus();
	};

	const handleTaskCardActivate = (displayColumn: DisplayColumn, task: Task) => {
		if (linkViewAnchorId && !isLocked && !isDiffMode) {
			if (task.id !== linkViewAnchorId) {
				linkViewAnchorId = task.id;
				linkOverlayRedrawToken += 1;
			}
			return;
		}

		const realColumn = resolveRealColumn(task.id) || displayColumn;
		openTaskEditor(realColumn, task);
	};

	const bumpLinkOverlay = () => {
		linkOverlayRedrawToken += 1;
	};

	const handleUnlinkLinkedTask = (linkedTaskId: string) => {
		if (!editingTask) return;
		emitBoardChange(removeBidirectionalLink(boardData, editingTask.task.id, linkedTaskId));
	};

	const copyColumnAsMarkdown = async (columnId: string) => {
		const column = boardData.find((c) => c.id === columnId);
		if (!column) return;
		const lines = [`## ${column.title}`, ''];
		for (const task of column.tasks) {
			const check = task.checked ? 'x' : ' ';
			lines.push(`- [${check}] ${task.title}`);
		}
		await navigator.clipboard.writeText(lines.join('\n'));
		closeMenus();
	};

	const resolveMenuPosition = async (
		trigger: HTMLElement,
		menuWidth: number,
		menuHeight: number
	): Promise<MenuPosition> => {
		await tick();
		if (browser && typeof requestAnimationFrame === 'function') {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		return getMenuPosition(trigger, menuWidth, menuHeight);
	};

	const getMenuPosition = (
		trigger: HTMLElement,
		menuWidth: number,
		menuHeight: number
	): MenuPosition => {
		const rect = trigger.getBoundingClientRect();
		const viewportWidth =
			typeof window === 'undefined' ? 0 : window.innerWidth || document.documentElement.clientWidth;
		const viewportHeight =
			typeof window === 'undefined'
				? 0
				: window.innerHeight || document.documentElement.clientHeight;
		const maxLeft = Math.max(MENU_GUTTER, viewportWidth - menuWidth - MENU_GUTTER);
		let left = Math.min(rect.right - menuWidth, maxLeft);
		left = Math.max(MENU_GUTTER, left);

		const belowTop = rect.bottom + MENU_GAP;
		const opensAbove = belowTop + menuHeight > viewportHeight - MENU_GUTTER;
		const top = opensAbove
			? Math.max(MENU_GUTTER, rect.top - menuHeight - MENU_GAP)
			: belowTop;

		return {
			top: Math.max(MENU_GUTTER, top),
			left
		};
	};

	const menuOpensAboveTrigger = (trigger: HTMLElement, menuTop: number) =>
		menuTop < trigger.getBoundingClientRect().bottom + MENU_GAP;

	const resolveMenuPositionToRenderedPanel = (
		trigger: HTMLElement,
		panel: HTMLElement,
		menuWidth: number
	): MenuPosition & { opensAbove: boolean } => {
		const triggerRect = trigger.getBoundingClientRect();
		const panelHeight = panel.getBoundingClientRect().height;
		const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		const maxLeft = Math.max(MENU_GUTTER, viewportWidth - menuWidth - MENU_GUTTER);
		let left = Math.min(triggerRect.right - menuWidth, maxLeft);
		left = Math.max(MENU_GUTTER, left);

		const belowTop = triggerRect.bottom + MENU_GAP;
		const fitsBelow = belowTop + panelHeight <= viewportHeight - MENU_GUTTER;
		let top = fitsBelow ? belowTop : triggerRect.top - panelHeight - MENU_GAP;
		top = Math.max(MENU_GUTTER, top);
		top = Math.min(top, viewportHeight - panelHeight - MENU_GUTTER);

		return { top, left, opensAbove: !fitsBelow };
	};

	const resolvePanelSwapPosition = (
		panel: HTMLElement,
		trigger: HTMLElement,
		nextPanelHeight: number
	): MenuPosition => {
		const panelRect = panel.getBoundingClientRect();
		const triggerRect = trigger.getBoundingClientRect();
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		const menuBelowTrigger = panelRect.top >= triggerRect.bottom - 4;
		let top = menuBelowTrigger ? panelRect.top : panelRect.bottom - nextPanelHeight;

		top = Math.max(MENU_GUTTER, top);
		top = Math.min(top, viewportHeight - nextPanelHeight - MENU_GUTTER);

		return { top, left: panelRect.left };
	};

	const toggleColumnMenu = async (columnId: string, trigger: HTMLElement) => {
		if (openColumnMenu?.columnId === columnId) {
			openColumnMenu = null;
			return;
		}

		markMenuOpened();
		openColumnMenu = {
			columnId,
			position: await resolveMenuPosition(trigger, COLUMN_MENU_WIDTH, COLUMN_MENU_HEIGHT)
		};
		openTaskMenu = null;
		assignMenuOpen = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
	};

	const toggleTaskMenu = async (columnId: string, taskId: string, trigger: HTMLElement) => {
		if (openTaskMenu?.colId === columnId && openTaskMenu.taskId === taskId) {
			openTaskMenu = null;
			taskMenuTrigger = null;
			return;
		}

		markMenuOpened();
		taskMenuTrigger = trigger;
		const initialTaskMenuPosition = await resolveMenuPosition(
			trigger,
			TASK_MENU_WIDTH,
			TASK_MENU_HEIGHT
		);
		openTaskMenu = {
			colId: columnId,
			taskId,
			position: initialTaskMenuPosition,
			opensAbove: menuOpensAboveTrigger(trigger, initialTaskMenuPosition.top)
		};
		openColumnMenu = null;
		assignMenuOpen = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;

		await tick();
		if (browser && typeof requestAnimationFrame === 'function') {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		if (taskMenuPanel && openTaskMenu?.colId === columnId && openTaskMenu.taskId === taskId) {
			const refinedTaskMenuPosition = resolveMenuPositionToRenderedPanel(
				trigger,
				taskMenuPanel,
				TASK_MENU_WIDTH
			);
			openTaskMenu = {
				...openTaskMenu,
				position: { top: refinedTaskMenuPosition.top, left: refinedTaskMenuPosition.left },
				opensAbove: refinedTaskMenuPosition.opensAbove
			};
		}
	};

	const openTaskInfoFromTaskMenu = async (colId: string, taskId: string) => {
		if (!taskMenuPanel) return;

		const task = boardData.flatMap((column) => column.tasks).find((entry) => entry.id === taskId);
		const infoHeight = task?.hasCheckbox ? TASK_INFO_MENU_HEIGHT_CHECKABLE : TASK_INFO_MENU_HEIGHT;
		const position = taskMenuTrigger
			? resolvePanelSwapPosition(taskMenuPanel, taskMenuTrigger, infoHeight)
			: { top: taskMenuPanel.getBoundingClientRect().top, left: taskMenuPanel.getBoundingClientRect().left };

		await toggleTaskInfoMenu(colId, taskId, position);
	};

	const toggleTaskInfoMenu = async (
		colId: string,
		taskId: string,
		anchor: HTMLElement | MenuPosition
	) => {
		if (taskInfoMenuOpen?.colId === colId && taskInfoMenuOpen.taskId === taskId) {
			taskInfoMenuOpen = null;
			return;
		}

		const task = boardData.flatMap((column) => column.tasks).find((entry) => entry.id === taskId);
		const menuHeight = task?.hasCheckbox ? TASK_INFO_MENU_HEIGHT_CHECKABLE : TASK_INFO_MENU_HEIGHT;
		const position =
			anchor instanceof HTMLElement
				? await resolveMenuPosition(anchor, TASK_INFO_MENU_WIDTH, menuHeight)
				: anchor;

		markMenuOpened();
		taskInfoMenuOpen = {
			colId,
			taskId,
			position
		};
		openColumnMenu = null;
		openTaskMenu = null;
		taskTagMenuOpen = null;
		assignMenuOpen = null;
	};

	const isEditableTarget = (target: EventTarget | null) => {
		const element = target as HTMLElement | null;
		if (!element) return false;
		return Boolean(
			element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
		);
	};

	const openBoardSearch = async () => {
		boardSearchActive = true;
		await tick();
		boardSearchInput?.focus();
		boardSearchInput?.select();
	};

	const closeBoardSearch = () => {
		boardSearchActive = false;
		boardSearchQuery = '';
	};

	const handleWindowKeydown = (event: KeyboardEvent) => {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
			if (!active || isDiffMode) return;
			if (isEditableTarget(event.target)) return;
			event.preventDefault();
			void openBoardSearch();
			return;
		}

		if (event.key === 'Escape') {
			if (boardSearchActive) {
				closeBoardSearch();
				return;
			}
			if (linkViewAnchorId) {
				clearLinkView();
				return;
			}
			closeMenus();
		}
	};

	const handleWindowClick = (event: MouseEvent) => {
		const target = event.target as HTMLElement | null;
		if (isFloatingMenuTarget(target)) {
			return;
		}
		closeMenus();
		if (!showDockedTaskEditor) return;
		if (!target) return;
		if (target.closest('[data-task-editor-pane]')) return;
		if (target.closest('[data-task-id]')) return;
		if (target.closest('button, input, textarea, [role="button"]')) return;
		editingTask = null;
	};

	const emitBoardChange = (nextData: KanbanData, options: BoardChangeOptions = {}) => {
		boardData = nextData;
		lastEmittedOrderFingerprint = kanbanOrderFingerprint(nextData);
		onChange(nextData, options);
	};

	const preserveTaskTimestamps = (nextTask: Task, previousTask?: Task) => {
		const timestamp = Date.now();
		return {
			...nextTask,
			createdAt: nextTask.createdAt ?? previousTask?.createdAt ?? timestamp,
			updatedAt: timestamp
		};
	};

	const scrollBehavior = (): ScrollBehavior =>
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

	const scrollDragViewportIfNeeded = (event: PointerEvent) => {
		if (!taskDragInProgress || isLocked || isDiffMode) return;

		const columnViewport = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('[data-column-viewport]');
		if (columnViewport) {
			const rect = columnViewport.getBoundingClientRect();
			const edge = 72;
			const maxStep = 28;
			if (event.clientY > rect.bottom - edge) {
				const ratio = 1 - Math.max(0, rect.bottom - event.clientY) / edge;
				columnViewport.scrollBy({ top: Math.ceil(maxStep * ratio), behavior: 'auto' });
			} else if (event.clientY < rect.top + edge) {
				const ratio = 1 - Math.max(0, event.clientY - rect.top) / edge;
				columnViewport.scrollBy({ top: -Math.ceil(maxStep * ratio), behavior: 'auto' });
			}
		}

		if (boardScrollViewport) {
			const rect = boardScrollViewport.getBoundingClientRect();
			const edge = 96;
			const maxStep = 32;
			if (event.clientX > rect.right - edge) {
				const ratio = 1 - Math.max(0, rect.right - event.clientX) / edge;
				boardScrollViewport.scrollBy({ left: Math.ceil(maxStep * ratio), behavior: 'auto' });
			} else if (event.clientX < rect.left + edge) {
				const ratio = 1 - Math.max(0, event.clientX - rect.left) / edge;
				boardScrollViewport.scrollBy({ left: -Math.ceil(maxStep * ratio), behavior: 'auto' });
			}
		}
	};

	const scrollTaskIntoView = async (taskId: string) => {
		await tick();
		if (typeof document === 'undefined') return;
		const escapedTaskId =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(taskId)
				: taskId.replace(/["\\]/g, '\\$&');
		const card = document.querySelector<HTMLElement>(`[data-task-id="${escapedTaskId}"]`);
		if (!card) return;

		const behavior = scrollBehavior();
		const columnViewport = card.closest<HTMLElement>('[data-column-viewport]');
		if (columnViewport) {
			const cardRect = card.getBoundingClientRect();
			const viewRect = columnViewport.getBoundingClientRect();
			const edge = 12;
			let targetScrollTop = columnViewport.scrollTop;
			if (cardRect.top < viewRect.top + edge) {
				targetScrollTop += cardRect.top - viewRect.top - edge;
			} else if (cardRect.bottom > viewRect.bottom - edge) {
				targetScrollTop += cardRect.bottom - viewRect.bottom + edge;
			}
			if (targetScrollTop !== columnViewport.scrollTop) {
				columnViewport.scrollTo({ top: targetScrollTop, behavior });
			}
		}

		card.scrollIntoView({
			block: 'nearest',
			inline: 'nearest',
			behavior
		});
	};

	const handleTaskReferenceNavigation = (payload: { taskId: string; columnId: string }) => {
		editingTask = null;
		closeMenus();
		onTaskReferenceNavigate(payload);
	};

	const withUpdatedColumnTasks = (columns: KanbanData, columnId: string, tasks: Task[]) =>
		columns.map((column) =>
			column.id === columnId
				? {
						...column,
						tasks
					}
				: column
		);

	const withoutDndShadowTasks = (tasks: Task[]) => tasks.filter((task) => !isShadowItem(task));

	const withFinalizedDndColumnTasks = (
		columns: KanbanData,
		columnId: string,
		tasks: Task[],
		options: { dedupeAcrossColumns?: boolean } = {}
	) => {
		const finalizedTasks = withoutDndShadowTasks(tasks);
		const finalizedIds = new Set(finalizedTasks.map((task) => task.id));
		const dedupeAcrossColumns = options.dedupeAcrossColumns !== false;

		return columns.map((column) => {
			if (column.id === columnId) {
				return {
					...column,
					tasks: finalizedTasks
				};
			}

			return {
				...column,
				tasks: withoutDndShadowTasks(column.tasks).filter(
					(task) => !dedupeAcrossColumns || !finalizedIds.has(task.id)
				)
			};
		});
	};

	const recoverMissingDraggedTask = (
		columns: KanbanData,
		columnId: string,
		taskId: string,
		fallbackBoard: KanbanData | null
	) => {
		if (findTaskColumnId(columns, taskId)) return columns;

		const fallbackTask = fallbackBoard
			?.flatMap((column) => column.tasks)
			.find((task) => task.id === taskId && !isShadowItem(task));
		if (!fallbackTask) return columns;

		const targetColumn = columns.find((column) => column.id === columnId);
		if (!targetColumn) return columns;

		return withUpdatedColumnTasks(columns, columnId, [
			...withoutDndShadowTasks(targetColumn.tasks),
			fallbackTask
		]);
	};

	const endTaskDrag = () => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				taskDragInProgress = false;
				boardDataAtDragStart = null;
			});
		});
	};

	const updateColumnTasks = (columnId: string, tasks: Task[]) => {
		emitBoardChange(withUpdatedColumnTasks(boardData, columnId, tasks));
	};

	const updateTask = (
		columnId: string,
		taskId: string,
		updater: (task: Task) => Task,
		options: BoardChangeOptions = {}
	) => {
		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId
					? {
							...column,
							tasks: column.tasks.map((task) =>
								task.id === taskId ? preserveTaskTimestamps(updater(task), task) : task
							)
						}
					: column
			),
			options
		);
	};

	const addTask = async (columnId: string, placement: 'top' | 'bottom' = 'top') => {
		const timestamp = Date.now();
		const nextTask: Task = {
			id: createId(),
			title: 'New Task',
			description: '',
			tags: [],
			hasCheckbox: boardPreferences.defaultShowCheckbox,
			checked: false,
			createdAt: timestamp,
			updatedAt: timestamp
		};

		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId
					? {
							...column,
							tasks:
								placement === 'bottom' ? [...column.tasks, nextTask] : [nextTask, ...column.tasks]
						}
					: column
			)
		);

		closeMenus();
		await scrollTaskIntoView(nextTask.id);
		await startTaskTitleEdit(columnId, nextTask);
	};

	const deleteTask = (columnId: string, taskId: string) => {
		const filtered = boardData.map((column) =>
			column.id === columnId
				? { ...column, tasks: column.tasks.filter((task) => task.id !== taskId) }
				: column
		);
		emitBoardChange(purgeTaskLinks(filtered, taskId));
		if (linkViewAnchorId === taskId) {
			clearLinkView();
		}
		closeMenus();
	};

	const addColumn = () => {
		emitBoardChange([
			...boardData,
			{
				id: createId(),
				title: 'New Column',
				width: DEFAULT_COLUMN_WIDTH,
				tasks: []
			}
		]);
	};

	const renameColumn = (columnId: string, title: string) => {
		const nextTitle = title.trim();
		if (!nextTitle) return;

		emitBoardChange(
			boardData.map((column) => (column.id === columnId ? { ...column, title: nextTitle } : column))
		);
		editingColumnId = null;
		editingColumnTitle = '';
	};

	const cancelTaskTitleEdit = () => {
		editingTaskTitle = null;
		editingTaskTitleValue = '';
		taskTitleInput = null;
	};

	const syncTaskTitleInputHeight = (input: HTMLTextAreaElement | null = taskTitleInput) => {
		if (!input) return;
		input.style.height = 'auto';
		input.style.height = `${input.scrollHeight}px`;
	};

	const autoTagFromTitle = (title: string): { cleanedTitle: string; tagLabels: string[]; dueAt: number | undefined } => {
		// Match trailing hashtags + optional /due: shorthand at the end of the title
		// ##tag = escaped: stays as #tag in title, no tag created
		// #tag = auto-tag: stripped from title, added as tag
		// /due:10h or /due:tomorrow or /due:May5 or /due:3-07-2026-11:38pm
		const trailingPattern = /^([\s\S]*?)((?:\s+(?:#{1,2}[\w-]+|\/due:[\w\-\/:]+))+)$/;
		const match = title.match(trailingPattern);
		if (!match) {
			return { cleanedTitle: title, tagLabels: [], dueAt: undefined };
		}

		const baseTitle = match[1].trimEnd();
		const partsStr = match[2];
		const tagLabels: string[] = [];
		let dueAt: number | undefined;
		let escapedPart = partsStr;

		// Extract /due: shorthand
		const dueMatch = partsStr.match(/\/due:([\w\-\/:]+)/);
		if (dueMatch) {
			dueAt = parseDueShorthand(dueMatch[1]);
			escapedPart = escapedPart.replace(/\s*\/due:[\w\-\/:]+/, '');
		}

		// Extract single #tag (not ##) as auto-tags
		const tagRegex = /(?<!\#)\#([\w-]+)/g;
		let tagMatch;
		while ((tagMatch = tagRegex.exec(partsStr)) !== null) {
			const label = tagMatch[1].trim();
			if (label) {
				tagLabels.push(label);
			}
		}

		// Replace ## with # in the escaped portion (display only)
		escapedPart = escapedPart.replace(/##([\w-]+)/g, '#$1');
		// Remove auto-tagged #tags from the escaped portion
		for (const label of tagLabels) {
			escapedPart = escapedPart.replace(new RegExp('\\s#' + label + '(?!\\w)'), '');
		}

		return { cleanedTitle: (baseTitle + escapedPart).trim(), tagLabels, dueAt };
	};

	const parseDueShorthand = (value: string): number | undefined => {
		const now = Date.now();
		// Relative: 10h, 5D, 3d, 2w, 1m
		const relMatch = value.match(/^(\d+)([hHdDwWmM])$/);
		if (relMatch) {
			const n = parseInt(relMatch[1]);
			const unit = relMatch[2].toLowerCase();
			const ms = unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : unit === 'w' ? 604800000 : 2592000000;
			return now + n * ms;
		}
		// tomorrow
		if (value.toLowerCase() === 'tomorrow') {
			const d = new Date(now);
			d.setDate(d.getDate() + 1);
			d.setHours(9, 0, 0, 0);
			return d.getTime();
		}
		// Named month: May5, Jan12
		const namedMatch = value.match(/^([A-Za-z]+)(\d+)$/);
		if (namedMatch) {
			const d = new Date(`${namedMatch[1]} ${namedMatch[2]}, ${new Date().getFullYear()}`);
			if (!isNaN(d.getTime())) return d.getTime();
		}
		// ISO-ish: 3-07-2026 or 3-07-2026-11:38pm
		const isoMatch = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[-/](\d{1,2}):(\d{2})(am|pm)?)?$/i);
		if (isoMatch) {
			let [_, m, d, y, hh, mm, ampm] = isoMatch;
			let year = parseInt(y);
			if (year < 100) year += 2000;
			let hour = hh ? parseInt(hh) : 0;
			if (ampm && ampm.toLowerCase() === 'pm' && hour < 12) hour += 12;
			if (ampm && ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
			const date = new Date(year, parseInt(m) - 1, parseInt(d), hour, parseInt(mm || '0'));
			if (!isNaN(date.getTime())) return date.getTime();
		}
		return undefined;
	};

	const resolveOrCreateTags = (tagLabels: string[]): Tag[] => {
		const resolved: Tag[] = [];
		const usedColors = new Set(existingTags.map((t) => t.color));

		for (const label of tagLabels) {
			// Check if tag with this label already exists on the board
			const existing = existingTags.find(
				(t) => t.label.trim().toLowerCase() === label.toLowerCase()
			);
			if (existing) {
				// Reuse existing tag
				resolved.push(existing);
			} else {
				// Create a new tag with a random unused color
				const available = TAG_COLOR_PRESETS.filter((c) => !usedColors.has(c.value));
				const colorPreset = available.length > 0
					? available[Math.floor(Math.random() * available.length)]
					: TAG_COLOR_PRESETS[0];
				const newTag: Tag = {
					id: createId(),
					label,
					color: colorPreset.value
				};
				resolved.push(newTag);
				usedColors.add(colorPreset.value);
			}
		}

		return resolved;
	};

	const saveTaskTitleEdit = () => {
		if (!editingTaskTitle) return;

		const rawTitle = editingTaskTitleValue.trim();
		const { columnId, taskId } = editingTaskTitle;

		suppressTaskOpenUntil = Date.now() + 250;

		if (rawTitle) {
			// Extract trailing hashtags + /due: shorthand
			const { cleanedTitle, tagLabels, dueAt } = autoTagFromTitle(rawTitle);
			const newTags = tagLabels.length > 0 ? resolveOrCreateTags(tagLabels) : [];

			updateTask(columnId, taskId, (task) => ({
				...task,
				title: cleanedTitle,
				tags:
					newTags.length > 0
						? [...(task.tags || []), ...newTags]
						: task.tags,
				countdownAt: dueAt ?? task.countdownAt
			}));
		}

		cancelTaskTitleEdit();
	};

	const startTaskTitleEdit = async (columnId: string, task: Task) => {
		if (isLocked || isDiffMode) return;

		editingTaskTitle = { columnId, taskId: task.id };
		editingTaskTitleValue = task.title;
		closeMenus();
		lastTaskTitleTap = null;

		await tick();
		if (!taskTitleInput) return;
		syncTaskTitleInputHeight(taskTitleInput);
		taskTitleInput.focus();
		const end = taskTitleInput.value.length;
		taskTitleInput.setSelectionRange(end, end);
	};

	const handleTaskTitlePointerUp = (event: PointerEvent, columnId: string, task: Task) => {
		event.stopPropagation();
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;

		const now = Date.now();
		if (
			lastTaskTitleTap &&
			lastTaskTitleTap.columnId === columnId &&
			lastTaskTitleTap.taskId === task.id &&
			now - lastTaskTitleTap.at <= TITLE_DOUBLE_TAP_MS
		) {
			lastTaskTitleTap = null;
			void startTaskTitleEdit(columnId, task);
			return;
		}

		lastTaskTitleTap = { columnId, taskId: task.id, at: now };
	};

	const openTaskEditor = (column: Column, task: Task) => {
		if (isLocked || isDiffMode) return;
		if (Date.now() < suppressTaskOpenUntil) return;
		closeMenus();
		editingTask = { column, task };
	};

	const deleteColumn = (columnId: string) => {
		emitBoardChange(boardData.filter((column) => column.id !== columnId));
		closeMenus();
	};

	const toggleChecked = (columnId: string, taskId: string) => {
		const sourceColumn = boardData.find((column) => column.id === columnId);
		const task = sourceColumn?.tasks.find((entry) => entry.id === taskId);
		if (!task) return;

		const checked = !task.checked;
		const nextTask = preserveTaskTimestamps(
			{
				...task,
				title:
					task.hasCheckbox && hasLeadingCardCheckboxLine(task.title || '')
						? syncLeadingCardCheckboxLine(task.title || '', checked)
						: task.title,
				checked,
				completedAt: checked ? Date.now() : undefined
			},
			task
		);

		if (checked) {
			const targetColumnId = resolveCheckedMoveTargetColumnId(boardData, boardPreferences);
			if (targetColumnId && targetColumnId !== columnId) {
				emitBoardChange(
					boardData.map((column) => {
						if (column.id === columnId) {
							return {
								...column,
								tasks: column.tasks.filter((entry) => entry.id !== taskId)
							};
						}

						if (column.id === targetColumnId) {
							return {
								...column,
								tasks: [nextTask, ...column.tasks]
							};
						}

						return column;
					})
				);
				closeMenus();
				return;
			}
		}

		updateTask(columnId, taskId, () => nextTask);
		closeMenus();
	};

	const toggleCheckbox = (columnId: string, taskId: string) => {
		updateTask(columnId, taskId, (task) => ({
			...task,
			hasCheckbox: !task.hasCheckbox
		}));
		closeMenus();
	};

	const moveTaskToBottom = (columnId: string, taskId: string) => {
		const column = boardData.find((entry) => entry.id === columnId);
		if (!column) return;

		const task = column.tasks.find((entry) => entry.id === taskId);
		if (!task) return;

		updateColumnTasks(columnId, [...column.tasks.filter((entry) => entry.id !== taskId), task]);
		closeMenus();
	};

	const moveTaskToTop = (columnId: string, taskId: string) => {
		const column = boardData.find((entry) => entry.id === columnId);
		if (!column) return;

		const task = column.tasks.find((entry) => entry.id === taskId);
		if (!task) return;

		updateColumnTasks(columnId, [task, ...column.tasks.filter((entry) => entry.id !== taskId)]);
		closeMenus();
	};

	const getColumnTitle = (columnId: string) =>
		boardData.find((column) => column.id === columnId)?.title?.trim() || 'Column';

	const repeatLastColumnMove = (fromColumnId: string, taskId: string) => {
		if (!lastColumnMove) return;

		const { toColumnId } = lastColumnMove;
		if (fromColumnId === toColumnId) return;

		const sourceColumn = boardData.find((column) => column.id === fromColumnId);
		const targetColumn = boardData.find((column) => column.id === toColumnId);
		if (!sourceColumn || !targetColumn) return;

		const task = sourceColumn.tasks.find((entry) => entry.id === taskId);
		if (!task) return;

		emitBoardChange(
			boardData.map((column) => {
				if (column.id === fromColumnId) {
					return {
						...column,
						tasks: column.tasks.filter((entry) => entry.id !== taskId)
					};
				}

				if (column.id === toColumnId) {
					return {
						...column,
						tasks: [preserveTaskTimestamps(task, task), ...column.tasks]
					};
				}

				return column;
			})
		);
		closeMenus();
	};

	const toggleAssignMenu = async (colId: string, taskId: string, trigger: HTMLElement) => {
		if (assignMenuOpen?.colId === colId && assignMenuOpen.taskId === taskId) {
			assignMenuOpen = null;
			return;
		}

		const task = boardData.flatMap((column) => column.tasks).find((entry) => entry.id === taskId);

		markMenuOpened();
		assignMenuOpen = {
			colId,
			taskId,
			position: await resolveMenuPosition(
				trigger,
				ASSIGN_MENU_WIDTH,
				getAssignMenuHeight(members.length, Boolean(task?.assignedTo))
			)
		};
		openColumnMenu = null;
		openTaskMenu = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
	};

	const assignTask = (columnId: string, taskId: string, userId: string | undefined) => {
		updateTask(columnId, taskId, (task) => ({ ...task, assignedTo: userId }));
		assignMenuOpen = null;
	};

	const resetTaskTagMenuUi = () => {
		taskTagMenuMode = 'list';
		taskTagMenuSearchOpen = false;
		taskTagMenuSearchQuery = '';
		taskTagMenuNewLabel = '';
		taskTagMenuNewColor = TAG_COLORS[0]?.value ?? '';
	};

	const openTaskTagMenuSearch = async () => {
		taskTagMenuMode = 'list';
		taskTagMenuSearchOpen = true;
		await tick();
		taskTagMenuSearchInput?.focus();
	};

	const closeTaskTagMenuSearch = () => {
		taskTagMenuSearchOpen = false;
		taskTagMenuSearchQuery = '';
	};

	const openTaskTagMenuCreate = async () => {
		taskTagMenuSearchOpen = false;
		taskTagMenuSearchQuery = '';
		taskTagMenuMode = 'create';
		await tick();
		taskTagMenuCreateInput?.focus();
	};

	const closeTaskTagMenuCreate = () => {
		taskTagMenuMode = 'list';
		taskTagMenuNewLabel = '';
		taskTagMenuNewColor = TAG_COLORS[0]?.value ?? '';
	};

	$: if (!taskTagMenuOpen) resetTaskTagMenuUi();

	const toggleTaskTagMenu = async (colId: string, taskId: string, trigger: HTMLElement) => {
		if (taskTagMenuOpen?.colId === colId && taskTagMenuOpen.taskId === taskId) {
			taskTagMenuOpen = null;
			return;
		}
		resetTaskTagMenuUi();
		markMenuOpened();
		taskTagMenuOpen = {
			colId,
			taskId,
			position: await resolveMenuPosition(trigger, TAG_MENU_WIDTH, TAG_MENU_HEIGHT)
		};
		openColumnMenu = null;
		openTaskMenu = null;
		assignMenuOpen = null;
		taskInfoMenuOpen = null;
	};

	const toggleTaskTag = (columnId: string, taskId: string, tag: Tag) => {
		updateTask(columnId, taskId, (task) => {
			const hasTag = (task.tags || []).some(
				(entry) => entry.label.trim().toLowerCase() === tag.label.trim().toLowerCase()
			);
			if (hasTag) {
				return {
					...task,
					tags: (task.tags || []).filter(
						(entry) => entry.label.trim().toLowerCase() !== tag.label.trim().toLowerCase()
					)
				};
			}
			return {
				...task,
				tags: [...(task.tags || []), { id: createId(), label: tag.label, color: tag.color }]
			};
		});
		taskTagMenuOpen = null;
	};

	const createTaskTagFromMenu = (columnId: string, taskId: string) => {
		const clean = taskTagMenuNewLabel.trim();
		if (!clean) return;

		const existing =
			existingTags.find((entry) => entry.label.trim().toLowerCase() === clean.toLowerCase()) ??
			({ id: createId(), label: clean, color: taskTagMenuNewColor } satisfies Tag);

		updateTask(columnId, taskId, (task) => {
			const hasTag = (task.tags || []).some(
				(entry) => entry.label.trim().toLowerCase() === existing.label.trim().toLowerCase()
			);
			if (hasTag) return task;
			return {
				...task,
				tags: [...(task.tags || []), { id: createId(), label: existing.label, color: existing.color }]
			};
		});
		taskTagMenuOpen = null;
	};

	const getMemberLabel = (member: ProjectMembership) =>
		getProjectMemberDisplayName(member, { preferCurrentUserLabel: false });

	const getAssignedMember = (task: Task) => {
		if (!task.assignedTo) return null;
		return members.find((member) => member.userId === task.assignedTo) ?? null;
	};

	const getMemberAvatarUrl = (member: ProjectMembership | null | undefined) =>
		resolveMemberAvatarUrl(member, currentUserId, currentUserAvatarUrl);

	const copyTaskTitle = async (columnId: string, taskId: string) => {
		const task = boardData
			.find((column) => column.id === columnId)
			?.tasks.find((entry) => entry.id === taskId);
		if (!task) return;
		await navigator.clipboard.writeText(task.title);
		closeMenus();
	};

	const mergeRewrittenTaskTitle = (task: Task, rewritten: string) => {
		const normalized = (task.title || '').replace(/\r\n/g, '\n');
		const [firstLine = '', ...restLines] = normalized.split('\n');
		let nextFirst = rewritten.trim();

		if (taskTitleUsesCardCheckbox(task)) {
			const match = firstLine.match(/^(\s*(?:[-*+]\s+)?)\[([ xX])\]\s*(.*)$/);
			nextFirst = match
				? `${match[1]}[${task.checked ? 'x' : ' '}] ${nextFirst}`
				: syncLeadingCardCheckboxLine(`- [ ] ${nextFirst}`, Boolean(task.checked));
		}

		return restLines.length ? [nextFirst, ...restLines].join('\n') : nextFirst;
	};

	const rewriteTaskTitleWithAi = async (columnId: string, taskId: string) => {
		const column = boardData.find((entry) => entry.id === columnId);
		const task = column?.tasks.find((entry) => entry.id === taskId);
		if (!task || rewritingTaskId) return;

		const sourceTitle = getRenderedTaskTitle(task).trim();
		if (!sourceTitle) return;

		rewritingTaskId = taskId;
		rewriteTaskError = '';

		try {
			const rewritten = await rewriteTaskTitle({
				title: sourceTitle,
				description: (task.description || '').trim() || undefined,
				columnTitle: column?.title
			});

			if (rewritten === sourceTitle) {
				rewriteTaskError = 'AI returned the same title.';
				return;
			}

			updateTask(columnId, taskId, (currentTask) => ({
				...currentTask,
				title: mergeRewrittenTaskTitle(currentTask, rewritten)
			}));
			closeMenus();
		} catch (error) {
			rewriteTaskError =
				error instanceof Error ? error.message : 'Unable to rewrite this task title.';
		} finally {
			rewritingTaskId = null;
		}
	};

	const taskTitleUsesCardCheckbox = (task: Task) =>
		Boolean(task.hasCheckbox && hasLeadingCardCheckboxLine(task.title || ''));

	const getRenderedTaskTitle = (task: Task) =>
		taskTitleUsesCardCheckbox(task)
			? stripLeadingCardCheckboxLine(task.title || '')
			: task.title || '';

	const toggleTaskTitleCheckbox = (
		columnId: string,
		taskId: string,
		index: number,
		checked: boolean
	) => {
		updateTask(columnId, taskId, (task) => {
			const checkboxOffset = taskTitleUsesCardCheckbox(task) ? 1 : 0;
			return {
				...task,
				title: toggleMarkdownCheckbox(task.title || '', index + checkboxOffset, checked)
			};
		});
	};

	const setDesktopTaskEditorLayoutMode = (mode: DesktopTaskEditorLayoutMode) => {
		desktopTaskEditorLayoutMode = mode;
		if (browser) {
			window.localStorage.setItem(TASK_EDITOR_LAYOUT_STORAGE_KEY, mode);
		}
	};

	const setTaskEditorDockWidth = (width: number) => {
		taskEditorDockWidth = clampTaskEditorDockWidth(width);
		if (browser) {
			window.localStorage.setItem(TASK_EDITOR_DOCK_WIDTH_STORAGE_KEY, String(taskEditorDockWidth));
		}
	};

	const handleTaskEditorResizeStart = (event: PointerEvent) => {
		if (!showDockedTaskEditor) return;

		event.preventDefault();
		const startX = event.clientX;
		const startWidth = taskEditorDockWidth;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaRem = (startX - moveEvent.clientX) / 16;
			setTaskEditorDockWidth(startWidth + deltaRem);
		};

		const stopResizing = () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', stopResizing);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', stopResizing);
	};

	const COLUMN_TASK_COUNT_CLASS =
		'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 text-[10px] font-medium tabular-nums leading-none text-app-subtext/70 bg-app-element/45';
	const COLUMN_HEADER_BASE_CLASS =
		'flex shrink-0 items-center justify-between gap-2 border-b border-app-border/80 px-2.5';
	const COLUMN_HEADER_COMPACT_CLASS = `${COLUMN_HEADER_BASE_CLASS} min-h-8 py-1 lg:min-h-12 lg:py-1.5`;
	const COLUMN_HEADER_ACTION_CLASS =
		'inline-flex shrink-0 items-center justify-center rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text';
	const getColumnWidth = (column: Column) => clampColumnWidth(column.width ?? DEFAULT_COLUMN_WIDTH);
	const getColumnLayoutStyle = (column: Column) =>
		`width: ${getColumnWidth(column)}px; min-width: ${getColumnWidth(column)}px;`;
	const getBoardColumnStyle = (column: Column) =>
		[getColumnLayoutStyle(column), getColumnToneStyle(column.color, colorMode)]
			.filter(Boolean)
			.join('; ');
	const getTaskStyle = (task: DiffTask) =>
		task._status && task._status !== 'unchanged' ? '' : getCardToneStyle(task.color, colorMode);

	const getTaskCardStyle = (task: DiffTask, isLinkHighlighted: boolean) => {
		const toneStyle = getTaskStyle(task);
		if (!toneStyle || !isLinkHighlighted) return toneStyle;

		return toneStyle
			.split(';')
			.map((chunk) => chunk.trim())
			.filter((chunk) => chunk && !chunk.startsWith('border-color:'))
			.join('; ');
	};

	const setColumnWidth = (columnId: string, width: number) => {
		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId
					? {
							...column,
							width: clampColumnWidth(width)
						}
					: column
			)
		);
	};

	const setColumnColor = (columnId: string, color: string) => {
		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId
					? {
							...column,
							color: color || undefined
						}
					: column
			)
		);
	};

	const handleColumnDnd = (event: CustomEvent<DndEvent<Column>>) => {
		if (isLocked || isDiffMode) return;
		emitBoardChange(event.detail.items as KanbanData);
	};

	const findTaskColumnId = (columns: KanbanData, taskId: string) =>
		columns.find((column) => column.tasks.some((task) => task.id === taskId))?.id;

	const recordLastColumnMove = (fromColumnId: string, toColumnId: string) => {
		if (fromColumnId !== toColumnId) {
			lastColumnMove = { fromColumnId, toColumnId };
		}
	};

	const handleTaskDnd = (
		columnId: string,
		event: CustomEvent<DndEvent<Task>>,
		phase: 'consider' | 'finalize'
	) => {
		if (isLocked || isDiffMode) return;

		const { items, info } = event.detail;
		const taskId = info.id;

		if (phase === 'consider') {
			if (!taskDragInProgress) {
				boardDataAtDragStart = boardData;
			}
			taskDragInProgress = true;
			// Keep the dnd shadow placeholder in place so the drag preview renders and
			// snaps to boundaries. Stripping shadow items here makes the card vanish mid-drag.
			boardData = withUpdatedColumnTasks(boardData, columnId, items as Task[]);
			return;
		}

		// Cross-column pointer drops finalize the origin zone with DROPPED_INTO_ANOTHER.
		if (info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
			const fromColumnId = columnId;
			const toColumnId = boardData.find(
				(column) => column.id !== fromColumnId && column.tasks.some((task) => task.id === taskId)
			)?.id;

			boardData = recoverMissingDraggedTask(
				withFinalizedDndColumnTasks(boardData, columnId, items as Task[], {
					dedupeAcrossColumns: false
				}),
				columnId,
				taskId,
				boardDataAtDragStart
			);

			if (toColumnId) {
				recordLastColumnMove(fromColumnId, toColumnId);
			}
			endTaskDrag();
			return;
		}

		const fromColumnId = findTaskColumnId(boardData, taskId);
		const nextBoard = recoverMissingDraggedTask(
			withFinalizedDndColumnTasks(boardData, columnId, items as Task[]),
			columnId,
			taskId,
			boardDataAtDragStart
		);
		const toColumnId = findTaskColumnId(nextBoard, taskId);

		emitBoardChange(nextBoard);

		if (fromColumnId && toColumnId) {
			recordLastColumnMove(fromColumnId, toColumnId);
		}
		endTaskDrag();
	};

	const taskHasVisibleProposalDiff = (task: DiffTask) =>
		Boolean(
			task._status === 'modified' &&
				task._originalTask &&
				!areKanbanTasksEqualForDiff(task._originalTask, task)
		);

	const cardClasses = (task: DiffTask, options?: { linkDimmed?: boolean }) => {
		const isLinkAnchor = linkViewAnchorId === task.id;
		const isLinkClusterMember = Boolean(
			linkViewAnchorId && !isDiffMode && linkViewComponentIds.has(task.id)
		);
		const isReferenceHighlight = !linkViewAnchorId && effectiveHighlightedTaskIds.includes(task.id);

		const cardShadowClass = colorMode === 'light' ? '' : 'shadow-sm hover:shadow-lg';

		let result = `group relative shrink-0 overflow-hidden rounded-lg p-2 ${cardShadowClass} transition duration-200${
			isMobile ? '' : ' hover:-translate-y-0.5'
		}`;

		if (task._status === 'added') result += ' border border-emerald-500/40 bg-emerald-500/10';
		else if (task._status === 'removed')
			result += ' border border-rose-500/40 bg-rose-500/10 opacity-80';
		else if (taskHasVisibleProposalDiff(task))
			result += ' border border-amber-500/40 bg-amber-500/10';
		else {
			result += ' bg-app-surface';
			if (getToneSurfaceClass(task.color)) result += ' kainbu-tone-surface';
			if (isDiffMode) result += ' border border-app-border grayscale opacity-50';
			else if (isLinkAnchor) result += ' z-[2] border-2 border-app-primary';
			else if (isLinkClusterMember) result += ' z-[2] border-2 border-app-accent';
			else if (isReferenceHighlight) result += ' border-2 border-app-accent';
			else result += ' border border-app-border';
		}

		if (task.checked && !options?.linkDimmed) result += ' opacity-70';

		return result;
	};

	const toggleDiffTaskDetails = (taskId: string) => {
		expandedDiffTaskId = expandedDiffTaskId === taskId ? null : taskId;
	};

	const taskHasDescriptionDiff = (task: DiffTask) =>
		(task._originalTask?.description || '').trim() !== (task.description || '').trim();

	const taskDescriptionChangeLabel = (task: DiffTask) => {
		const previous = (task._originalTask?.description || '').trim();
		const next = (task.description || '').trim();
		if (!previous && next) return 'Description added';
		if (previous && !next) return 'Description removed';
		return 'Description changed';
	};

	const taskDescriptionDiffParts = (task: DiffTask) =>
		diffWords(task._originalTask?.description || '', task.description || '');

	const diffStatusLabel = (task: DiffTask) => {
		if (task._status === 'added') return 'Inserted card';
		if (task._status === 'removed') return 'Deleted card';
		if (taskHasVisibleProposalDiff(task)) return 'Edited card';
		return '';
	};

	const diffStatusClasses = (task: DiffTask) => {
		if (task._status === 'added') {
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
		}

		if (task._status === 'removed') {
			return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
		}

		if (taskHasVisibleProposalDiff(task)) {
			return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
		}

		return 'border-app-border bg-app-element/70 text-app-subtext';
	};

	const formatProposalTaskSnapshot = (task: Task | undefined) => {
		if (!task) return formatDiffTaskSnapshot(task);

		const lines = formatDiffTaskSnapshot(task).split('\n');
		if (task.assignedTo) {
			const assignedMember = members.find((member) => member.userId === task.assignedTo);
			const assignee = assignedMember
				? getProjectMemberDisplayName(assignedMember)
				: task.assignedTo;
			lines[4] = `Assignee: ${assignee}`;
		}
		if (getTaskDueAt(task) !== null) {
			lines[5] = `Due: ${formatTimingLabel(task)}`;
		}
		return lines.join('\n');
	};

	const formatDate = (timestamp?: number) =>
		timestamp
			? new Date(timestamp).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '';

	const formatTaskTimestamp = (timestamp?: number) =>
		timestamp ? formatDate(timestamp) : 'Unknown';

	const getTaskCompletedLabel = (task: Task) => {
		if (task.completedAt) return formatTaskTimestamp(task.completedAt);
		if (task.checked) return 'Checked (time not recorded)';
		return 'Not completed';
	};

	const isShadowItem = (value: unknown) =>
		Boolean((value as Record<string, unknown> | undefined)?.[SHADOW_ITEM_MARKER_PROPERTY_NAME]);

	const getDndKey = (value: { id: string }) => `${value.id}${isShadowItem(value) ? ':shadow' : ''}`;
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	onclick={handleWindowClick}
	onkeydown={handleWindowKeydown}
	onpointermove={scrollDragViewportIfNeeded}
	onresize={closeMenus}
/>

<div class:hidden={!active} class="absolute inset-0">
	<section class="absolute inset-0 flex overflow-hidden" data-kanban-board-root>
		{#if !showFullscreenTaskEditor}
			<div
				class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-1 lg:py-2"
			>
				{#if !isDiffMode}
					<div class="flex shrink-0 min-w-0 flex-col gap-2 overflow-hidden pb-2">
						<div class="flex min-w-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden">
							{#if showCollaborationChrome}
								<button
									type="button"
									class={`${boardToolbarPillClass} ${
										boardLayoutMode === 'link-groups'
											? boardToolbarPillActiveClass
											: boardToolbarPillIdleClass
									}`}
									title="Link groups"
									aria-label="Link groups"
									aria-pressed={boardLayoutMode === 'link-groups'}
									onclick={toggleBoardLayoutMode}
								>
									<Network size={16} />
								</button>
								{#if showShareButton}
									<BoardViewersPill viewers={boardPresenceViewers} />
									<button
										type="button"
										class={`${boardToolbarPillClass} ${boardToolbarPillIdleClass}`}
										title="Share board"
										aria-label="Share board"
										onclick={() => {
											shareModalOpen = true;
										}}
									>
										<Link2 size={16} />
									</button>
								{/if}
								{#if !isMobile}
									<button
										type="button"
										class={`${boardToolbarPillClass} ${
											boardSearchActive
												? boardToolbarPillActiveClass
												: boardToolbarPillIdleClass
										}`}
										title="Search cards (Ctrl+F)"
										aria-label="Search cards"
										aria-pressed={boardSearchActive}
										onclick={() => {
											if (boardSearchActive) {
												closeBoardSearch();
												return;
											}
											void openBoardSearch();
										}}
									>
										<Search size={16} />
									</button>
								{/if}
							{/if}
							{#if showCollaborationChrome}
								<button
									type="button"
									class={`${boardToolbarPillClass} ${
										boardOptionsOpen
											? boardToolbarPillActiveClass
											: boardToolbarPillIdleClass
									}`}
									title="Board options"
									aria-label="Board options"
									aria-expanded={boardOptionsOpen}
									onclick={() => {
										closeMenus();
										boardOptionsOpen = true;
									}}
								>
									<Settings2 size={16} />
								</button>
							{/if}
							{#if linkViewAnchorId}
								<button
									type="button"
									class={`${boardToolbarPillClass} ${boardToolbarPillIdleClass}`}
									title="Clear link view"
									aria-label="Clear link view"
									onclick={clearLinkView}
								>
									<Unlink size={16} />
								</button>
							{/if}
						</div>
						{#if !isMobile}
							<div
								class={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
									boardSearchActive ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
								}`}
							>
								<div class="overflow-hidden">
									<div
										class="flex min-w-0 items-center gap-1.5"
										class:pointer-events-none={!boardSearchActive}
										aria-hidden={!boardSearchActive}
									>
										<input
											bind:this={boardSearchInput}
											bind:value={boardSearchQuery}
											type="search"
											tabindex={boardSearchActive ? 0 : -1}
											class="w-full min-w-0 rounded-full border border-app-border bg-app-bg px-3 py-1.5 text-[11px] text-app-text outline-none transition-opacity duration-200 placeholder:text-app-subtext/60 focus:border-app-primary/50 motion-reduce:transition-none {boardSearchActive
												? 'opacity-100'
												: 'opacity-0'}"
											placeholder="Search title, description, tags…"
											aria-label="Search cards by title, description, or tags"
											onkeydown={(event) => {
												if (event.key === 'Escape') {
													event.preventDefault();
													closeBoardSearch();
												}
											}}
										/>
										<button
											type="button"
											tabindex={boardSearchActive ? 0 : -1}
											class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-app-subtext transition hover:bg-app-element hover:text-app-text"
											title="Close search"
											aria-label="Close search"
											onclick={closeBoardSearch}
										>
											<X size={14} />
										</button>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}
				<div
					bind:this={boardScrollViewport}
					class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
					onscroll={handleMenuViewportScroll}
				>
					{#if !isDiffMode}
						<div class="flex h-full min-w-max items-start gap-3">
							<div
								class="flex h-full min-w-max items-start gap-3"
								use:dragHandleZone={{
									items: boardLayoutMode === 'link-groups' ? [] : boardData,
									type: 'column',
									flipDurationMs,
									dragDisabled:
										isLocked || boardLayoutMode === 'link-groups' || boardSearchFiltering,
									delayTouchStart: true,
									dropTargetStyle: dndDropTargetStyle
								}}
								onconsider={(event) => handleColumnDnd(event as CustomEvent)}
								onfinalize={(event) => handleColumnDnd(event as CustomEvent)}
							>
								{#each visibleDisplayColumns as column (getDndKey(column))}
									<div
										animate:flip={{ duration: flipDurationMs }}
										data-is-dnd-shadow-item-hint={isShadowItem(column)}
										class={`flex max-h-full min-h-44 shrink-0 flex-col self-start overflow-hidden rounded-lg border bg-app-column ${getToneSurfaceClass(column.color)} ${
											column.isLinkGroup
												? 'border-app-primary/35 ring-1 ring-app-primary/15'
												: 'border-app-border'
										}`}
										style={getBoardColumnStyle(column)}
									>
										<div
											class={column.isLinkGroup
												? `${COLUMN_HEADER_BASE_CLASS} py-1.5 lg:min-h-12 lg:py-2`
												: COLUMN_HEADER_COMPACT_CLASS}
										>
											<div class="min-w-0 flex-1">
												{#if editingColumnId === column.id}
													<div class="flex min-w-0 items-center">
														<input
															bind:value={editingColumnTitle}
															class="w-full rounded-md border border-app-primary/40 bg-app-bg px-1.5 py-0.5 text-[13px] font-medium leading-snug text-app-text outline-none"
															onclick={(event) => event.stopPropagation()}
															onblur={() => renameColumn(column.id, editingColumnTitle)}
															onkeydown={(event) => {
																if (event.key === 'Enter')
																	renameColumn(column.id, editingColumnTitle);
																if (event.key === 'Escape') editingColumnId = null;
															}}
														/>
													</div>
												{:else if column.isLinkGroup}
													<div class="flex min-w-0 items-center gap-1.5 text-left">
														<div class="min-w-0 flex-1">
															<div class="flex min-w-0 items-center gap-1.5">
																<h3
																	class="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-app-text"
																>
																	{column.title}
																</h3>
																<span
																	class={COLUMN_TASK_COUNT_CLASS}
																	aria-label="{column.tasks.length} cards"
																>
																	{column.tasks.length}
																</span>
															</div>
															{#if column.linkGroupSubtitle}
																<p class="truncate text-[11px] leading-tight text-app-subtext">
																	{column.linkGroupSubtitle}
																</p>
															{/if}
															<p class="text-[10px] text-app-subtext">View only</p>
														</div>
													</div>
												{:else}
													<div
														use:dragHandle
														aria-label={`Drag column ${column.title}`}
														class="flex min-h-0 min-w-0 cursor-grab items-center gap-1.5 text-left active:cursor-grabbing"
													>
														<h3
															class="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-app-text"
														>
															{column.title}
														</h3>
														<span
															class={COLUMN_TASK_COUNT_CLASS}
															aria-label="{column.tasks.length} cards"
														>
															{column.tasks.length}
														</span>
													</div>
												{/if}
											</div>

											{#if !column.isLinkGroup}
												<div class="relative flex shrink-0 items-center">
													<button
														type="button"
														class={`${COLUMN_HEADER_ACTION_CLASS} ${
															isMobile ? 'min-h-10 min-w-10 rounded-lg p-2.5' : 'h-6 w-6'
														}`}
														onclick={async (event) => {
															event.stopPropagation();
															await addTask(column.id, 'top');
														}}
													>
														<Plus size={isMobile ? 18 : 14} />
													</button>
													<button
														type="button"
														class={`${COLUMN_HEADER_ACTION_CLASS} ${
															isMobile ? 'min-h-10 min-w-10 rounded-lg p-2.5' : 'h-6 w-6'
														}`}
														onclick={(event) => {
															event.stopPropagation();
															void toggleColumnMenu(
																column.id,
																event.currentTarget as HTMLButtonElement
															);
														}}
													>
														<Ellipsis size={isMobile ? 18 : 14} />
													</button>
												</div>
											{/if}
										</div>

										<div
												data-column-viewport={column.id}
												class="kainbu-scrollbar-hidden flex min-h-0 flex-auto flex-col gap-1.5 overflow-y-auto p-2"
												use:dndzone={{
													items: column.tasks,
													type: 'task',
													flipDurationMs: 0,
													dragDisabled:
														isLocked || Boolean(column.isLinkGroup) || boardSearchFiltering,
													delayTouchStart: isMobile ? 220 : true,
													morphDisabled: true,
													centreDraggedOnCursor: isMobile,
													useCursorForDetection: true,
													dropAnimationDisabled: true,
													dropTargetStyle: dndDropTargetStyle
												}}
												onscroll={handleMenuViewportScroll}
												onconsider={(event) => {
													if (column.isLinkGroup) return;
													handleTaskDnd(column.id, event as CustomEvent, 'consider');
												}}
												onfinalize={(event) => {
													if (column.isLinkGroup) return;
													handleTaskDnd(column.id, event as CustomEvent, 'finalize');
													bumpLinkOverlay();
												}}
											>
												{#each column.tasks as task (getDndKey(task))}
														{@const taskColumnId = getTaskColumnId(task.id, column.id)}
														{@const isLinkDimmedCard =
															Boolean(linkViewAnchorId) &&
															!isDiffMode &&
															!linkViewComponentIds.has(task.id)}
														{@const isLinkClusterCard =
															Boolean(linkViewAnchorId) &&
															!isDiffMode &&
															linkViewComponentIds.has(task.id)}
														{@const isLinkHighlightedCard =
															isLinkClusterCard || linkViewAnchorId === task.id}
														<div
															data-is-dnd-shadow-item-hint={isShadowItem(task)}
															data-task-id={task.id}
															class={[
																cardClasses(task as DiffTask, { linkDimmed: isLinkDimmedCard }),
																isLinkDimmedCard &&
																	'!opacity-[0.35] saturate-[0.4] brightness-[0.78] hover:!opacity-[0.5] hover:!translate-y-0 hover:!shadow-none'
															]
																.filter(Boolean)
																.join(' ')}
															style={getTaskCardStyle(task as DiffTask, isLinkHighlightedCard)}
															role="button"
															tabindex="0"
															onclick={() => handleTaskCardActivate(column, task)}
															onkeydown={(event) => {
																if (event.key === 'Enter' || event.key === ' ') {
																	event.preventDefault();
																	handleTaskCardActivate(column, task);
																}
															}}
														>
															<div class="flex items-start gap-2">
																{#if task.hasCheckbox}
																	<button
																		type="button"
																		class="mt-0.5 text-app-subtext transition hover:text-app-primary"
																		onclick={(event) => {
																			event.stopPropagation();
																			toggleChecked(taskColumnId, task.id);
																		}}
																	>
																		{#if task.checked}
																			<CheckSquare size={17} />
																		{:else}
																			<Square size={17} />
																		{/if}
																	</button>
																{/if}

																<div class="min-w-0 flex-1">
																	{#if editingTaskTitle?.columnId === taskColumnId && editingTaskTitle?.taskId === task.id}
																		<textarea
																			bind:this={taskTitleInput}
																			bind:value={editingTaskTitleValue}
																			rows={1}
																			class={[
																				'kainbu-task-title-inline-edit',
																				task.checked ? 'opacity-70' : ''
																			]
																				.filter(Boolean)
																				.join(' ')}
																			onclick={(event) => event.stopPropagation()}
																			oninput={() => syncTaskTitleInputHeight()}
																			onblur={saveTaskTitleEdit}
																			onkeydown={(event) => {
																				event.stopPropagation();
																				if (event.key === 'Enter' && !event.shiftKey) {
																					event.preventDefault();
																					saveTaskTitleEdit();
																				}
																				if (event.key === 'Escape') cancelTaskTitleEdit();
																			}}
																		></textarea>
																	{:else}
																		<div class="flex min-w-0 items-start gap-1">
																			<div
																				class="min-w-0 flex-1 cursor-text rounded-md"
																				role="presentation"
																				onclick={(event) => event.stopPropagation()}
																				ondblclick={(event) => {
																					event.stopPropagation();
																					void startTaskTitleEdit(taskColumnId, task);
																				}}
																				onpointerup={(event) =>
																					handleTaskTitlePointerUp(
																						event as PointerEvent,
																						taskColumnId,
																						task
																					)}
																			>
																				<RichText
																					value={getRenderedTaskTitle(task)}
																					className={`kainbu-prose prose-tight text-sm font-medium ${task.checked ? 'opacity-70' : ''}`}
																					onCheckboxToggle={isLocked
																						? undefined
																						: (index, checked) =>
																								toggleTaskTitleCheckbox(
																									taskColumnId,
																									task.id,
																									index,
																									checked
																								)}
																				/>
																			</div>
																			{#if task.description?.trim()}
																				<FileText
																					size={13}
																					class="mt-0.5 shrink-0 text-app-subtext/45"
																					title="Has description"
																					aria-label="Has description"
																				/>
																			{/if}
																		</div>
																	{/if}
																	{#if column.isLinkGroup && column.taskColumnTitles?.[task.id]}
																		<p class="mt-1 text-[10px] text-app-subtext">
																			{column.taskColumnTitles[task.id]}
																		</p>
																	{/if}
																</div>
															</div>

															{#if task.tags?.length || getTaskLinkCount(task) > 0}
																<div class="mt-1.5 flex flex-wrap gap-1">
																	{#if getTaskLinkCount(task) > 0}
																		<span
																			class="inline-flex items-center gap-0.5 rounded-md border border-app-primary/30 bg-app-primary/10 px-1 py-px text-[10px] font-medium leading-tight text-app-primary"
																		>
																			<Link2 size={10} />
																			{getTaskLinkCount(task)}
																			{getTaskLinkCount(task) === 1 ? 'link' : 'links'}
																		</span>
																	{/if}
																	{#each task.tags || [] as tag (tag.id)}
																		<span class={getTagToneClasses(tag.color)}>
																			{tag.label}
																		</span>
																	{/each}
																</div>
															{/if}

															{#if getTaskDueAt(task) !== null}
																<div class="mt-1.5 flex flex-wrap gap-1">
																	<span
																		class="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-surface/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-app-subtext"
																	>
																		<Clock3 size={12} />
																		{formatTimingLabel(task)}
																	</span>
																</div>
															{/if}

															<div
																class="mt-2 flex items-center justify-between gap-2 border-t border-app-border/70 pt-1.5"
															>
																<div
																	class="min-w-0 flex items-center gap-2 text-[9px] text-app-subtext"
																>
																	{#if isCollaborative}
																		<div class="relative">
																			{#if task.assignedTo && getAssignedMember(task)}
																				{@const assignedMember = getAssignedMember(task)}
																				<button
																					type="button"
																					class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg transition hover:ring-2 hover:ring-app-primary/25"
																					aria-label={`Assigned to ${getMemberLabel(assignedMember!)}`}
																					title={`Assigned to ${getMemberLabel(assignedMember!)}`}
																					onclick={(event) => {
																						event.stopPropagation();
																						void toggleAssignMenu(
																							taskColumnId,
																							task.id,
																							event.currentTarget as HTMLButtonElement
																						);
																					}}
																				>
																					<UserAvatar
																						src={getMemberAvatarUrl(assignedMember)}
																						initials={assignedMember
																							? getMemberAvatarInitials(assignedMember)
																							: '??'}
																						label={assignedMember
																							? getMemberLabel(assignedMember)
																							: 'Assignee'}
																						size="base"
																						variant="primary"
																					/>
																				</button>
																			{:else}
																				<button
																					type="button"
																					aria-label="Assign"
																					class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-dashed border-app-border text-app-subtext transition hover:border-app-primary/40 hover:text-app-primary"
																					onclick={(event) => {
																						event.stopPropagation();
																						void toggleAssignMenu(
																							taskColumnId,
																							task.id,
																							event.currentTarget as HTMLButtonElement
																						);
																					}}
																				>
																					<UserPlus size={12} />
																				</button>
																			{/if}
																		</div>
																	{/if}
																</div>

																<div
																	class="group/task-actions flex items-center touch-manipulation"
																	onpointerdown={(event) => event.stopPropagation()}
																	onclick={(event) => event.stopPropagation()}
																>
																	<div
																		class={`flex items-center ${
																			isMobile
																				? ''
																				: 'w-0 overflow-hidden opacity-0 transition-all duration-150 group-hover/task-actions:w-auto group-hover/task-actions:opacity-100'
																		}`}
																	>
																		<div class="relative">
																			<button
																				type="button"
																				class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
																					isMobile
																						? 'min-h-8 min-w-8 rounded-lg p-1.5'
																						: 'rounded-md p-1.5'
																				}`}
																				title="Quick tags"
																				onclick={(event) => {
																					event.stopPropagation();
																					void toggleTaskTagMenu(
																						taskColumnId,
																						task.id,
																						event.currentTarget as HTMLButtonElement
																					);
																				}}
																			>
																				<TagIcon size={16} />
																			</button>
																		</div>
																		<button
																			type="button"
																			class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
																				isMobile
																					? 'min-h-8 min-w-8 rounded-lg p-1.5'
																					: 'rounded-md p-1.5'
																			}`}
																			title="Copy title"
																			aria-label="Copy title"
																			onclick={(event) => {
																				event.stopPropagation();
																				void copyTaskTitle(taskColumnId, task.id);
																			}}
																		>
																			<Copy size={16} />
																		</button>
																	</div>

																	<div class="relative">
																		<button
																			type="button"
																			class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
																				isMobile
																					? 'min-h-8 min-w-8 rounded-lg p-1.5'
																					: 'rounded-md p-1.5'
																			}`}
																			title="More actions"
																			aria-label="More actions"
																			onclick={(event) => {
																				event.stopPropagation();
																				void toggleTaskMenu(
																					taskColumnId,
																					task.id,
																					event.currentTarget as HTMLButtonElement
																				);
																			}}
																		>
																			<Ellipsis size={16} />
																		</button>
																	</div>
																</div>
															</div>
														</div>
												{/each}
										</div>
									</div>
								{/each}
								{#if boardLayoutMode === 'columns'}
									<button
										type="button"
										class="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-dashed border-app-border bg-app-surface/40 px-4 py-2.5 text-sm font-semibold text-app-subtext transition hover:border-app-primary/40 hover:text-app-primary"
										onclick={addColumn}
									>
										<Plus size={16} />
										Add column
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<div class="flex h-full min-w-max gap-3">
						{#each visibleDiffData as column (column.id)}
							<div
								class={`flex max-h-full min-h-44 shrink-0 flex-col self-start overflow-hidden rounded-lg border bg-app-column ${
									column._status === 'unchanged' ? getToneSurfaceClass(column.color) : ''
								} ${
									column._status === 'added'
										? 'border-emerald-500/40'
										: column._status === 'removed'
											? 'border-rose-500/40'
											: column._status === 'modified'
												? 'border-amber-500/40'
												: 'border-app-border'
								}`}
								style={column._status === 'unchanged'
									? getBoardColumnStyle(column)
									: getColumnLayoutStyle(column)}
							>
								<div
									class={`${COLUMN_HEADER_COMPACT_CLASS} ${column._status === 'unchanged' ? 'grayscale opacity-50' : ''}`}
								>
									<div class="flex min-w-0 items-center gap-1.5">
										<h3
											class="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-app-text"
										>
											{column.title}
										</h3>
										<span class={COLUMN_TASK_COUNT_CLASS} aria-label="{column.tasks.length} cards">
											{column.tasks.length}
										</span>
									</div>
								</div>

								<div class="kainbu-scrollbar-hidden min-h-0 flex-auto overflow-y-auto p-2.5">
									<div class="flex flex-col gap-2.5">
										{#each column.tasks as task (task.id)}
											<button
												type="button"
												class={`${cardClasses(task)} w-full text-left ${
													taskHasDescriptionDiff(task)
														? 'cursor-pointer hover:border-app-primary/35'
														: 'cursor-default'
												}`}
												style={getTaskStyle(task)}
												onclick={() => {
													if (taskHasDescriptionDiff(task)) {
														toggleDiffTaskDetails(task.id);
													}
												}}
											>
												<div class="mb-3 flex items-start gap-3">
													{#if task.hasCheckbox}
														<div class="mt-0.5 text-app-subtext">
															{#if task.checked}
																<CheckSquare size={18} />
															{:else}
																<Square size={18} />
															{/if}
														</div>
													{/if}
													<div class="min-w-0 flex-1">
														{#if diffStatusLabel(task)}
															<div class="mb-2">
																<span
																	class={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${diffStatusClasses(task)}`}
																>
																	{diffStatusLabel(task)}
																</span>
															</div>
														{/if}
														<RichText
															value={getRenderedTaskTitle(task)}
															className={`kainbu-prose prose-tight text-sm font-medium ${task.checked ? 'opacity-70' : ''}`}
														/>
														{#if taskHasDescriptionDiff(task)}
															<div
																class="mt-1 inline-flex items-center gap-1 text-[10px] text-app-subtext"
															>
																<FileText size={13} />
																<span>{taskDescriptionChangeLabel(task)}. Click to inspect.</span>
															</div>
														{/if}
													</div>
												</div>

												{#if task.tags?.length}
													<div class="flex flex-wrap gap-1.5">
														{#each task.tags as tag (tag.id)}
															<span class={getTagToneClasses(tag.color)}>
																{tag.label}
															</span>
														{/each}
													</div>
												{/if}

												{#if getTaskDueAt(task) !== null}
													<div class="mt-2 flex flex-wrap gap-1.5">
														<span
															class="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext"
														>
															<Clock3 size={11} />
															{formatTimingLabel(task)}
														</span>
													</div>
												{/if}

												{#if taskHasVisibleProposalDiff(task)}
													<div class="mt-3 grid gap-2 lg:grid-cols-2">
														<div class="rounded-lg border border-app-border bg-app-bg/55 p-3">
															<p
																class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext"
															>
																Before
															</p>
															<div
																class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-app-subtext"
															>
																{formatProposalTaskSnapshot(task._originalTask)}
															</div>
														</div>
														<div class="rounded-lg border border-app-border bg-app-bg/55 p-3">
															<p
																class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext"
															>
																After
															</p>
															<div
																class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-app-text"
															>
																{formatProposalTaskSnapshot(task)}
															</div>
														</div>
													</div>
												{/if}

												{#if taskHasDescriptionDiff(task) && expandedDiffTaskId === task.id}
													<div class="mt-3 rounded-lg border border-app-border bg-app-bg/60 p-3">
														<p
															class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext"
														>
															Description Diff
														</p>
														<div
															class="max-h-56 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-app-text"
														>
															{#each taskDescriptionDiffParts(task) as part}
																{#if part.added}
																	<span class="rounded bg-emerald-500/15 px-0.5 text-emerald-200">
																		{part.value}
																	</span>
																{:else if part.removed}
																	<span
																		class="rounded bg-rose-500/15 px-0.5 text-rose-200 line-through opacity-70"
																	>
																		{part.value}
																	</span>
																{:else}
																	<span>{part.value}</span>
																{/if}
															{/each}
														</div>
													</div>
												{/if}
											</button>
										{/each}
									</div>
								</div>
							</div>
						{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if showDockedTaskEditor}
			<div
				data-task-editor-pane
				class="relative h-full min-w-0 shrink-0 border-l border-app-border bg-app-surface/96 shadow-kainbu-xl"
				style={`width:${taskEditorDockWidth}rem;`}
			>
				<div
					class="absolute left-0 top-0 z-60 h-full w-2 cursor-col-resize transition hover:bg-app-primary/20"
					onpointerdown={handleTaskEditorResizeStart}
				></div>
				<TaskModal
					task={editingTask!.task}
					{projectId}
					{colorMode}
					columns={boardData}
					{members}
					columnTitle={editingTask!.column.title}
					{existingTags}
					{onAddAttachments}
					desktopLayoutMode={desktopTaskEditorLayoutMode}
					onDesktopLayoutModeChange={setDesktopTaskEditorLayoutMode}
					presentation="pane"
					onClose={() => (editingTask = null)}
					onSave={(nextTask, options) => {
						updateTask(editingTask!.column.id, editingTask!.task.id, () => nextTask, options);
					}}
					onTaskReferenceNavigate={handleTaskReferenceNavigation}
					onUnlinkLinkedTask={handleUnlinkLinkedTask}
				/>
			</div>
		{:else if showFullscreenTaskEditor}
			<div class="relative h-full min-w-0 flex-1 bg-app-surface">
				<TaskModal
					task={editingTask!.task}
					{projectId}
					{colorMode}
					columns={boardData}
					{members}
					columnTitle={editingTask!.column.title}
					{existingTags}
					{onAddAttachments}
					desktopLayoutMode={desktopTaskEditorLayoutMode}
					onDesktopLayoutModeChange={setDesktopTaskEditorLayoutMode}
					presentation="pane"
					onClose={() => (editingTask = null)}
					onSave={(nextTask, options) => {
						updateTask(editingTask!.column.id, editingTask!.task.id, () => nextTask, options);
					}}
					onTaskReferenceNavigate={handleTaskReferenceNavigation}
					onUnlinkLinkedTask={handleUnlinkLinkedTask}
				/>
			</div>
		{/if}
	</section>

	{#if openColumnMenu}
		{@const menuColumn = boardData.find((column) => column.id === openColumnMenu!.columnId)}
		{#if menuColumn}
			{@const currentColumnTone =
				SURFACE_TONE_OPTIONS.find((t) => t.value === (menuColumn.color || '')) ??
				SURFACE_TONE_OPTIONS[0]}
			<div class="pointer-events-none fixed inset-0 z-[140]" use:portalToBody>
				<button
					type="button"
					class="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
					aria-label="Close column menu"
					onpointerdown={(event) => event.stopPropagation()}
					onclick={closeMenusFromBackdrop}
				></button>
				<div
					role="presentation"
					data-column-menu
					class="pointer-events-auto fixed w-60 max-h-[calc(100vh-1.5rem)] overflow-y-auto kainbu-context-menu rounded-lg"
					style={`top:${openColumnMenu!.position.top}px; left:${openColumnMenu!.position.left}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					<div
						role="group"
						aria-label={`Width controls for ${menuColumn.title}`}
						class="px-2 py-1.5"
					>
						<div class="mb-1.5 flex items-center gap-2 text-[11px] text-app-subtext">
							<RectangleHorizontal size={13} class="shrink-0" />
							<span class="flex-1">Width</span>
							<span class="tabular-nums text-app-text">{getColumnWidth(menuColumn)}px</span>
						</div>
						<input
							type="range"
							min={MIN_COLUMN_WIDTH}
							max={MAX_COLUMN_WIDTH}
							step="4"
							value={getColumnWidth(menuColumn)}
							class="h-1 w-full accent-[var(--color-app-primary)]"
							onclick={(event) => event.stopPropagation()}
							oninput={(event) =>
								setColumnWidth(
									menuColumn.id,
									Number((event.currentTarget as HTMLInputElement).value)
								)}
						/>
						<div class="mt-1.5 flex items-center gap-1">
							<button
								type="button"
								class="flex h-7 flex-1 items-center justify-center rounded-md border border-app-border/60 text-app-subtext transition hover:border-app-primary/35 hover:bg-app-element hover:text-app-text active:scale-[0.98]"
								title="Narrower"
								aria-label="Narrower column"
								onclick={(event) => {
									event.stopPropagation();
									setColumnWidth(menuColumn.id, getColumnWidth(menuColumn) - 24);
								}}
							>
								<ArrowLeft size={14} />
							</button>
							<button
								type="button"
								class="flex h-7 flex-1 items-center justify-center rounded-md border border-app-border/60 text-app-subtext transition hover:border-app-primary/35 hover:bg-app-element hover:text-app-text active:scale-[0.98]"
								title="Reset width"
								aria-label="Reset column width"
								onclick={(event) => {
									event.stopPropagation();
									setColumnWidth(menuColumn.id, DEFAULT_COLUMN_WIDTH);
								}}
							>
								<RotateCcw size={14} />
							</button>
							<button
								type="button"
								class="flex h-7 flex-1 items-center justify-center rounded-md border border-app-border/60 text-app-subtext transition hover:border-app-primary/35 hover:bg-app-element hover:text-app-text active:scale-[0.98]"
								title="Wider"
								aria-label="Wider column"
								onclick={(event) => {
									event.stopPropagation();
									setColumnWidth(menuColumn.id, getColumnWidth(menuColumn) + 24);
								}}
							>
								<ArrowRight size={14} />
							</button>
						</div>
					</div>

					<div class="kainbu-menu-divider">
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								columnTonePickerOpen = !columnTonePickerOpen;
							}}
						>
							<Palette size={14} />
							<span
								class={`h-3.5 w-3.5 shrink-0 rounded-full border ${currentColumnTone.swatchClass}`}
							></span>
							<span class="min-w-0 flex-1 truncate">Tone</span>
							<span class="truncate text-[11px] text-app-subtext">{currentColumnTone.label}</span>
							<ChevronDown
								size={12}
								class={`shrink-0 text-app-subtext transition ${columnTonePickerOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if columnTonePickerOpen}
							<div role="group" class="grid grid-cols-5 place-items-center gap-1.5 px-2 pb-1.5">
								{#each SURFACE_TONE_OPTIONS as tone}
									<button
										type="button"
										aria-label={`Set ${menuColumn.title} tone to ${tone.label}`}
										title={tone.label}
										class={`h-6 w-6 rounded-full border p-0 transition ${tone.swatchClass} ${
											(menuColumn.color || '') === tone.value
												? 'scale-105 border-white/80 ring-2 ring-app-primary/45'
												: 'hover:scale-105 hover:border-app-primary/35'
										}`}
										onclick={(event) => {
											event.stopPropagation();
											setColumnColor(menuColumn.id, tone.value);
											columnTonePickerOpen = false;
										}}
									></button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="kainbu-menu-divider">
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								editingColumnId = menuColumn.id;
								editingColumnTitle = menuColumn.title;
								openColumnMenu = null;
							}}
						>
							<Pencil size={14} />
							Rename
						</button>
					</div>

					<div class="kainbu-menu-divider">
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								copyColumnAsMarkdown(menuColumn.id);
							}}
						>
							<ClipboardCopy size={14} />
							Copy as Markdown
						</button>
					</div>

					<div class="kainbu-menu-divider">
						<button
							type="button"
							class="kainbu-menu-item kainbu-menu-item--danger"
							onclick={(event) => {
								event.stopPropagation();
								deleteColumn(menuColumn.id);
							}}
						>
							<Trash2 size={14} />
							Delete
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	{#if openTaskMenu}
		{@const menuColumn = boardData.find((column) => column.id === openTaskMenu!.colId)}
		{@const menuTask = menuColumn?.tasks.find((task) => task.id === openTaskMenu!.taskId)}
		{#if menuColumn && menuTask}
			<div class="pointer-events-none fixed inset-0 z-[150]" use:portalToBody>
				<button
					type="button"
					class="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
					aria-label="Close task menu"
					onpointerdown={(event) => event.stopPropagation()}
					onclick={closeMenusFromBackdrop}
				></button>
				<div
					bind:this={taskMenuPanel}
					role="presentation"
					data-task-menu
					class="pointer-events-auto fixed w-56 max-h-[calc(100vh-1.5rem)] overflow-y-auto kainbu-context-menu rounded-lg {openTaskMenu!.opensAbove
						? 'kainbu-context-menu--opens-above'
						: ''}"
					style={`top:${openTaskMenu!.position.top}px; left:${openTaskMenu!.position.left}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					<div class="kainbu-menu-quick-grid" role="group" aria-label="Quick actions">
						<button
							type="button"
							class="kainbu-menu-quick-btn"
							title="Edit Card"
							aria-label="Edit Card"
							onclick={(event) => {
								event.stopPropagation();
								editingTask = { column: menuColumn, task: menuTask };
								closeMenus();
							}}
						>
							<Pencil size={15} />
						</button>
						<button
							type="button"
							class="kainbu-menu-quick-btn"
							title="Card info"
							aria-label="Card info"
							onclick={(event) => {
								event.stopPropagation();
								void openTaskInfoFromTaskMenu(menuColumn.id, menuTask.id);
							}}
						>
							<Info size={15} />
						</button>
						<button
							type="button"
							class="kainbu-menu-quick-btn"
							title="Copy Title"
							aria-label="Copy Title"
							onclick={(event) => {
								event.stopPropagation();
								copyTaskTitle(menuColumn.id, menuTask.id);
							}}
						>
							<Copy size={15} />
						</button>
						<button
							type="button"
							class="kainbu-menu-quick-btn"
							title="Toggle Checkbox"
							aria-label="Toggle Checkbox"
							onclick={(event) => {
								event.stopPropagation();
								toggleCheckbox(menuColumn.id, menuTask.id);
							}}
						>
							{#if menuTask.checked}
								<CheckSquare size={15} />
							{:else}
								<Square size={15} />
							{/if}
						</button>
					</div>

					<div class="kainbu-menu-divider pt-1">
						<p class="kainbu-menu-section-label">Links</p>
						<button
							type="button"
							class="kainbu-menu-item {linkViewAnchorId === menuTask.id
								? 'kainbu-menu-item--primary'
								: ''}"
							disabled={isLocked || isDiffMode}
							onclick={(event) => {
								event.stopPropagation();
								toggleLinkView(menuTask.id);
								closeMenus();
							}}
						>
							<Link2 size={14} />
							View links
						</button>
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								void openTaskLinkPicker(
									menuColumn.id,
									menuTask.id,
									event.currentTarget as HTMLButtonElement
								);
							}}
						>
							<Link2 size={14} />
							Link to task…
						</button>
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								void createLinkedTaskFromMenu(menuColumn.id, menuTask.id);
							}}
						>
							<Plus size={14} />
							Create linked task
						</button>
						{#if normalizeLinkedTaskIds(menuTask.linkedTaskIds).length || getDescriptionReferencedPlacements(boardData, menuTask.id).length}
							{#each getExplicitLinkedTasks(boardData, menuTask.id) as linkedPlacement (linkedPlacement.task.id)}
								<button
									type="button"
									class="kainbu-menu-item"
									onclick={(event) => {
										event.stopPropagation();
										unlinkTaskFrom(menuTask.id, linkedPlacement.task.id);
										closeMenus();
									}}
								>
									<Unlink size={14} />
									<span class="truncate">Unlink {linkedPlacement.task.title}</span>
								</button>
							{/each}
							{#each getDescriptionReferencedPlacements(boardData, menuTask.id) as linkedPlacement (linkedPlacement.task.id)}
								<button
									type="button"
									class="kainbu-menu-item"
									onclick={(event) => {
										event.stopPropagation();
										removeDescriptionReference(menuTask.id, linkedPlacement.task.id);
									}}
								>
									<Unlink size={14} />
									<span class="truncate">Remove ref to {linkedPlacement.task.title}</span>
								</button>
							{/each}
						{/if}
					</div>

					<div class="kainbu-menu-divider pt-1">
						<p class="kainbu-menu-section-label">AI</p>
						<button
							type="button"
							class="kainbu-menu-item kainbu-menu-item--accent"
							disabled={rewritingTaskId === menuTask.id || !getRenderedTaskTitle(menuTask).trim()}
							onclick={(event) => {
								event.stopPropagation();
								void rewriteTaskTitleWithAi(menuColumn.id, menuTask.id);
							}}
						>
							{#if rewritingTaskId === menuTask.id}
								<LoaderCircle size={14} class="animate-spin" />
							{:else}
								<Sparkles size={14} />
							{/if}
							Rewrite with AI
						</button>
						<button
							type="button"
							class="kainbu-menu-item kainbu-menu-item--accent"
							onclick={(event) => {
								event.stopPropagation();
								onSendToChat({ task: menuTask, column: menuColumn });
								closeMenus();
							}}
						>
							<MessageSquarePlus size={14} />
							Send to Chat
						</button>
						{#if rewriteTaskError}
							<p class="px-2 py-1 text-[11px] leading-snug text-rose-300">{rewriteTaskError}</p>
						{/if}
					</div>

					<div class="kainbu-menu-divider pt-1">
						<p class="kainbu-menu-section-label">Move</p>
						{#if lastColumnMove && boardData.some((column) => column.id === lastColumnMove!.toColumnId)}
							<button
								type="button"
								class="kainbu-menu-item"
								disabled={menuColumn.id === lastColumnMove.toColumnId}
								title={`Move to ${getColumnTitle(lastColumnMove.toColumnId)}`}
								onclick={(event) => {
									event.stopPropagation();
									repeatLastColumnMove(menuColumn.id, menuTask.id);
								}}
							>
								<Repeat2 size={14} />
								<span class="truncate">
									Repeat last ({getColumnTitle(lastColumnMove.fromColumnId)} → {getColumnTitle(
										lastColumnMove.toColumnId
									)})
								</span>
							</button>
						{/if}
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								moveTaskToTop(menuColumn.id, menuTask.id);
							}}
						>
							<ArrowUpToLine size={14} />
							Send to Top
						</button>
						<button
							type="button"
							class="kainbu-menu-item"
							onclick={(event) => {
								event.stopPropagation();
								moveTaskToBottom(menuColumn.id, menuTask.id);
							}}
						>
							<ArrowDownToLine size={14} />
							Send to Bottom
						</button>
						<button
							type="button"
							class="kainbu-menu-item kainbu-menu-item--danger"
							onclick={(event) => {
								event.stopPropagation();
								deleteTask(menuColumn.id, menuTask.id);
							}}
						>
							<Trash2 size={14} />
							Delete Task
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	{#if assignMenuOpen}
		{@const assignColumn = boardData.find((column) => column.id === assignMenuOpen!.colId)}
		{@const assignTaskRow = assignColumn?.tasks.find((task) => task.id === assignMenuOpen!.taskId)}
		{#if assignColumn && assignTaskRow}
			<div class="pointer-events-none fixed inset-0 z-[145]" use:portalToBody>
				<button
					type="button"
					class="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
					aria-label="Close assign menu"
					onpointerdown={(event) => event.stopPropagation()}
					onclick={closeMenusFromBackdrop}
				></button>
				<div
					role="menu"
					tabindex="-1"
					data-assign-menu
					class="pointer-events-auto fixed max-h-[min(17.5rem,calc(100vh-1.5rem))] overflow-y-auto kainbu-context-menu rounded-lg"
					style={`top:${assignMenuOpen!.position.top}px; left:${assignMenuOpen!.position.left}px; width:${ASSIGN_MENU_WIDTH}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					{#each members as member (member.userId)}
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition {assignTaskRow.assignedTo ===
							member.userId
								? 'bg-app-primary/15 font-semibold text-app-primary'
								: 'text-app-text hover:bg-app-element'}"
							onclick={(event) => {
								event.stopPropagation();
								assignTask(
									assignColumn.id,
									assignTaskRow.id,
									assignTaskRow.assignedTo === member.userId ? undefined : member.userId
								);
							}}
						>
							<UserAvatar
								src={getMemberAvatarUrl(member)}
								initials={getMemberAvatarInitials(member)}
								label={getMemberLabel(member)}
								size="sm"
							/>
							<span class="truncate">{getMemberLabel(member)}</span>
							{#if member.isCurrentUser}
								<span class="text-[9px] text-app-subtext">(you)</span>
							{/if}
						</button>
					{/each}
					{#if assignTaskRow.assignedTo}
						<div class="mt-1 border-t border-app-border pt-1">
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-app-subtext transition hover:bg-app-element"
								onclick={(event) => {
									event.stopPropagation();
									assignTask(assignColumn.id, assignTaskRow.id, undefined);
								}}
							>
								Unassign
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}

	{#if taskInfoMenuOpen}
		{@const infoColumn = boardData.find((column) => column.id === taskInfoMenuOpen!.colId)}
		{@const infoTask = infoColumn?.tasks.find((task) => task.id === taskInfoMenuOpen!.taskId)}
		{#if infoColumn && infoTask}
			<div class="pointer-events-none fixed inset-0 z-[145]" use:portalToBody>
				<button
					type="button"
					class="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
					aria-label="Close card info"
					onpointerdown={(event) => event.stopPropagation()}
					onclick={closeMenusFromBackdrop}
				></button>
				<div
					role="dialog"
					aria-label="Card info"
					data-task-info-menu
					class="pointer-events-auto fixed kainbu-context-menu rounded-lg p-2.5"
					style={`top:${taskInfoMenuOpen!.position.top}px; left:${taskInfoMenuOpen!.position.left}px; width:${TASK_INFO_MENU_WIDTH}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					<p class="kainbu-menu-section-label mb-1.5">Card info</p>
					<dl class="space-y-1.5 px-0.5 text-[11px]">
						<div>
							<dt class="font-semibold text-app-subtext">Created</dt>
							<dd class="mt-0.5 text-app-text">{formatTaskTimestamp(infoTask.createdAt)}</dd>
						</div>
						<div>
							<dt class="font-semibold text-app-subtext">Updated</dt>
							<dd class="mt-0.5 text-app-text">{formatTaskTimestamp(infoTask.updatedAt)}</dd>
						</div>
						{#if infoTask.hasCheckbox}
							<div>
								<dt class="font-semibold text-app-subtext">Completed</dt>
								<dd class="mt-0.5 text-app-text">{getTaskCompletedLabel(infoTask)}</dd>
							</div>
						{/if}
					</dl>
				</div>
			</div>
		{/if}
	{/if}

	{#if taskTagMenuOpen}
		{@const menuColumn = boardData.find((column) => column.id === taskTagMenuOpen!.colId)}
		{@const menuTask = menuColumn?.tasks.find((task) => task.id === taskTagMenuOpen!.taskId)}
		{#if menuColumn && menuTask}
			<div class="pointer-events-none fixed inset-0 z-[145]" use:portalToBody>
				<button
					type="button"
					class="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
					aria-label="Close tag menu"
					onpointerdown={(event) => event.stopPropagation()}
					onclick={closeMenusFromBackdrop}
				></button>
				<div
					role="presentation"
					data-task-tag-menu
					class="pointer-events-auto fixed w-52 overflow-hidden kainbu-context-menu rounded-lg"
					style={`top:${taskTagMenuOpen!.position.top}px; left:${taskTagMenuOpen!.position.left}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					{#if taskTagMenuMode === 'create'}
						<div transition:fade={{ duration: 120 }}>
							<div class="flex items-center justify-between gap-2 px-1.5 pb-1 pt-0.5">
								<span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-subtext">
									New tag
								</span>
								<button
									type="button"
									class="inline-flex h-6 w-6 items-center justify-center rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text"
									aria-label="Back to tag list"
									onclick={(event) => {
										event.stopPropagation();
										closeTaskTagMenuCreate();
									}}
								>
									<X size={12} />
								</button>
							</div>
							<div class="px-1.5 pb-1.5">
								<div class="flex items-center gap-1.5 rounded-md border border-app-border bg-app-element/35 px-2 py-1.5 transition focus-within:border-app-primary/40">
									<TagIcon size={12} class="shrink-0 text-app-subtext" />
									<input
										bind:this={taskTagMenuCreateInput}
										bind:value={taskTagMenuNewLabel}
										class="min-w-0 flex-1 bg-transparent text-[11px] text-app-text outline-none placeholder:text-app-subtext/60"
										placeholder="Tag name"
										onkeydown={(event) => {
											if (event.key === 'Enter') {
												event.preventDefault();
												createTaskTagFromMenu(menuColumn.id, menuTask.id);
											}
											if (event.key === 'Escape') {
												event.preventDefault();
												closeTaskTagMenuCreate();
											}
										}}
									/>
									<span
										class={`inline-block h-3 w-3 shrink-0 rounded-sm border ${taskTagMenuNewColorSwatch.swatchClass}`}
										aria-hidden="true"
									></span>
								</div>
								<div class="mt-2 grid grid-cols-7 gap-1">
									{#each TAG_COLORS as color (color.value)}
										<button
											type="button"
											aria-label={`Select ${color.value.replace('tone:', '')} color`}
											title={color.value.replace('tone:', '')}
											class={`h-5 w-5 rounded-md border p-0 transition ${color.swatchClass} ${
												taskTagMenuNewColor === color.value
													? 'scale-110 border-white/80 ring-1 ring-app-primary/50'
													: 'hover:scale-105 hover:border-app-primary/35'
											}`}
											onclick={(event) => {
												event.stopPropagation();
												taskTagMenuNewColor = color.value;
											}}
										></button>
									{/each}
								</div>
								<button
									type="button"
									class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-app-primary px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
									disabled={!taskTagMenuNewLabel.trim()}
									onclick={(event) => {
										event.stopPropagation();
										createTaskTagFromMenu(menuColumn.id, menuTask.id);
									}}
								>
									<Plus size={11} />
									Add tag
								</button>
							</div>
						</div>
					{:else}
						<div transition:fade={{ duration: 120 }}>
							<div class="mb-1 flex h-7 items-center gap-1 px-0.5">
								<div
									class={`flex h-6 min-w-0 items-center overflow-hidden rounded-md transition-all duration-200 ease-out ${
										taskTagMenuSearchOpen
											? 'w-full border border-app-border bg-app-element/40 px-1.5'
											: 'w-6 border border-transparent bg-transparent'
									}`}
								>
									{#if taskTagMenuSearchOpen}
										<Search size={12} class="mr-1.5 shrink-0 text-app-subtext" />
										<input
											bind:this={taskTagMenuSearchInput}
											bind:value={taskTagMenuSearchQuery}
											class="min-w-0 flex-1 bg-transparent text-[11px] text-app-text outline-none placeholder:text-app-subtext/60"
											placeholder="Search tags"
											onkeydown={(event) => {
												if (event.key === 'Escape') {
													event.preventDefault();
													closeTaskTagMenuSearch();
												}
											}}
										/>
										<button
											type="button"
											class="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-app-subtext transition hover:bg-app-surface hover:text-app-text"
											aria-label="Close search"
											onclick={(event) => {
												event.stopPropagation();
												closeTaskTagMenuSearch();
											}}
										>
											<X size={10} />
										</button>
									{:else}
										<button
											type="button"
											class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text"
											aria-label="Search tags"
											onclick={(event) => {
												event.stopPropagation();
												void openTaskTagMenuSearch();
											}}
										>
											<Search size={12} />
										</button>
									{/if}
								</div>
								{#if !taskTagMenuSearchOpen}
									<button
										type="button"
										class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text"
										aria-label="Create tag"
										onclick={(event) => {
											event.stopPropagation();
											void openTaskTagMenuCreate();
										}}
									>
										<Plus size={12} />
									</button>
								{/if}
							</div>

							<div
								class="overflow-y-auto overscroll-contain px-0.5"
								style={`max-height:${TAG_MENU_LIST_MAX_HEIGHT}px;`}
							>
								{#if taskTagMenuFilteredTags.length}
									{#each taskTagMenuFilteredTags as quickTag (quickTag.id)}
										{@const hasTag = (menuTask.tags || []).some(
											(entry) =>
												entry.label.trim().toLowerCase() === quickTag.label.trim().toLowerCase()
										)}
										<button
											type="button"
											class={`mb-0.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition last:mb-0 ${
												hasTag ? 'bg-app-primary/12' : 'hover:bg-app-element'
											}`}
											onclick={(event) => {
												event.stopPropagation();
												toggleTaskTag(menuColumn.id, menuTask.id, quickTag);
											}}
										>
											<span class={`min-w-0 truncate ${getTagToneClasses(quickTag.color)}`}>
												{quickTag.label}
											</span>
											{#if hasTag}
												<Check size={10} class="ml-auto shrink-0 text-app-primary" />
											{/if}
										</button>
									{/each}
								{:else}
									<p class="px-2 py-3 text-center text-[11px] text-app-subtext">
										{taskTagMenuSearchQuery.trim() ? 'No matching tags' : 'No tags yet'}
									</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}

	{#if showOverlayTaskEditor}
		<TaskModal
			task={editingTask!.task}
			{projectId}
			{colorMode}
			columns={boardData}
			{members}
			columnTitle={editingTask!.column.title}
			{existingTags}
			{onAddAttachments}
			desktopLayoutMode={desktopTaskEditorLayoutMode}
			onDesktopLayoutModeChange={setDesktopTaskEditorLayoutMode}
			onClose={() => (editingTask = null)}
			onSave={(nextTask, options) => {
				updateTask(editingTask!.column.id, editingTask!.task.id, () => nextTask, options);
			}}
			onTaskReferenceNavigate={handleTaskReferenceNavigation}
			onUnlinkLinkedTask={handleUnlinkLinkedTask}
		/>
	{/if}

	<TaskLinkPicker
		open={Boolean(taskLinkPicker)}
		position={taskLinkPicker?.position || null}
		options={taskLinkPickerOptions}
		onSelect={(targetTaskId) => {
			if (!taskLinkPicker) return;
			linkTaskTo(taskLinkPicker.sourceTaskId, targetTaskId);
		}}
		onClose={() => {
			taskLinkPicker = null;
		}}
	/>

	<TaskLinkOverlay
		active={Boolean(linkViewAnchorId) && !isDiffMode && !isLocked}
		edges={linkOverlayEdges}
		redrawToken={linkOverlayRedrawToken}
	/>

	<BoardOptionsSheet
		open={boardOptionsOpen}
		preferences={boardPreferences}
		columns={boardData}
		onClose={() => (boardOptionsOpen = false)}
		onChange={(nextPreferences) => onBoardPreferencesChange(activeBoardId, nextPreferences)}
	/>

	<ShareBoardModal
		open={shareModalOpen}
		boardName={boardName}
		{shareSlug}
		{sharePublic}
		{isOwner}
		saving={shareSaving}
		errorMessage={shareErrorMessage}
		onClose={() => {
			shareModalOpen = false;
		}}
		onEnsureSlug={() => onShareSettingsChange({})}
		onSave={(nextSharePublic) => onShareSettingsChange({ sharePublic: nextSharePublic })}
	/>
</div>
