<script lang="ts">
	import { browser } from '$app/environment';
	import { flip } from 'svelte/animate';
	import { tick } from 'svelte';
	import {
		Check,
		ArrowDownToLine,
		CheckSquare,
		ChevronDown,
		ClipboardCopy,
		Clock3,
		Copy,
		Ellipsis,
		FileText,
		GripVertical,
		Info,
		Link2,
		LoaderCircle,
		MessageSquarePlus,
		Network,
		Plus,
		Repeat2,
		Search,
		Sparkles,
		Square,
		Tag as TagIcon,
		Trash2,
		Unlink,
		X
	} from 'lucide-svelte';
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
		SURFACE_TONE_OPTIONS
	} from '$lib/kainbu/constants';
	import {
		filterColumnsForBoardSearch,
		normalizeBoardSearchQuery
	} from '$lib/kainbu/boardSearch';
	import { rewriteTaskTitle } from '$lib/kainbu/ai';
	import { computeKanbanDiff, diffWords, type DiffColumn, type DiffTask } from '$lib/kainbu/diff';
	import { createId } from '$lib/kainbu/id';
	import { getProjectMemberDisplayName } from '$lib/kainbu/members';
	import {
		hasLeadingCardCheckboxLine,
		stripLeadingCardCheckboxLine,
		syncLeadingCardCheckboxLine,
		toggleMarkdownCheckbox
	} from '$lib/kainbu/taskMarkdown';
	import { getBoardPresenceViewers } from '$lib/kainbu/boardPresence';
	import { formatTimingLabel, getTaskDueAt } from '$lib/kainbu/timing';
	import BoardViewersPill from '$lib/components/BoardViewersPill.svelte';
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
		getColumnHeaderToneStyle,
		getColumnToneStyle,
		getTagToneClasses
	} from '$lib/kainbu/tags';
	import type {
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
	export let defaultShowCheckbox = true;
	export let active = true;
	export let members: ProjectMembership[] = [];
	export let activeBoardId = '';
	export let currentUserId = '';
	export let onChange: (nextData: KanbanData, options?: BoardChangeOptions) => void;
	export let onSendToChat: (payload: { task: Task; column: Column }) => void;
	export let onActiveTaskChange: (
		payload: { taskId?: string; columnId?: string } | null
	) => void = () => {};
	export let onTaskReferenceNavigate: (
		payload: { taskId: string; columnId: string }
	) => void = () => {};
	export let onAddAttachments: (attachments: ChatAttachment[]) => void = () => {};
	export let onDockedEditorChange: (isDocked: boolean) => void = () => {};
	export let boardSearchActive = false;
	export let boardSearchQuery = '';

	const flipDurationMs = 180;
	let viewportWidth = 0;
	let boardData: KanbanData = data;
	let lastEmittedData: KanbanData | null = null;

	let editingColumnId: string | null = null;
	let editingColumnTitle = '';
	let openColumnMenu: ColumnMenuState | null = null;
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
	let assignMenuOpen: { colId: string; taskId: string } | null = null;
	let taskTagMenuOpen: TaskMenuState | null = null;
	let taskInfoMenuOpen: TaskMenuState | null = null;
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
	const MENU_GAP = 8;
	const MENU_GUTTER = 12;
	const COLUMN_MENU_WIDTH = 288;
	const COLUMN_MENU_HEIGHT = 520;
	const TASK_MENU_WIDTH = 224;
	const TASK_MENU_HEIGHT = 420;
	const LINK_PICKER_WIDTH = 288;
	const LINK_PICKER_HEIGHT = 360;
	const TAG_MENU_WIDTH = 208;
	const TAG_MENU_HEIGHT = 280;
	const TASK_INFO_MENU_WIDTH = 232;
	const TASK_INFO_MENU_HEIGHT = 148;
	const TASK_INFO_MENU_HEIGHT_CHECKABLE = 188;
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
	$: if (data === lastEmittedData) {
		boardData = data;
		lastEmittedData = null;
	} else if (data !== boardData) {
		boardData = data;
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
	$: if (active && boardSearchActive && !priorBoardSearchActive) {
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
		columnTonePickerOpen = false;
		assignMenuOpen = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
		taskLinkPicker = null;
		rewriteTaskError = '';
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

	const openTaskLinkPicker = (
		columnId: string,
		taskId: string,
		trigger: HTMLButtonElement
	) => {
		taskLinkPicker = {
			sourceColId: columnId,
			sourceTaskId: taskId,
			position: getMenuPosition(trigger, LINK_PICKER_WIDTH, LINK_PICKER_HEIGHT)
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

		let top = rect.bottom + MENU_GAP;
		if (top + menuHeight > viewportHeight - MENU_GUTTER) {
			top = Math.max(MENU_GUTTER, rect.top - menuHeight - MENU_GAP);
		}

		return {
			top: Math.max(MENU_GUTTER, top),
			left
		};
	};

	const toggleColumnMenu = (columnId: string, trigger: HTMLElement) => {
		if (openColumnMenu?.columnId === columnId) {
			openColumnMenu = null;
			return;
		}

		openColumnMenu = {
			columnId,
			position: getMenuPosition(trigger, COLUMN_MENU_WIDTH, COLUMN_MENU_HEIGHT)
		};
		openTaskMenu = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
	};

	const toggleTaskMenu = (columnId: string, taskId: string, trigger: HTMLElement) => {
		if (openTaskMenu?.colId === columnId && openTaskMenu.taskId === taskId) {
			openTaskMenu = null;
			return;
		}

		openTaskMenu = {
			colId: columnId,
			taskId,
			position: getMenuPosition(trigger, TASK_MENU_WIDTH, TASK_MENU_HEIGHT)
		};
		openColumnMenu = null;
		taskTagMenuOpen = null;
		taskInfoMenuOpen = null;
	};

	const toggleTaskInfoMenu = (colId: string, taskId: string, trigger: HTMLElement) => {
		if (taskInfoMenuOpen?.colId === colId && taskInfoMenuOpen.taskId === taskId) {
			taskInfoMenuOpen = null;
			return;
		}

		const task = boardData.flatMap((column) => column.tasks).find((entry) => entry.id === taskId);
		const menuHeight = task?.hasCheckbox
			? TASK_INFO_MENU_HEIGHT_CHECKABLE
			: TASK_INFO_MENU_HEIGHT;

		taskInfoMenuOpen = {
			colId,
			taskId,
			position: getMenuPosition(trigger, TASK_INFO_MENU_WIDTH, menuHeight)
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
		if (target?.closest('[data-task-menu]') || target?.closest('[data-column-menu]')) {
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
		lastEmittedData = nextData;
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

	const scrollColumnViewport = async (columnId: string, position: 'top' | 'bottom') => {
		await tick();
		if (typeof document === 'undefined') return;
		const viewport = document.querySelector<HTMLElement>(`[data-column-viewport="${columnId}"]`);
		viewport?.scrollTo({
			top: position === 'top' ? 0 : viewport.scrollHeight,
			behavior: isMobile ? 'smooth' : 'auto'
		});
	};

	const scrollTaskIntoView = async (taskId: string) => {
		await tick();
		if (typeof document === 'undefined') return;
		const escapedTaskId =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(taskId)
				: taskId.replace(/["\\]/g, '\\$&');
		const card = document.querySelector<HTMLElement>(`[data-task-id="${escapedTaskId}"]`);
		card?.scrollIntoView({
			block: isMobile ? 'nearest' : 'center',
			inline: 'center',
			behavior: 'smooth'
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
			hasCheckbox: defaultShowCheckbox,
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
		await scrollColumnViewport(columnId, placement);
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

	const saveTaskTitleEdit = () => {
		if (!editingTaskTitle) return;

		const nextTitle = editingTaskTitleValue.trim();
		const { columnId, taskId } = editingTaskTitle;

		suppressTaskOpenUntil = Date.now() + 250;

		if (nextTitle) {
			updateTask(columnId, taskId, (task) => ({ ...task, title: nextTitle }));
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
		taskTitleInput?.focus();
		taskTitleInput?.select();
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
		updateTask(columnId, taskId, (task) => {
			const checked = !task.checked;
			return {
				...task,
				title:
					task.hasCheckbox && hasLeadingCardCheckboxLine(task.title || '')
						? syncLeadingCardCheckboxLine(task.title || '', checked)
						: task.title,
				checked,
				completedAt: checked ? Date.now() : undefined
			};
		});
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

	const toggleAssignMenu = (colId: string, taskId: string) => {
		if (assignMenuOpen?.colId === colId && assignMenuOpen.taskId === taskId) {
			assignMenuOpen = null;
		} else {
			assignMenuOpen = { colId, taskId };
		}
	};

	const assignTask = (columnId: string, taskId: string, userId: string | undefined) => {
		updateTask(columnId, taskId, (task) => ({ ...task, assignedTo: userId }));
		assignMenuOpen = null;
	};

	const toggleTaskTagMenu = (colId: string, taskId: string, trigger: HTMLElement) => {
		if (taskTagMenuOpen?.colId === colId && taskTagMenuOpen.taskId === taskId) {
			taskTagMenuOpen = null;
			return;
		}
		taskTagMenuOpen = {
			colId,
			taskId,
			position: getMenuPosition(trigger, TAG_MENU_WIDTH, TAG_MENU_HEIGHT)
		};
		openColumnMenu = null;
		openTaskMenu = null;
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

	const getMemberLabel = (member: ProjectMembership) =>
		getProjectMemberDisplayName(member, { preferCurrentUserLabel: false });

	const getAssignedMemberLabel = (task: Task) => {
		if (!task.assignedTo) return null;
		const member = members.find((m) => m.userId === task.assignedTo);
		if (!member) return null;
		return member.isCurrentUser ? 'You' : getMemberLabel(member);
	};

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
		'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-element/80 px-1 text-[10px] font-bold tabular-nums leading-none text-app-subtext';
	const getColumnWidth = (column: Column) => clampColumnWidth(column.width ?? DEFAULT_COLUMN_WIDTH);
	const getColumnLayoutStyle = (column: Column) =>
		`width: ${getColumnWidth(column)}px; min-width: ${getColumnWidth(column)}px;`;
	const getBoardColumnStyle = (column: Column) =>
		[getColumnLayoutStyle(column), getColumnToneStyle(column.color)].filter(Boolean).join('; ');
	const getTaskStyle = (task: DiffTask) =>
		task._status && task._status !== 'unchanged' ? '' : getCardToneStyle(task.color);

	const getTaskCardStyle = (task: DiffTask, isLinkHighlighted: boolean) => {
		const toneStyle = getTaskStyle(task);
		if (!toneStyle || !isLinkHighlighted) return toneStyle;

		return toneStyle
			.split(';')
			.map((chunk) => chunk.trim())
			.filter((chunk) => chunk && !chunk.startsWith('border-color:'))
			.join('; ');
	};

	const taskFlipDurationMs = () => (isMobile ? 110 : flipDurationMs);

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
			emitBoardChange(withUpdatedColumnTasks(boardData, columnId, items as Task[]));
			return;
		}

		// Cross-column pointer drops finalize the origin zone with DROPPED_INTO_ANOTHER.
		if (info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
			const fromColumnId = columnId;
			const toColumnId = boardData.find(
				(column) => column.id !== fromColumnId && column.tasks.some((task) => task.id === taskId)
			)?.id;

			emitBoardChange(withUpdatedColumnTasks(boardData, columnId, items as Task[]));

			if (toColumnId) {
				recordLastColumnMove(fromColumnId, toColumnId);
			}
			return;
		}

		const fromColumnId = findTaskColumnId(boardData, taskId);
		const nextBoard = withUpdatedColumnTasks(boardData, columnId, items as Task[]);
		const toColumnId = findTaskColumnId(nextBoard, taskId);

		emitBoardChange(nextBoard);

		if (fromColumnId && toColumnId) {
			recordLastColumnMove(fromColumnId, toColumnId);
		}
	};

	const cardClasses = (task: DiffTask, options?: { linkDimmed?: boolean }) => {
		const isLinkAnchor = linkViewAnchorId === task.id;
		const isLinkClusterMember = Boolean(
			linkViewAnchorId && !isDiffMode && linkViewComponentIds.has(task.id)
		);
		const isReferenceHighlight =
			!linkViewAnchorId && effectiveHighlightedTaskIds.includes(task.id);

		let result =
			'group relative overflow-hidden rounded-lg p-2 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg';

		if (task._status === 'added') result += ' border border-emerald-500/40 bg-emerald-500/10';
		else if (task._status === 'removed')
			result += ' border border-rose-500/40 bg-rose-500/10 opacity-80';
		else if (task._status === 'modified')
			result += ' border border-amber-500/40 bg-amber-500/10';
		else {
			result += ' bg-app-surface';
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
		if (task._status === 'modified') return 'Edited card';
		return '';
	};

	const diffStatusClasses = (task: DiffTask) => {
		if (task._status === 'added') {
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
		}

		if (task._status === 'removed') {
			return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
		}

		if (task._status === 'modified') {
			return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
		}

		return 'border-app-border bg-app-element/70 text-app-subtext';
	};

	const formatDiffTaskSnapshot = (task: Task | undefined) => {
		if (!task) return 'Card details unavailable.';

		const tags = (task.tags || []).map((tag) => tag.label).join(', ') || '(none)';
		const assignedMember = task.assignedTo
			? members.find((member) => member.userId === task.assignedTo)
			: undefined;
		const assignee = task.assignedTo
			? assignedMember
				? getProjectMemberDisplayName(assignedMember)
				: task.assignedTo
			: '(none)';
		const dueLabel = getTaskDueAt(task) !== null ? formatTimingLabel(task) : '(none)';

		return [
			`Title: ${task.title || '(untitled)'}`,
			`Description: ${(task.description || '').trim() || '(empty)'}`,
			`Tags: ${tags}`,
			`Assignee: ${assignee}`,
			`Due: ${dueLabel}`,
			`Checkbox: ${task.hasCheckbox ? (task.checked ? 'checked' : 'unchecked') : 'off'}`
		].join('\n');
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
	onresize={closeMenus}
/>

<div class:hidden={!active} class="absolute inset-0">
	<section class="absolute inset-0 flex overflow-hidden" data-kanban-board-root>
		{#if !showFullscreenTaskEditor}
			<div
				class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden py-1 lg:py-2"
				onscroll={() => {
					closeMenus();
					bumpLinkOverlay();
				}}
			>
				{#if !isDiffMode}
					<div class="flex h-full min-h-0 min-w-min flex-col">
					<div class="flex shrink-0 min-w-max items-center gap-2 px-3 pb-2">
						<button
							type="button"
							class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
								boardLayoutMode === 'link-groups'
									? 'border-app-primary/40 bg-app-primary/10 text-app-primary'
									: 'border-app-border bg-app-surface text-app-subtext hover:text-app-text'
							}`}
							onclick={toggleBoardLayoutMode}
						>
							<Network size={13} />
							Link groups
						</button>
						<BoardViewersPill viewers={boardPresenceViewers} />
						<button
							type="button"
							class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
								boardSearchActive
									? 'border-app-primary/40 bg-app-primary/10 text-app-primary'
									: 'border-app-border bg-app-surface text-app-subtext hover:text-app-text'
							}`}
							title="Search cards (Ctrl+F)"
							aria-label="Search cards"
							onclick={() => {
								if (boardSearchActive) {
									closeBoardSearch();
									return;
								}
								void openBoardSearch();
							}}
						>
							<Search size={13} />
							Search
						</button>
						{#if boardSearchActive}
							<div class="flex min-w-[12rem] max-w-sm flex-1 items-center gap-1.5">
								<input
									bind:this={boardSearchInput}
									bind:value={boardSearchQuery}
									type="search"
									class="w-full min-w-0 rounded-full border border-app-border bg-app-bg px-3 py-1.5 text-[11px] text-app-text outline-none placeholder:text-app-subtext/60 focus:border-app-primary/50"
									placeholder="Filter by card name…"
									aria-label="Filter cards by name"
									onkeydown={(event) => {
										if (event.key === 'Escape') {
											event.preventDefault();
											closeBoardSearch();
										}
									}}
								/>
								<button
									type="button"
									class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-app-subtext transition hover:bg-app-element hover:text-app-text"
									title="Close search"
									aria-label="Close search"
									onclick={closeBoardSearch}
								>
									<X size={14} />
								</button>
							</div>
						{/if}
						{#if linkViewAnchorId}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-3 py-1.5 text-[11px] font-semibold text-app-subtext transition hover:text-app-text"
								onclick={clearLinkView}
							>
								<Unlink size={13} />
								Clear link view
							</button>
						{/if}
					</div>
					<div class="flex min-h-0 flex-1 min-w-max items-start gap-3">
						<div class="w-2 shrink-0"></div>
						<div
							class="flex h-full min-h-0 min-w-max items-start gap-3"
							use:dragHandleZone={{
									items: boardLayoutMode === 'link-groups' ? [] : boardData,
									type: 'column',
									flipDurationMs,
									dragDisabled:
										isLocked || boardLayoutMode === 'link-groups' || boardSearchFiltering,
									delayTouchStart: true
								}}
								onconsider={(event) => handleColumnDnd(event as CustomEvent)}
								onfinalize={(event) => handleColumnDnd(event as CustomEvent)}
							>
							{#each visibleDisplayColumns as column (getDndKey(column))}
								<div
									animate:flip={{ duration: flipDurationMs }}
									data-is-dnd-shadow-item-hint={isShadowItem(column)}
									class={`flex h-max max-h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border bg-app-surface/82 ${
										column.isLinkGroup
											? 'border-app-primary/35 ring-1 ring-app-primary/15'
											: 'border-app-border'
									}`}
									style={getBoardColumnStyle(column)}
								>
									<div
										class="flex items-center justify-between gap-3 border-b border-app-border px-3 py-2.5"
										style={getColumnHeaderToneStyle(column.color)}
									>
										<div class="min-w-0 flex-1">
											{#if editingColumnId === column.id}
												<div class="flex min-w-0 items-center gap-2">
													<input
														bind:value={editingColumnTitle}
														class="w-full rounded-lg border border-app-primary/40 bg-app-bg px-2 py-1 text-sm font-semibold text-app-text outline-none"
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
												<div class="flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-left">
													<div class="min-w-0 flex-1">
														<div class="flex min-w-0 items-center gap-2">
															<h3 class="min-w-0 flex-1 truncate font-semibold text-app-text">
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
															<p class="truncate text-[11px] text-app-subtext">
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
													class="flex min-w-0 cursor-grab items-center gap-2 rounded-xl px-1 py-1 text-left active:cursor-grabbing"
												>
													<GripVertical size={15} class="shrink-0 text-app-subtext" />
													<h3 class="min-w-0 flex-1 truncate font-semibold text-app-text">
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
											<div class="relative flex items-center gap-1">
												<button
													type="button"
													class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
														isMobile ? 'min-h-10 min-w-10 rounded-lg p-2.5' : 'rounded-xl p-2'
													}`}
													onclick={async (event) => {
														event.stopPropagation();
														await addTask(column.id, 'top');
													}}
												>
													<Plus size={isMobile ? 18 : 16} />
												</button>
												<button
													type="button"
													class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
														isMobile ? 'min-h-10 min-w-10 rounded-lg p-2.5' : 'rounded-xl p-2'
													}`}
													onclick={(event) => {
														event.stopPropagation();
														toggleColumnMenu(column.id, event.currentTarget as HTMLButtonElement);
													}}
												>
													<Ellipsis size={isMobile ? 18 : 16} />
												</button>
											</div>
										{/if}
									</div>

									<div class="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
										<div
											data-column-viewport={column.id}
											class="min-h-0 flex-1 overflow-y-auto"
											onscroll={() => {
												closeMenus();
												bumpLinkOverlay();
											}}
										>
											<div
												class="flex flex-col gap-1.5"
												use:dndzone={{
													items: column.tasks,
													type: 'task',
													flipDurationMs: taskFlipDurationMs(),
													dragDisabled:
														isLocked ||
														Boolean(column.isLinkGroup) ||
														boardSearchFiltering,
													delayTouchStart: isMobile ? 220 : true,
													morphDisabled: isMobile,
													centreDraggedOnCursor: isMobile,
													useCursorForDetection: isMobile,
													dropAnimationDisabled: false
												}}
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
														animate:flip={{ duration: taskFlipDurationMs() }}
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
																		rows="10"
																		class="w-full resize-none rounded-lg border border-app-primary/40 bg-app-bg px-2 py-1 text-sm font-medium text-app-text outline-none"
																		onclick={(event) => event.stopPropagation()}
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
																	<div
																		class="min-w-0 cursor-text rounded-md"
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
																			onCheckboxToggle={
																				isLocked
																					? undefined
																					: (index, checked) =>
																							toggleTaskTitleCheckbox(
																								taskColumnId,
																								task.id,
																								index,
																								checked
																							)
																			}
																		/>
																	</div>
																{/if}
																{#if column.isLinkGroup && column.taskColumnTitles?.[task.id]}
																	<p class="mt-1 text-[10px] text-app-subtext">
																		{column.taskColumnTitles[task.id]}
																	</p>
																{/if}
																{#if task.description?.trim()}
																	<div
																		class="mt-1 inline-flex items-center gap-1 text-[10px] text-app-subtext"
																	>
																		<FileText size={13} />
																		<span>Markdown description attached</span>
																	</div>
																{/if}
															</div>
														</div>

														{#if task.tags?.length || getTaskLinkCount(task) > 0}
															<div class="mt-1.5 flex flex-wrap gap-1">
																{#if getTaskLinkCount(task) > 0}
																	<span
																		class="inline-flex items-center gap-1 rounded-full border border-app-primary/30 bg-app-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.14em] text-app-primary"
																	>
																		<Link2 size={10} />
																		{getTaskLinkCount(task)}
																		{getTaskLinkCount(task) === 1 ? 'link' : 'links'}
																	</span>
																{/if}
																{#each task.tags || [] as tag (tag.id)}
																	<span
																		class={`rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.14em] ${getTagToneClasses(tag.color)}`}
																	>
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
															class="mt-2 flex items-end justify-between gap-2 border-t border-app-border/70 pt-1.5"
														>
															<div
																class="min-w-0 flex items-center gap-2 text-[9px] text-app-subtext"
															>
																{#if isCollaborative}
																	<div class="relative">
																		{#if task.assignedTo && getAssignedMemberLabel(task)}
																			<button
																				type="button"
																				class="inline-flex items-center gap-1 rounded-md border border-app-primary/30 bg-app-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-app-primary transition hover:bg-app-primary/20"
																				onclick={(event) => {
																					event.stopPropagation();
																					toggleAssignMenu(taskColumnId, task.id);
																				}}
																			>
																				<span
																					class="inline-block h-3 w-3 rounded-full border border-app-primary/40 bg-app-primary/20 text-center text-[7px] font-bold leading-3 text-app-primary"
																				>
																					{(getAssignedMemberLabel(task) || '?')[0].toUpperCase()}
																				</span>
																				{getAssignedMemberLabel(task)}
																			</button>
																		{:else}
																			<button
																				type="button"
																				class="inline-flex items-center gap-1 rounded-md border border-dashed border-app-border px-1.5 py-0.5 text-[9px] font-medium text-app-subtext transition hover:border-app-primary/40 hover:text-app-primary"
																				onclick={(event) => {
																					event.stopPropagation();
																					toggleAssignMenu(taskColumnId, task.id);
																				}}
																			>
																				Assign
																			</button>
																		{/if}
																		{#if assignMenuOpen?.colId === taskColumnId && assignMenuOpen?.taskId === task.id}
																			<div
																				role="menu"
																				tabindex="-1"
																				class="absolute bottom-full left-0 z-50 mb-1 min-w-[140px] rounded-lg border border-app-border bg-app-surface p-1 shadow-xl"
																				onclick={(event) => event.stopPropagation()}
																				onkeydown={(event) => event.stopPropagation()}
																			>
																				{#each members as member (member.userId)}
																					<button
																						type="button"
																						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition {task.assignedTo ===
																						member.userId
																							? 'bg-app-primary/15 font-semibold text-app-primary'
																							: 'text-app-text hover:bg-app-element'}"
																						onclick={(event) => {
																							event.stopPropagation();
																							assignTask(
																								taskColumnId,
																								task.id,
																								task.assignedTo === member.userId
																									? undefined
																									: member.userId
																							);
																						}}
																					>
																						<span
																							class="inline-block h-4 w-4 shrink-0 rounded-full border border-app-border bg-app-element text-center text-[8px] font-bold leading-4 text-app-subtext"
																						>
																							{getMemberLabel(member)[0].toUpperCase()}
																						</span>
																						<span class="truncate">{getMemberLabel(member)}</span>
																						{#if member.isCurrentUser}
																							<span class="text-[9px] text-app-subtext">(you)</span>
																						{/if}
																					</button>
																				{/each}
																				{#if task.assignedTo}
																					<div class="border-t border-app-border mt-1 pt-1">
																						<button
																							type="button"
																							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-app-subtext transition hover:bg-app-element"
																							onclick={(event) => {
																								event.stopPropagation();
																								assignTask(taskColumnId, task.id, undefined);
																							}}
																						>
																							Unassign
																						</button>
																					</div>
																				{/if}
																			</div>
																		{/if}
																	</div>
																{/if}
															</div>

															<div class="flex items-center">
																<button
																	type="button"
																	class={`transition ${
																		linkViewAnchorId === task.id
																			? 'text-app-primary'
																			: 'text-app-subtext hover:bg-app-element hover:text-app-primary'
																	} ${isMobile ? 'min-h-8 min-w-8 rounded-lg p-1.5' : 'rounded-md p-1.5'}`}
																	title="View links"
																	disabled={isLocked || isDiffMode}
																	onclick={(event) => {
																		event.stopPropagation();
																		toggleLinkView(task.id);
																	}}
																>
																	<Link2 size={isMobile ? 18 : 16} />
																</button>
																<button
																	type="button"
																	class={`transition ${
																		taskInfoMenuOpen?.colId === taskColumnId &&
																		taskInfoMenuOpen?.taskId === task.id
																			? 'text-app-primary'
																			: 'text-app-subtext hover:bg-app-element hover:text-app-text'
																	} ${isMobile ? 'min-h-8 min-w-8 rounded-lg p-1.5' : 'rounded-md p-1.5'}`}
																	title="Card info"
																	aria-label="Card info"
																	aria-expanded={taskInfoMenuOpen?.colId === taskColumnId &&
																		taskInfoMenuOpen?.taskId === task.id}
																	onclick={(event) => {
																		event.stopPropagation();
																		toggleTaskInfoMenu(
																			taskColumnId,
																			task.id,
																			event.currentTarget as HTMLButtonElement
																		);
																	}}
																>
																	<Info size={isMobile ? 18 : 16} />
																</button>
																<div class="relative">
																	<button
																		type="button"
																		class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
																			isMobile ? 'min-h-8 min-w-8 rounded-lg p-1.5' : 'rounded-md p-1.5'
																		}`}
																		title="Quick tags"
																		onclick={(event) => {
																			event.stopPropagation();
																			toggleTaskTagMenu(
																				taskColumnId,
																				task.id,
																				event.currentTarget as HTMLButtonElement
																			);
																		}}
																	>
																		<TagIcon size={isMobile ? 18 : 16} />
																	</button>
																</div>
																<button
																	type="button"
																	class={`text-app-subtext transition hover:bg-app-element hover:text-app-accent ${
																		isMobile ? 'min-h-8 min-w-8 rounded-lg p-1.5' : 'rounded-md p-1.5'
																	}`}
																	title="Queue for chat"
																	onclick={(event) => {
																		event.stopPropagation();
																		onSendToChat({ task, column });
																		closeMenus();
																	}}
																>
																	<MessageSquarePlus size={isMobile ? 18 : 16} />
																</button>

																<div class="relative">
																	<button
																		type="button"
																		class={`text-app-subtext transition hover:bg-app-element hover:text-app-text ${
																			isMobile
																				? 'min-h-8 min-w-8 rounded-lg p-1.5'
																				: 'rounded-md p-1.5'
																		}`}
																		onclick={(event) => {
																			event.stopPropagation();
																			toggleTaskMenu(
																				taskColumnId,
																				task.id,
																				event.currentTarget as HTMLButtonElement
																			);
																		}}
																	>
																		<Ellipsis size={isMobile ? 18 : 16} />
																	</button>
																</div>
															</div>
														</div>
													</div>
												{/each}
											</div>
										</div>
										{#if !column.isLinkGroup}
											<button
												type="button"
												class="mt-2 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-md border border-dashed border-app-border bg-app-bg/45 px-3 py-2.5 text-sm font-semibold text-app-subtext transition hover:border-app-primary/40 hover:text-app-primary"
												onclick={async (event) => {
													event.stopPropagation();
													await addTask(column.id, 'bottom');
												}}
											>
												<Plus size={isMobile ? 15 : 14} />
												New task
											</button>
										{/if}
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
						<div class="w-2 shrink-0"></div>
					</div>
					</div>
				{:else}
					<div class="flex h-full min-h-0 min-w-max gap-3">
						{#each visibleDiffData as column (column.id)}
							<div
								class={`flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-app-surface/80 ${
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
									class={`border-b border-app-border px-3 py-2.5 ${column._status === 'unchanged' ? 'grayscale opacity-50' : ''}`}
									style={column._status === 'unchanged'
										? getColumnHeaderToneStyle(column.color)
										: undefined}
								>
									<div class="flex min-w-0 items-center gap-2">
										<h3 class="min-w-0 flex-1 truncate font-semibold text-app-text">
											{column.title}
										</h3>
										<span
											class={COLUMN_TASK_COUNT_CLASS}
											aria-label="{column.tasks.length} cards"
										>
											{column.tasks.length}
										</span>
									</div>
								</div>

								<div class="min-h-0 flex-1 overflow-y-auto p-2.5">
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
														{#if task._status && task._status !== 'unchanged'}
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
																<FileText size={11} />
																<span>{taskDescriptionChangeLabel(task)}. Click to inspect.</span>
															</div>
														{/if}
													</div>
												</div>

												{#if task.tags?.length}
													<div class="flex flex-wrap gap-1.5">
														{#each task.tags as tag (tag.id)}
															<span
																class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getTagToneClasses(tag.color)}`}
															>
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

												{#if task._status === 'modified' && task._originalTask}
													<div class="mt-3 grid gap-2 lg:grid-cols-2">
														<div class="rounded-lg border border-app-border bg-app-bg/55 p-3">
															<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext">
																Before
															</p>
															<div class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-app-subtext">
																{formatDiffTaskSnapshot(task._originalTask)}
															</div>
														</div>
														<div class="rounded-lg border border-app-border bg-app-bg/55 p-3">
															<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext">
																After
															</p>
															<div class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-app-text">
																{formatDiffTaskSnapshot(task)}
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
			<div class="pointer-events-none fixed inset-0 z-[140]">
				<div
					role="presentation"
					data-column-menu
					class="pointer-events-auto fixed w-72 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-lg border border-app-border bg-app-surface p-2 shadow-kainbu-xl"
					style={`top:${openColumnMenu!.position.top}px; left:${openColumnMenu!.position.left}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						class="w-full rounded-xl px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							editingColumnId = menuColumn.id;
							editingColumnTitle = menuColumn.title;
							openColumnMenu = null;
						}}
					>
						Rename
					</button>

					<div
						role="group"
						aria-label={`Width controls for ${menuColumn.title}`}
						class="mt-2 rounded-xl border border-app-border bg-app-bg/80 px-3 py-3"
					>
						<div
							class="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-app-subtext"
						>
							<span>Column Width</span>
							<span>{getColumnWidth(menuColumn)}px</span>
						</div>
						<input
							type="range"
							min={MIN_COLUMN_WIDTH}
							max={MAX_COLUMN_WIDTH}
							step="4"
							value={getColumnWidth(menuColumn)}
							class="w-full accent-[var(--color-app-primary)]"
							onclick={(event) => event.stopPropagation()}
							oninput={(event) =>
								setColumnWidth(
									menuColumn.id,
									Number((event.currentTarget as HTMLInputElement).value)
								)}
						/>
						<div class="mt-3 flex items-center justify-between gap-2">
							<button
								type="button"
								class="rounded-lg border border-app-border bg-app-element px-2.5 py-1.5 text-[11px] font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
								onclick={(event) => {
									event.stopPropagation();
									setColumnWidth(menuColumn.id, getColumnWidth(menuColumn) - 24);
								}}
							>
								Narrower
							</button>
							<button
								type="button"
								class="rounded-lg border border-app-border bg-app-element px-2.5 py-1.5 text-[11px] font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
								onclick={(event) => {
									event.stopPropagation();
									setColumnWidth(menuColumn.id, DEFAULT_COLUMN_WIDTH);
								}}
							>
								Reset
							</button>
							<button
								type="button"
								class="rounded-lg border border-app-border bg-app-element px-2.5 py-1.5 text-[11px] font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
								onclick={(event) => {
									event.stopPropagation();
									setColumnWidth(menuColumn.id, getColumnWidth(menuColumn) + 24);
								}}
							>
								Wider
							</button>
						</div>
					</div>

					<div class="relative mt-2">
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
							onclick={(event) => {
								event.stopPropagation();
								columnTonePickerOpen = !columnTonePickerOpen;
							}}
						>
							<span
								class={`inline-block h-4 w-4 rounded-full border ${currentColumnTone.swatchClass}`}
							></span>
							<span class="flex-1">Column Tone</span>
							<span class="text-[11px] text-app-subtext">{currentColumnTone.label}</span>
							<ChevronDown
								size={12}
								class={`text-app-subtext transition ${columnTonePickerOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if columnTonePickerOpen}
							<div
								role="group"
								class="mt-1 rounded-xl border border-app-border bg-app-bg/80 p-3"
							>
								<div class="grid grid-cols-5 place-items-center gap-2.5">
									{#each SURFACE_TONE_OPTIONS as tone}
										<button
											type="button"
											aria-label={`Set ${menuColumn.title} tone to ${tone.label}`}
											title={tone.label}
											class={`h-7 w-7 rounded-full border p-0 transition ${tone.swatchClass} ${
												(menuColumn.color || '') === tone.value
													? 'scale-110 border-white/80 ring-2 ring-app-primary/45'
													: 'hover:scale-110 hover:border-app-primary/35'
											}`}
											onclick={(event) => {
												event.stopPropagation();
												setColumnColor(menuColumn.id, tone.value);
												columnTonePickerOpen = false;
											}}
										></button>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							copyColumnAsMarkdown(menuColumn.id);
						}}
					>
						<ClipboardCopy size={14} />
						Copy as Markdown
					</button>

					<button
						type="button"
						class="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10"
						onclick={(event) => {
							event.stopPropagation();
							deleteColumn(menuColumn.id);
						}}
					>
						Delete
					</button>
				</div>
			</div>
		{/if}
	{/if}

	{#if openTaskMenu}
		{@const menuColumn = boardData.find((column) => column.id === openTaskMenu!.colId)}
		{@const menuTask = menuColumn?.tasks.find((task) => task.id === openTaskMenu!.taskId)}
		{#if menuColumn && menuTask}
			<div class="pointer-events-none fixed inset-0 z-[150]">
				<div
					role="presentation"
					data-task-menu
					class="pointer-events-auto fixed w-56 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-xl border border-app-border bg-app-surface p-2 shadow-kainbu-xl"
					style={`top:${openTaskMenu!.position.top}px; left:${openTaskMenu!.position.left}px;`}
					onmousedown={(event) => event.stopPropagation()}
					onclick={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							editingTask = { column: menuColumn, task: menuTask };
							closeMenus();
						}}
					>
						<TagIcon size={14} />
						Edit Card
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							copyTaskTitle(menuColumn.id, menuTask.id);
						}}
					>
						<Copy size={14} />
						Copy Title
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							openTaskLinkPicker(menuColumn.id, menuTask.id, event.currentTarget as HTMLButtonElement);
						}}
					>
						<Link2 size={14} />
						Link to task…
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							void createLinkedTaskFromMenu(menuColumn.id, menuTask.id);
						}}
					>
						<Plus size={14} />
						Create linked task
					</button>
					{#if normalizeLinkedTaskIds(menuTask.linkedTaskIds).length || getDescriptionReferencedPlacements(boardData, menuTask.id).length}
						<div class="my-1 border-t border-app-border pt-1">
							<p class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-subtext">
								Manage links
							</p>
							{#each getExplicitLinkedTasks(boardData, menuTask.id) as linkedPlacement (linkedPlacement.task.id)}
								<button
									type="button"
									class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
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
									class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
									onclick={(event) => {
										event.stopPropagation();
										removeDescriptionReference(menuTask.id, linkedPlacement.task.id);
									}}
								>
									<Unlink size={14} />
									<span class="truncate">Remove ref to {linkedPlacement.task.title}</span>
								</button>
							{/each}
						</div>
					{/if}
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-accent transition hover:bg-app-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
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
					{#if rewriteTaskError}
						<p class="px-3 py-1 text-xs leading-snug text-rose-300">{rewriteTaskError}</p>
					{/if}
					{#if lastColumnMove && boardData.some((column) => column.id === lastColumnMove!.toColumnId)}
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element disabled:cursor-not-allowed disabled:opacity-50"
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
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
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
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-element"
						onclick={(event) => {
							event.stopPropagation();
							toggleCheckbox(menuColumn.id, menuTask.id);
						}}
					>
						{#if menuTask.checked}
							<CheckSquare size={14} />
						{:else}
							<Square size={14} />
						{/if}
						Toggle Checkbox
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-accent transition hover:bg-app-accent/10"
						onclick={(event) => {
							event.stopPropagation();
							onSendToChat({ task: menuTask, column: menuColumn });
							closeMenus();
						}}
					>
						<MessageSquarePlus size={14} />
						Send to Chat
					</button>
					<button
						type="button"
						class="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10"
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
		{/if}
	{/if}

	{#if taskInfoMenuOpen}
		{@const infoColumn = boardData.find((column) => column.id === taskInfoMenuOpen!.colId)}
		{@const infoTask = infoColumn?.tasks.find((task) => task.id === taskInfoMenuOpen!.taskId)}
		{#if infoColumn && infoTask}
			<div class="pointer-events-none fixed inset-0 z-[145]">
				<div
					role="dialog"
					aria-label="Card info"
					data-task-info-menu
					class="pointer-events-auto fixed rounded-xl border border-app-border bg-app-surface p-3 shadow-kainbu-xl"
					style={`top:${taskInfoMenuOpen!.position.top}px; left:${taskInfoMenuOpen!.position.left}px; width:${TASK_INFO_MENU_WIDTH}px;`}
					onmousedown={(event) => event.stopPropagation()}
				>
					<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext">
						Card info
					</p>
					<dl class="space-y-2 text-[11px]">
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
			<div class="pointer-events-none fixed inset-0 z-[145]">
				<div
					role="presentation"
					class="pointer-events-auto fixed w-52 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-xl border border-app-border bg-app-surface p-1 shadow-kainbu-xl"
					style={`top:${taskTagMenuOpen!.position.top}px; left:${taskTagMenuOpen!.position.left}px;`}
					onmousedown={(event) => event.stopPropagation()}
				>
					{#if existingTags.length}
						{#each existingTags.slice(0, 10) as quickTag (quickTag.id)}
							{@const hasTag = (menuTask.tags || []).some((entry) => entry.label.trim().toLowerCase() === quickTag.label.trim().toLowerCase())}
							<button
								type="button"
								class={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${
									hasTag
										? 'bg-app-primary/15 text-app-primary'
										: 'text-app-text hover:bg-app-element'
								}`}
								onclick={(event) => {
									event.stopPropagation();
									toggleTaskTag(menuColumn.id, menuTask.id, quickTag);
								}}
							>
								<span class="truncate">{quickTag.label}</span>
								{#if hasTag}
									<Check size={11} />
								{/if}
							</button>
						{/each}
					{:else}
						<p class="px-2.5 py-2 text-[11px] text-app-subtext">No tags yet</p>
					{/if}
				</div>
			</div>
		{/if}
	{/if}

	{#if showOverlayTaskEditor}
		<TaskModal
			task={editingTask!.task}
			{projectId}
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
</div>
