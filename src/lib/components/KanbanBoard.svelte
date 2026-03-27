<script lang="ts">
	import { flip } from 'svelte/animate';
	import { tick } from 'svelte';
	import {
		ArrowDownToLine,
		CheckSquare,
		ChevronDown,
		ClipboardCopy,
		Clock3,
		Copy,
		Ellipsis,
		FileText,
		GripVertical,
		MessageSquarePlus,
		Plus,
		Square,
		Tag as TagIcon,
		Trash2
	} from 'lucide-svelte';
	import {
		dragHandle,
		dragHandleZone,
		dndzone,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		type DndEvent
	} from 'svelte-dnd-action';
	import {
		clampColumnWidth,
		COLUMN_DOT_COLORS,
		DEFAULT_COLUMN_WIDTH,
		MAX_COLUMN_WIDTH,
		MIN_COLUMN_WIDTH,
		SURFACE_TONE_OPTIONS
	} from '$lib/kainbu/constants';
	import { computeKanbanDiff, type DiffColumn, type DiffTask } from '$lib/kainbu/diff';
	import { createId } from '$lib/kainbu/id';
	import { formatTimingLabel, getTaskDueAt } from '$lib/kainbu/timing';
	import {
		getCardToneStyle,
		getColumnDotStyle,
		getColumnHeaderToneStyle,
		getColumnToneStyle,
		getTagToneClasses
	} from '$lib/kainbu/tags';
	import type { Column, KanbanData, ProjectMembership, Tag, Task } from '$lib/kainbu/types';
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

	export let data: KanbanData;
	export let comparisonData: KanbanData | undefined = undefined;
	export let highlightedTaskIds: string[] = [];
	export let isLocked = false;
	export let defaultShowCheckbox = true;
	export let active = true;
	export let members: ProjectMembership[] = [];
	export let onChange: (nextData: KanbanData) => void;
	export let onSendToChat: (payload: { task: Task; column: Column }) => void;

	const flipDurationMs = 180;
	let viewportWidth = 0;
	let boardData: KanbanData = data;
	let lastEmittedData: KanbanData | null = null;

	let editingColumnId: string | null = null;
	let editingColumnTitle = '';
	let openColumnMenu: ColumnMenuState | null = null;
	let openTaskMenu: TaskMenuState | null = null;
	let columnTonePickerOpen = false;
	let editingTask: { column: Column; task: Task } | null = null;
	let editingTaskTitle: { columnId: string; taskId: string } | null = null;
	let editingTaskTitleValue = '';
	let taskTitleInput: HTMLTextAreaElement | null = null;
	let lastTaskTitleTap: { columnId: string; taskId: string; at: number } | null = null;
	let suppressTaskOpenUntil = 0;
	let assignMenuOpen: { colId: string; taskId: string } | null = null;
	const MENU_GAP = 8;
	const MENU_GUTTER = 12;
	const COLUMN_MENU_WIDTH = 288;
	const COLUMN_MENU_HEIGHT = 520;
	const TASK_MENU_WIDTH = 192;
	const TASK_MENU_HEIGHT = 320;
	const TITLE_DOUBLE_TAP_MS = 320;

	$: isMobile = viewportWidth > 0 && viewportWidth < 1024;
	$: isDiffMode = comparisonData !== undefined;
	$: isCollaborative = members.length > 1;
	$: if (data === lastEmittedData) {
		boardData = data;
		lastEmittedData = null;
	} else if (data !== boardData) {
		boardData = data;
	}
	$: diffData = isDiffMode && comparisonData ? computeKanbanDiff(comparisonData, boardData) : [];
	$: existingTags = Array.from(
		new Map(
			boardData
				.flatMap((column) => column.tasks)
				.flatMap((task) => task.tags)
				.map((tag) => [tag.label.toLowerCase(), tag])
		).values()
	);
	$: if (!active || isDiffMode) {
		closeMenus();
		cancelTaskTitleEdit();
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
		editingTaskTitle &&
		!boardData.some(
			(column) =>
				column.id === editingTaskTitle?.columnId &&
				column.tasks.some((task) => task.id === editingTaskTitle?.taskId)
		)
	) {
		cancelTaskTitleEdit();
	}

	const closeMenus = () => {
		openColumnMenu = null;
		openTaskMenu = null;
		columnTonePickerOpen = false;
		assignMenuOpen = null;
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
	};

	const handleWindowKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			closeMenus();
		}
	};

	const emitBoardChange = (nextData: KanbanData) => {
		boardData = nextData;
		lastEmittedData = nextData;
		onChange(nextData);
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

	const updateTask = (columnId: string, taskId: string, updater: (task: Task) => Task) => {
		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId
					? {
							...column,
							tasks: column.tasks.map((task) => (task.id === taskId ? updater(task) : task))
						}
					: column
			)
		);
	};

	const addTask = (columnId: string) => {
		const nextTask: Task = {
			id: createId(),
			title: 'New Task',
			description: '',
			tags: [],
			hasCheckbox: defaultShowCheckbox,
			checked: false
		};

		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId ? { ...column, tasks: [...column.tasks, nextTask] } : column
			)
		);
	};

	const deleteTask = (columnId: string, taskId: string) => {
		emitBoardChange(
			boardData.map((column) =>
				column.id === columnId
					? { ...column, tasks: column.tasks.filter((task) => task.id !== taskId) }
					: column
			)
		);
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

	const getMemberLabel = (member: ProjectMembership) =>
		member.email || (member.isCurrentUser ? 'You' : member.userId.slice(0, 8));

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

	const getDefaultColumnDotClass = (index: number) =>
		COLUMN_DOT_COLORS[index % COLUMN_DOT_COLORS.length];
	const getColumnWidth = (column: Column) => clampColumnWidth(column.width ?? DEFAULT_COLUMN_WIDTH);
	const getColumnLayoutStyle = (column: Column) =>
		`width: ${getColumnWidth(column)}px; min-width: ${getColumnWidth(column)}px;`;
	const getBoardColumnStyle = (column: Column) =>
		[getColumnLayoutStyle(column), getColumnToneStyle(column.color)].filter(Boolean).join('; ');
	const getColumnDotClassFor = (index: number, color?: string) =>
		getColumnDotStyle(color) ? '' : getDefaultColumnDotClass(index);
	const getTaskStyle = (task: DiffTask) =>
		task._status && task._status !== 'unchanged' ? '' : getCardToneStyle(task.color);
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

	const handleTaskDnd = (columnId: string, event: CustomEvent<DndEvent<Task>>) => {
		if (isLocked || isDiffMode) return;
		emitBoardChange(withUpdatedColumnTasks(boardData, columnId, event.detail.items as Task[]));
	};

	const cardClasses = (task: DiffTask) => {
		let result =
			'group relative rounded-lg border p-2 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg';

		if (task._status === 'added') result += ' border-emerald-500/40 bg-emerald-500/10';
		else if (task._status === 'removed') result += ' border-rose-500/40 bg-rose-500/10 opacity-80';
		else if (task._status === 'modified') result += ' border-amber-500/40 bg-amber-500/10';
		else result += ' border-app-border bg-app-surface';

		if (task.checked) result += ' opacity-70';
		if (highlightedTaskIds.includes(task.id))
			result += ' ring-2 ring-app-accent shadow-[0_0_0_3px_rgba(59,130,246,0.16)]';

		return result;
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

	const isShadowItem = (value: unknown) =>
		Boolean((value as Record<string, unknown> | undefined)?.[SHADOW_ITEM_MARKER_PROPERTY_NAME]);

	const getDndKey = (value: { id: string }) => `${value.id}${isShadowItem(value) ? ':shadow' : ''}`;
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	onclick={closeMenus}
	onkeydown={handleWindowKeydown}
	onresize={closeMenus}
/>

<section class:hidden={!active} class="absolute inset-0 flex overflow-hidden">
	<div
		class="min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-1 py-1 lg:px-2 lg:py-2"
		onscroll={closeMenus}
	>
		{#if !isDiffMode}
			<div class="flex h-full min-w-max gap-3">
				<div
					class="flex h-full min-w-max gap-3"
					use:dragHandleZone={{
						items: boardData,
						type: 'column',
						flipDurationMs,
						dragDisabled: isLocked,
						delayTouchStart: true
					}}
					onconsider={(event) => handleColumnDnd(event as CustomEvent)}
					onfinalize={(event) => handleColumnDnd(event as CustomEvent)}
				>
					{#each boardData as column, index (getDndKey(column))}
						<div
							animate:flip={{ duration: flipDurationMs }}
							data-is-dnd-shadow-item-hint={isShadowItem(column)}
							class="flex h-full shrink-0 flex-col overflow-hidden rounded-[1.15rem] border border-app-border bg-app-surface/82"
							style={getBoardColumnStyle(column)}
						>
							<div
								class="flex items-center justify-between gap-3 border-b border-app-border px-3 py-2.5"
								style={getColumnHeaderToneStyle(column.color)}
							>
								<div class="min-w-0 flex-1">
									{#if editingColumnId === column.id}
										<div class="flex min-w-0 items-center gap-2.5">
											<span
												class={`h-2.5 w-2.5 shrink-0 rounded-full ${getColumnDotClassFor(index, column.color)}`}
												style={column.color ? getColumnDotStyle(column.color) : undefined}
											></span>
											<input
												bind:value={editingColumnTitle}
												class="w-full rounded-lg border border-app-primary/40 bg-app-bg px-2 py-1 text-sm font-semibold text-app-text outline-none"
												onclick={(event) => event.stopPropagation()}
												onblur={() => renameColumn(column.id, editingColumnTitle)}
												onkeydown={(event) => {
													if (event.key === 'Enter') renameColumn(column.id, editingColumnTitle);
													if (event.key === 'Escape') editingColumnId = null;
												}}
											/>
										</div>
									{:else}
										<div
											use:dragHandle
											aria-label={`Drag column ${column.title}`}
											class="flex min-w-0 cursor-grab items-center gap-2.5 rounded-xl px-1 py-1 text-left active:cursor-grabbing"
										>
											<GripVertical size={15} class="shrink-0 text-app-subtext" />
											<span
												class={`h-2.5 w-2.5 shrink-0 rounded-full ${getColumnDotClassFor(index, column.color)}`}
												style={column.color ? getColumnDotStyle(column.color) : undefined}
											></span>
											<div class="min-w-0">
												<h3 class="truncate font-semibold text-app-text">{column.title}</h3>
												<p
													class="text-[10px] font-bold uppercase tracking-[0.22em] text-app-subtext"
												>
													{column.tasks.length} cards
												</p>
											</div>
										</div>
									{/if}
								</div>

								<div class="relative flex items-center gap-1">
									<button
										type="button"
										class="rounded-xl p-2 text-app-subtext transition hover:bg-app-element hover:text-app-text"
										onclick={(event) => {
											event.stopPropagation();
											addTask(column.id);
										}}
									>
										<Plus size={16} />
									</button>
									<button
										type="button"
										class="rounded-xl p-2 text-app-subtext transition hover:bg-app-element hover:text-app-text"
										onclick={(event) => {
											event.stopPropagation();
											toggleColumnMenu(column.id, event.currentTarget as HTMLButtonElement);
										}}
									>
										<Ellipsis size={16} />
									</button>
								</div>
							</div>

							<div
								class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2"
								onscroll={closeMenus}
								use:dndzone={{
									items: column.tasks,
									type: 'task',
									flipDurationMs: taskFlipDurationMs(),
									dragDisabled: isLocked,
									delayTouchStart: isMobile ? 220 : true,
									morphDisabled: isMobile,
									centreDraggedOnCursor: isMobile,
									useCursorForDetection: isMobile,
									dropAnimationDisabled: false
								}}
								onconsider={(event) => handleTaskDnd(column.id, event as CustomEvent)}
								onfinalize={(event) => handleTaskDnd(column.id, event as CustomEvent)}
							>
								{#each column.tasks as task (getDndKey(task))}
									<div
										animate:flip={{ duration: taskFlipDurationMs() }}
										data-is-dnd-shadow-item-hint={isShadowItem(task)}
										class={cardClasses(task as DiffTask)}
										style={getTaskStyle(task as DiffTask)}
										role="button"
										tabindex="0"
										onclick={() => openTaskEditor(column, task)}
										onkeydown={(event) => {
											if (event.key === 'Enter' || event.key === ' ') {
												event.preventDefault();
												openTaskEditor(column, task);
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
														toggleChecked(column.id, task.id);
													}}
												>
													{#if task.checked}
														<CheckSquare size={15} />
													{:else}
														<Square size={15} />
													{/if}
												</button>
											{/if}

											<div class="min-w-0 flex-1">
												{#if editingTaskTitle?.columnId === column.id && editingTaskTitle?.taskId === task.id}
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
															void startTaskTitleEdit(column.id, task);
														}}
														onpointerup={(event) =>
															handleTaskTitlePointerUp(event as PointerEvent, column.id, task)}
													>
														<RichText
															value={task.title}
															className={`kainbu-prose prose-tight text-sm font-medium ${task.checked ? 'opacity-70' : ''}`}
														/>
													</div>
												{/if}
												{#if task.description?.trim()}
													<div
														class="mt-1 inline-flex items-center gap-1 text-[10px] text-app-subtext"
													>
														<FileText size={11} />
														<span>Markdown description attached</span>
													</div>
												{/if}
											</div>
										</div>

										{#if task.tags?.length}
											<div class="mt-1.5 flex flex-wrap gap-1">
												{#each task.tags as tag (tag.id)}
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
													<Clock3 size={10} />
													{formatTimingLabel(task)}
												</span>
											</div>
										{/if}

										<div
											class="mt-2 flex items-end justify-between gap-2 border-t border-app-border/70 pt-1.5"
										>
											<div class="min-w-0 flex items-center gap-2 text-[9px] text-app-subtext">
												{#if isCollaborative}
													<div class="relative">
														{#if task.assignedTo && getAssignedMemberLabel(task)}
															<button
																type="button"
																class="inline-flex items-center gap-1 rounded-md border border-app-primary/30 bg-app-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-app-primary transition hover:bg-app-primary/20"
																onclick={(event) => {
																	event.stopPropagation();
																	toggleAssignMenu(column.id, task.id);
																}}
															>
																<span class="inline-block h-3 w-3 rounded-full border border-app-primary/40 bg-app-primary/20 text-center text-[7px] font-bold leading-3 text-app-primary">
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
																	toggleAssignMenu(column.id, task.id);
																}}
															>
																Assign
															</button>
														{/if}
														{#if assignMenuOpen?.colId === column.id && assignMenuOpen?.taskId === task.id}
															<div
																class="absolute bottom-full left-0 z-50 mb-1 min-w-[140px] rounded-lg border border-app-border bg-app-surface p-1 shadow-xl"
																onclick={(event) => event.stopPropagation()}
															>
																{#each members as member (member.userId)}
																	<button
																		type="button"
																		class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition {task.assignedTo === member.userId ? 'bg-app-primary/15 font-semibold text-app-primary' : 'text-app-text hover:bg-app-element'}"
																		onclick={(event) => {
																			event.stopPropagation();
																			assignTask(column.id, task.id, task.assignedTo === member.userId ? undefined : member.userId);
																		}}
																	>
																		<span class="inline-block h-4 w-4 shrink-0 rounded-full border border-app-border bg-app-element text-center text-[8px] font-bold leading-4 text-app-subtext">
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
																				assignTask(column.id, task.id, undefined);
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
												{#if task.completedAt}
													<p>Completed {formatDate(task.completedAt)}</p>
												{:else if task.description?.trim()}
													<p>Has description</p>
												{/if}
											</div>

											<div class="flex items-center">
												<button
													type="button"
													class="rounded-md p-1 text-app-subtext transition hover:bg-app-element hover:text-app-accent"
													title="Queue for chat"
													onclick={(event) => {
														event.stopPropagation();
														onSendToChat({ task, column });
														closeMenus();
													}}
												>
													<MessageSquarePlus size={13} />
												</button>

												<div class="relative">
													<button
														type="button"
														class="rounded-md p-1 text-app-subtext transition hover:bg-app-element hover:text-app-text"
														onclick={(event) => {
															event.stopPropagation();
															toggleTaskMenu(
																column.id,
																task.id,
																event.currentTarget as HTMLButtonElement
															);
														}}
													>
														<Ellipsis size={13} />
													</button>
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				<button
					type="button"
					class="flex h-12 w-64 shrink-0 items-center justify-center gap-2 self-start rounded-[1.1rem] border border-dashed border-app-border bg-app-surface/40 text-sm font-semibold text-app-subtext transition hover:border-app-primary/40 hover:text-app-primary"
					onclick={addColumn}
				>
					<Plus size={18} />
					Add Column
				</button>
			</div>
		{:else}
			<div class="flex h-full min-w-max gap-3">
				{#each diffData as column, index (column.id)}
					<div
						class={`flex h-full shrink-0 flex-col overflow-hidden rounded-[1.15rem] border bg-app-surface/80 ${
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
							class="border-b border-app-border px-3 py-2.5"
							style={column._status === 'unchanged'
								? getColumnHeaderToneStyle(column.color)
								: undefined}
						>
							<div class="flex items-center gap-3">
								<span
									class={`h-2.5 w-2.5 rounded-full ${getColumnDotClassFor(index, column.color)}`}
									style={column.color ? getColumnDotStyle(column.color) : undefined}
								></span>
								<div>
									<h3 class="font-semibold text-app-text">{column.title}</h3>
									<p class="text-[10px] font-bold uppercase tracking-[0.22em] text-app-subtext">
										{column.tasks.length} cards
									</p>
								</div>
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-y-auto p-2.5">
							<div class="flex flex-col gap-2.5">
								{#each column.tasks as task (task.id)}
									<div class={cardClasses(task)} style={getTaskStyle(task)}>
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
												<RichText
													value={task.title}
													className={`kainbu-prose prose-tight text-sm font-medium ${task.checked ? 'opacity-70' : ''}`}
												/>
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
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>

{#if openColumnMenu}
	{@const menuColumn = boardData.find((column) => column.id === openColumnMenu!.columnId)}
	{#if menuColumn}
		{@const currentColumnTone = SURFACE_TONE_OPTIONS.find((t) => t.value === (menuColumn.color || '')) ?? SURFACE_TONE_OPTIONS[0]}
		<div class="pointer-events-none fixed inset-0 z-[140]">
			<div
				role="presentation"
				class="pointer-events-auto fixed w-72 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-2xl border border-app-border bg-app-surface p-2 shadow-kainbu-xl"
				style={`top:${openColumnMenu!.position.top}px; left:${openColumnMenu!.position.left}px;`}
				onmousedown={(event) => event.stopPropagation()}
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
						<span class={`inline-block h-4 w-4 rounded-full border ${currentColumnTone.swatchClass}`}></span>
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
							onmousedown={(event) => event.stopPropagation()}
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
				class="pointer-events-auto fixed w-48 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-xl border border-app-border bg-app-surface p-2 shadow-kainbu-xl"
				style={`top:${openTaskMenu!.position.top}px; left:${openTaskMenu!.position.left}px;`}
				onmousedown={(event) => event.stopPropagation()}
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

{#if editingTask}
	<TaskModal
		task={editingTask.task}
		columnTitle={editingTask.column.title}
		{existingTags}
		onClose={() => (editingTask = null)}
		onSave={(nextTask) => {
			updateTask(editingTask!.column.id, editingTask!.task.id, () => nextTask);
			editingTask = null;
		}}
	/>
{/if}
