<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		ArrowRight,
		Check,
		Clock3,
		FolderPlus,
		KeyRound,
		Mail,
		Pencil,
		Pin,
		PinOff,
		Trash2,
		Users,
		X
	} from '$lib/icons';
	import { getProjectMemberDisplayName } from '$lib/kainbu/members';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import { formatDueDateValue } from '$lib/kainbu/timing';
	import {
		buildWorkspaceActivitySummary,
		getActivityWindowStart,
		getDailyActivity,
		paginateActivityEvents,
		summarizeActivityDelta,
		type WorkspaceActivityEvent,
		type WorkspaceActivityGroup
	} from '$lib/kainbu/activity';
	import type { DashboardTimedTask, Project, ProjectInvite } from '$lib/kainbu/types';

	export let projects: Project[] = [];
	export let currentProjectId = '';
	export let incomingInvites: ProjectInvite[] = [];
	export let inviteFeedback: {
		projectId: string;
		kind: 'success' | 'error';
		message: string;
	} | null = null;
	export let timedTasks: DashboardTimedTask[] = [];
	export let onCreateProject: () => void;
	export let onOpenProject: (projectId: string) => void;
	export let onInvite: (projectId: string, email: string) => void;
	export let onAcceptInvite: (inviteId: string) => void;
	export let onRejectInvite: (inviteId: string) => void;
	export let onCancelInvite: (inviteId: string) => void;
	export let onRemoveMember: (projectId: string, memberUserId: string) => void;
	export let onLeaveProject: (projectId: string) => void;
	export let onRenameProject: (projectId: string, newName: string) => void;
	export let onDeleteProject: (projectId: string) => void;
	export let onToggleProjectPin: (projectId: string, pinned: boolean) => void;
	export let onClearTimedTaskDue: (projectId: string, columnId: string, taskId: string) => void;

	let shortcutsOpen = false;
	let inviteDrafts: Record<string, string> = {};
	let inviteOpenFor: string | null = null;
	let renamingId: string | null = null;
	let renameValue = '';
	let tickNow = Date.now();
	let tickInterval: ReturnType<typeof setInterval>;
	let activityFilter: WorkspaceActivityGroup | 'all' = 'all';
	let activityTimeWindow: string = '7d';
	let activityProjectFilter = 'all';
	let activityPageSize = 5;
	let activityPages: Record<string, number> = {};
	let workspaceActivityPage = 1;
	let summaryNow = Date.now();

	const pageButtons = (current: number, total: number): (number | '...')[] => {
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
		const pages: (number | '...')[] = [];
		pages.push(1);
		if (current > 3) pages.push('...');
		const start = Math.max(2, current - 1);
		const end = Math.min(total - 1, current + 1);
		for (let i = start; i <= end; i++) pages.push(i);
		if (current < total - 2) pages.push('...');
		pages.push(total);
		return pages;
	};

	const startRename = (project: Project) => {
		renamingId = project.id;
		renameValue = project.name;
	};

	const commitRename = () => {
		if (renamingId && renameValue.trim()) {
			onRenameProject(renamingId, renameValue.trim());
		}
		renamingId = null;
		renameValue = '';
	};

	onMount(() => {
		tickInterval = setInterval(() => {
			tickNow = Date.now();
		}, 1000);
	});

	onDestroy(() => {
		clearInterval(tickInterval);
	});

	const formatCountdown = (target: number, currentNow: number) => {
		const delta = target - currentNow;
		if (delta <= 0) return 'expired';
		const d = Math.floor(delta / 86_400_000);
		const h = Math.floor((delta % 86_400_000) / 3_600_000);
		const m = Math.floor((delta % 3_600_000) / 60_000);
		const s = Math.floor((delta % 60_000) / 1000);
		const parts: string[] = [];
		if (d > 0) parts.push(`${d}d`);
		if (h > 0) parts.push(`${h}h`);
		parts.push(`${String(m).padStart(2, '0')}m`);
		parts.push(`${String(s).padStart(2, '0')}s`);
		return parts.join(' ');
	};

	const submitInvite = (projectId: string) => {
		const email = inviteDrafts[projectId]?.trim();
		if (!email) return;
		onInvite(projectId, email);
	};

	$: if (inviteFeedback?.kind === 'success' && inviteFeedback.projectId) {
		const projectId = inviteFeedback.projectId;
		if (inviteDrafts[projectId]) {
			inviteDrafts = { ...inviteDrafts, [projectId]: '' };
		}
	}

	const setInviteDraft = (projectId: string, value: string) => {
		inviteDrafts = {
			...inviteDrafts,
			[projectId]: value
		};
	};

	const memberLabel = (project: Project) => `${project.members.filter(m => !m.leftAt).length} people`;
	const getMemberName = (member: Project['members'][number]) => getProjectMemberDisplayName(member);
	const formatActivityTime = (timestamp: number) =>
		new Date(timestamp).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	const formatDeltaTone = (delta: number) =>
		delta > 0
			? 'text-emerald-600 dark:text-emerald-400'
			: delta < 0
				? 'text-amber-600 dark:text-amber-400'
				: 'text-app-subtext';
	const isPinned = (project: Project) => Boolean(project.viewerPinnedAt);
	const projectCardClass = (project: Project, pinnedHighlight = false) => {
		const classes = ['kainbu-board-card'];
		if (project.id === currentProjectId) classes.push('kainbu-board-card--active');
		if (pinnedHighlight) classes.push('kainbu-board-card--pinned');
		return classes.join(' ');
	};
	const compareByPinThenName = (left: Project, right: Project) => {
		const leftPinned = left.viewerPinnedAt ?? 0;
		const rightPinned = right.viewerPinnedAt ?? 0;
		if (leftPinned !== rightPinned) return rightPinned - leftPinned;

		return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
	};

	$: pinnedProjects = projects.filter(isPinned).sort(compareByPinThenName);
	$: ownedProjects = projects
		.filter((project) => project.accessRole === 'owner' && !isPinned(project))
		.sort(compareByPinThenName);
	$: sharedProjects = projects
		.filter((project) => project.accessRole === 'member' && !isPinned(project))
		.sort(compareByPinThenName);
	// Activity is a snapshot of the latest workspace state. Recompute its reference
	// time only when the input projects change; a wall-clock tick must not fabricate
	// activity or reorder the history underneath the user.
	$: if (projects) summaryNow = Date.now();
	$: activitySummary = buildWorkspaceActivitySummary(projects, summaryNow);
	$: activityWindowStart = getActivityWindowStart(activityTimeWindow as '7d' | '30d' | 'all', summaryNow);
	$: groupedWorkspaceActivity = (() => {
		const filtered = activitySummary.events.filter((event) =>
			(!activityProjectFilter || activityProjectFilter === 'all' || event.projectId === activityProjectFilter) &&
			(activityFilter === 'all' || event.group === activityFilter) &&
			event.timestamp >= activityWindowStart && event.timestamp <= summaryNow
		);
		const groups = new Map<string, { projectName: string; events: WorkspaceActivityEvent[] }>();
		for (const event of filtered) {
			const group = groups.get(event.projectId);
			if (group) {
				group.events.push(event);
			} else {
				groups.set(event.projectId, {
					projectName: event.projectName,
					events: [event]
				});
			}
		}
		return Array.from(groups.entries()).map(([projectId, group]) => {
			const page = paginateActivityEvents(group.events, activityPages[projectId] ?? 1, activityPageSize);
			return {
				projectId,
				projectName: group.projectName,
				totalCount: page.totalCount,
				totalPages: page.totalPages,
				currentPage: page.currentPage,
				visibleEvents: page.items
			};
		});
	})();
$: workspaceFlatActivity = (() => {
		if (activityProjectFilter !== 'all') return null;
		const filtered = activitySummary.events.filter((event) =>
			(activityFilter === 'all' || event.group === activityFilter) &&
			event.timestamp >= activityWindowStart && event.timestamp <= summaryNow
		);
		const page = paginateActivityEvents(filtered, workspaceActivityPage, activityPageSize);
		return { events: page.items, totalCount: page.totalCount, totalPages: page.totalPages, currentPage: page.currentPage };
	})();
	$: dailyActivity = getDailyActivity(activitySummary.events, summaryNow, 6);

</script>

	<section
		class="kainbu-dashboard absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6"
	>
		<div class="mx-auto flex min-w-0 max-w-6xl flex-col gap-7">
			<header class="kainbu-dashboard__header flex flex-wrap items-end justify-between gap-4">
				<div class="min-w-0 max-w-xl">
					<p class="kainbu-dashboard__kicker">It's BU, Kainbu</p>
					<h2 class="kainbu-dashboard__title mt-1 text-app-text">Dashboard</h2>
					<dl class="kainbu-dashboard__stats mt-3">
						<div class="kainbu-dashboard__stat">
							<dt class="sr-only">Boards</dt>
							<dd>
								<span class="kainbu-dashboard__stat-value">{projects.length}</span>
								boards
							</dd>
						</div>
						<div class="kainbu-dashboard__stat">
							<dt class="sr-only">Pinned</dt>
							<dd>
								<span class="kainbu-dashboard__stat-value">{pinnedProjects.length}</span>
								pinned
							</dd>
						</div>
						<div class="kainbu-dashboard__stat">
							<dt class="sr-only">Shared</dt>
							<dd>
								<span class="kainbu-dashboard__stat-value">{sharedProjects.length}</span>
								shared
							</dd>
						</div>
						<div class="kainbu-dashboard__stat">
							<dt class="sr-only">Open tasks</dt>
							<dd>
								<span class="kainbu-dashboard__stat-value">{activitySummary.openTaskCount}</span>
								open
							</dd>
						</div>
						<div class="kainbu-dashboard__stat">
							<dt class="sr-only">Completed this week</dt>
							<dd>
								<span class="kainbu-dashboard__stat-value">{activitySummary.completedLast7d}</span>
								done this week
							</dd>
						</div>
					</dl>
				</div>
				<div class="flex w-full flex-wrap gap-2 sm:w-auto">
					<button
						type="button"
						class="kainbu-btn kainbu-btn--primary inline-flex flex-1 items-center justify-center gap-1.5 sm:flex-none"
						on:click={onCreateProject}
					>
						<FolderPlus size={14} />
						New board
					</button>
					{#if currentProjectId}
						<button
							type="button"
							class="kainbu-btn kainbu-btn--ghost inline-flex flex-1 items-center justify-center gap-1.5 sm:flex-none"
							on:click={() => onOpenProject(currentProjectId)}
						>
							Current board
							<ArrowRight size={14} />
						</button>
					{/if}
					<button
						type="button"
						class="kainbu-shortcuts-btn"
						on:click={() => (shortcutsOpen = !shortcutsOpen)}
						aria-label="Keyboard shortcuts and tips"
						title="Shortcuts & tips"
					>
						<KeyRound size={14} />
					</button>
				</div>
			</header>

			{#if incomingInvites.length}
				<div class="kainbu-dashboard__invites">
					<h3 class="kainbu-dashboard__section-label">
						Incoming invites
						<span class="kainbu-dashboard__section-count">{incomingInvites.length}</span>
					</h3>
					<div class="mt-2.5 flex flex-wrap gap-2">
						{#each incomingInvites as invite (invite.id)}
							<div class="kainbu-invite-chip">
								<Mail size={13} class="shrink-0 text-app-primary" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-app-text">
										{invite.projectName || 'Shared board'}
									</p>
									<p class="truncate text-xs text-app-subtext">{invite.inviteeEmail}</p>
								</div>
								<button
									type="button"
									class="kainbu-btn kainbu-btn--primary kainbu-btn--compact px-2 py-1"
									on:click={() => onAcceptInvite(invite.id)}
									aria-label="Accept invite"
								>
									<Check size={12} />
								</button>
								<button
									type="button"
									class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact px-2 py-1 text-app-subtext"
									on:click={() => onRejectInvite(invite.id)}
									aria-label="Decline invite"
								>
									<X size={12} />
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="flex flex-col gap-7">
				<section class="kainbu-dashboard__insights">
					<div class="kainbu-insight">
						<p class="kainbu-insight__label">Today</p>
						<p class="kainbu-insight__value">{activitySummary.activityToday}</p>
						<p class="kainbu-insight__meta">workspace actions</p>
					</div>
					<div class="kainbu-insight">
						<p class="kainbu-insight__label">This week</p>
						<p class="kainbu-insight__value">{activitySummary.activityLast7d}</p>
						<p class={`kainbu-insight__meta ${formatDeltaTone(activitySummary.activityDelta)}`}>
							{summarizeActivityDelta(activitySummary.activityDelta)}
						</p>
					</div>
					<div class="kainbu-insight">
						<p class="kainbu-insight__label">Created</p>
						<p class="kainbu-insight__value">{activitySummary.createdLast7d}</p>
						<p class="kainbu-insight__meta">new tasks this week</p>
					</div>
					<div class="kainbu-insight">
						<p class="kainbu-insight__label">Completed</p>
						<p class="kainbu-insight__value">{activitySummary.completedLast7d}</p>
						<p class="kainbu-insight__meta">{activitySummary.completedTaskCount} total</p>
					</div>
				</section>

				<section class="kainbu-dashboard__activity-band">
					<div class="min-w-0">
						<h3 class="kainbu-dashboard__section-label">
							Daily activity
							<span class="kainbu-dashboard__section-count">{dailyActivity.length}</span>
						</h3>
						<p class="mt-1 text-xs text-app-subtext">Human workspace events from today (local calendar day).</p>
					</div>
					{#if dailyActivity.length}
						<div class="kainbu-activity-strip kainbu-scrollbar-hidden">
							{#each dailyActivity as event (event.id)}
								<button
									type="button"
									class="kainbu-activity-pill"
									on:click={() => onOpenProject(event.projectId)}
								>
									<span class="kainbu-activity-pill__kind">{event.title}</span>
									<span class="truncate">{event.detail}</span>
									<span class="kainbu-activity-pill__time">{formatActivityTime(event.timestamp)}</span>
								</button>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-app-subtext">No fresh activity yet today.</p>
					{/if}
				</section>

				{#if activityProjectFilter !== 'all' && groupedWorkspaceActivity.length}
					<section class="kainbu-dashboard__activity-log">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 class="kainbu-dashboard__section-label">
									Workspace activity
									<span class="kainbu-dashboard__section-count">{groupedWorkspaceActivity.reduce((n, g) => n + g.totalCount, 0)}</span>
								</h3>
								<p class="mt-1 text-xs text-app-subtext">Chronological human events for the selected board.</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<select
									class="kainbu-activity-filter__button text-xs"
									bind:value={activityProjectFilter}
									aria-label="Project filter"
								>
									<option value="all">All projects</option>
									{#each projects as project (project.id)}
										<option value={project.id}>{project.name}</option>
									{/each}
								</select>
								<div class="kainbu-activity-filter" aria-label="Time window">
									{#each ['7d', '30d', 'all'] as window}
										<button
											type="button"
											class:kainbu-activity-filter__button--active={activityTimeWindow === window}
											class="kainbu-activity-filter__button"
											on:click={() => (activityTimeWindow = window)}
										>
											{window}
										</button>
									{/each}
								</div>
								<div class="kainbu-activity-filter" aria-label="Activity filter">
									{#each ['all', 'task', 'people'] as filter}
										<button
											type="button"
											class:kainbu-activity-filter__button--active={activityFilter === filter}
											class="kainbu-activity-filter__button"
											on:click={() => (activityFilter = filter as WorkspaceActivityGroup | 'all')}
										>
											{filter}
										</button>
									{/each}
								</div>
							</div>
						</div>
						<div class="mt-3 space-y-4">
							{#each groupedWorkspaceActivity as group (group.projectId)}
								<div>
									<div class="kainbu-activity-project-header">
										<span class="kainbu-activity-row__dot" data-group="project"></span>
										<button
											type="button"
											class="text-base font-bold text-app-text transition hover:text-app-primary"
											on:click={() => onOpenProject(group.projectId)}
										>
											{group.projectName}
										</button>
										<span class="text-xs text-app-subtext">{group.totalCount}</span>
									</div>
									<div class="divide-y divide-app-border/50">
										{#each group.visibleEvents as event (event.id)}
											<button
												type="button"
												class="kainbu-activity-row"
												on:click={() => onOpenProject(event.projectId)}
											>
												<span class="kainbu-activity-row__dot" data-group={event.group}></span>
												<span class="min-w-0 flex-1">
													<span class="block truncate text-sm font-medium text-app-text">{event.title}</span>
													<span class="block truncate text-xs text-app-subtext">{event.detail}</span>
												</span>
												<span class="shrink-0 text-[11px] text-app-subtext">{formatActivityTime(event.timestamp)}</span>
											</button>
										{/each}
									</div>
									{#if group.totalPages > 1}
										<div class="mt-2 flex items-center justify-center gap-1 w-full">
											<button
												type="button"
												class="kainbu-activity-filter__button text-xs"
												disabled={group.currentPage <= 1}
												on:click={() => { activityPages = { ...activityPages, [group.projectId]: group.currentPage - 1 }; }}
											>
												←
											</button>
											{#each pageButtons(group.currentPage, group.totalPages) as btn}
												{#if btn === '...'}
													<span class="px-1 text-xs text-app-subtext">…</span>
												{:else}
													<button
														type="button"
														class="kainbu-activity-filter__button text-xs"
														class:kainbu-activity-filter__button--active={group.currentPage === btn}
														on:click={() => { activityPages = { ...activityPages, [group.projectId]: btn }; }}
													>
														{btn}
													</button>
												{/if}
											{/each}
											<button
												type="button"
												class="kainbu-activity-filter__button text-xs"
												disabled={group.currentPage >= group.totalPages}
												on:click={() => { activityPages = { ...activityPages, [group.projectId]: group.currentPage + 1 }; }}
											>
												→
											</button>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{:else if workspaceFlatActivity && workspaceFlatActivity.totalCount > 0}
					<section class="kainbu-dashboard__activity-log">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 class="kainbu-dashboard__section-label">
									Workspace activity
									<span class="kainbu-dashboard__section-count">{workspaceFlatActivity.totalCount}</span>
								</h3>
								<p class="mt-1 text-xs text-app-subtext">Chronological human events across your boards.</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<select
									class="kainbu-activity-filter__button text-xs"
									bind:value={activityProjectFilter}
									aria-label="Project filter"
								>
									<option value="all">All projects</option>
									{#each projects as project (project.id)}
										<option value={project.id}>{project.name}</option>
									{/each}
								</select>
								<div class="kainbu-activity-filter" aria-label="Time window">
									{#each ['7d', '30d', 'all'] as window}
										<button
											type="button"
											class:kainbu-activity-filter__button--active={activityTimeWindow === window}
											class="kainbu-activity-filter__button"
											on:click={() => (activityTimeWindow = window)}
										>
											{window}
										</button>
									{/each}
								</div>
								<div class="kainbu-activity-filter" aria-label="Activity filter">
									{#each ['all', 'task', 'people'] as filter}
										<button
											type="button"
											class:kainbu-activity-filter__button--active={activityFilter === filter}
											class="kainbu-activity-filter__button"
											on:click={() => (activityFilter = filter as WorkspaceActivityGroup | 'all')}
										>
											{filter}
										</button>
									{/each}
								</div>
							</div>
						</div>
						<div class="mt-3 divide-y divide-app-border/50">
							{#each workspaceFlatActivity.events as event (event.id)}
								<button
									type="button"
									class="kainbu-activity-row"
									on:click={() => onOpenProject(event.projectId)}
								>
									<span class="kainbu-activity-row__dot" data-group={event.group}></span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm font-medium text-app-text">{event.title}</span>
										<span class="block truncate text-xs text-app-subtext">{event.projectName} · {event.detail}</span>
									</span>
									<span class="shrink-0 text-[11px] text-app-subtext">{formatActivityTime(event.timestamp)}</span>
								</button>
							{/each}
						</div>
						{#if workspaceFlatActivity.totalPages > 1}
							<div class="mt-3 flex items-center justify-center gap-1 w-full">
								<button
									type="button"
									class="kainbu-activity-filter__button text-xs"
									disabled={workspaceFlatActivity.currentPage <= 1}
									on:click={() => { workspaceActivityPage = workspaceFlatActivity.currentPage - 1; }}
								>
									←
								</button>
								{#each pageButtons(workspaceFlatActivity.currentPage, workspaceFlatActivity.totalPages) as btn}
									{#if btn === '...'}
										<span class="px-1 text-xs text-app-subtext">…</span>
									{:else}
										<button
											type="button"
											class="kainbu-activity-filter__button text-xs"
											class:kainbu-activity-filter__button--active={workspaceFlatActivity.currentPage === btn}
											on:click={() => { workspaceActivityPage = btn; }}
										>
											{btn}
										</button>
									{/if}
								{/each}
								<button
									type="button"
									class="kainbu-activity-filter__button text-xs"
									disabled={workspaceFlatActivity.currentPage >= workspaceFlatActivity.totalPages}
									on:click={() => { workspaceActivityPage = workspaceFlatActivity.currentPage + 1; }}
								>
									→
								</button>
							</div>
						{/if}
					</section>
				{:else}
					<section class="kainbu-dashboard__activity-log">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 class="kainbu-dashboard__section-label">Workspace activity</h3>
								<p class="mt-1 text-xs text-app-subtext">Chronological human events across your boards.</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<select
									class="kainbu-activity-filter__button text-xs"
									bind:value={activityProjectFilter}
									aria-label="Project filter"
								>
									<option value="all">All projects</option>
									{#each projects as project (project.id)}
										<option value={project.id}>{project.name}</option>
									{/each}
								</select>
								<div class="kainbu-activity-filter" aria-label="Time window">
									{#each ['7d', '30d', 'all'] as window}
										<button
											type="button"
											class:kainbu-activity-filter__button--active={activityTimeWindow === window}
											class="kainbu-activity-filter__button"
											on:click={() => (activityTimeWindow = window)}
										>
											{window}
										</button>
									{/each}
								</div>
							</div>
						</div>
						<div class="kainbu-dashboard-empty mt-3">
							<p class="text-sm font-medium text-app-text">No activity yet</p>
							<p class="max-w-sm text-sm leading-relaxed text-app-subtext">
								Activity from your boards will appear here as you create and update tasks.
							</p>
						</div>
					</section>
				{/if}

				{#if pinnedProjects.length}
					<section>
						<h3 class="kainbu-dashboard__section-label mb-3">
							Pinned
							<span class="kainbu-dashboard__section-count">{pinnedProjects.length}</span>
						</h3>
						<div class="kainbu-board-rail kainbu-scrollbar-hidden">
							{#each pinnedProjects as project (project.id)}
								{#if project.accessRole === 'owner'}
									<article class={projectCardClass(project, true)}>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												{#if renamingId === project.id}
													<input
														bind:value={renameValue}
														class="w-full rounded-md border border-app-primary/40 bg-app-bg px-2 py-1 text-sm font-semibold text-app-text outline-none"
														on:keydown={(event) => {
															if (event.key === 'Enter') commitRename();
															if (event.key === 'Escape') renamingId = null;
														}}
														on:blur={commitRename}
													/>
												{:else}
													<h4 class="kainbu-board-card__title truncate">
														{project.name}
													</h4>
												{/if}
												<p class="mt-0.5 text-[11px] text-app-subtext">
													Updated {new Date(project.updatedAt).toLocaleDateString()}
												</p>
											</div>
											<button
												type="button"
												class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
												on:click={() => onOpenProject(project.id)}
											>
												Open
												<ArrowRight size={11} />
											</button>
										</div>

										<div class="mt-3 flex items-center gap-1.5 text-[11px] text-app-subtext">
											<Users size={11} />
											<span>{memberLabel(project)}</span>
											<div class="ml-1 flex flex-wrap gap-1">
												{#each project.members.filter(m => !m.leftAt).slice(0, 4) as member (`pinned-${project.id}-${member.userId}`)}
													<span class="inline-flex items-center gap-1 rounded-md bg-app-element/40 px-1.5 py-0.5 text-[10px] text-app-text/80">
														<span class="max-w-24 truncate">{getMemberName(member)}</span>
														{#if member.role !== 'owner'}
															<button
																type="button"
																class="text-app-subtext/40 transition hover:text-rose-400"
																on:click={() => onRemoveMember(project.id, member.userId)}
															>
																<X size={9} />
															</button>
														{/if}
													</span>
												{/each}
											</div>
										</div>

										{#if project.invites.length}
											<div class="mt-2 flex flex-wrap gap-1">
												{#each project.invites as invite (`pinned-${project.id}-${invite.id}`)}
													<button
														type="button"
														class="inline-flex items-center gap-1 rounded-md bg-app-element/30 px-1.5 py-0.5 text-[10px] text-app-subtext transition hover:text-rose-300"
														on:click={() => onCancelInvite(invite.id)}
													>
														<span class="truncate max-w-24">{invite.inviteeEmail}</span>
														<X size={9} />
													</button>
												{/each}
											</div>
										{/if}

										<div class="kainbu-board-card__toolbar flex items-center gap-1.5">
											<button
												type="button"
												class="rounded-md p-1.5 text-app-primary transition hover:text-app-primary-hover"
												on:click={() => onToggleProjectPin(project.id, false)}
												aria-label="Unpin board"
												title="Unpin"
											>
												<PinOff size={13} />
											</button>
											<button
												type="button"
												class="rounded-md p-1.5 text-app-subtext/60 transition hover:text-app-primary"
												on:click={() => startRename(project)}
												aria-label="Rename"
											>
												<Pencil size={13} />
											</button>
											<button
												type="button"
												class="rounded-md p-1.5 text-app-subtext/60 transition hover:text-app-primary"
												on:click={() =>
													(inviteOpenFor = inviteOpenFor === project.id ? null : project.id)}
												aria-label="Invite"
											>
												<Mail size={13} />
											</button>
											<button
												type="button"
												class="rounded-md p-1.5 text-app-subtext/60 transition hover:text-rose-400"
												on:click={() => onDeleteProject(project.id)}
												aria-label="Delete"
											>
												<Trash2 size={13} />
											</button>
										</div>

										{#if inviteOpenFor === project.id}
											<div class="mt-2 flex gap-2">
												<input
													value={inviteDrafts[project.id] || ''}
													type="email"
													placeholder="teammate@example.com"
													class="min-w-0 flex-1 rounded-lg border border-app-border/50 bg-app-bg px-3 py-1.5 text-xs text-app-text outline-none transition focus:border-app-primary/40"
													on:input={(event) =>
														setInviteDraft(project.id, (event.currentTarget as HTMLInputElement).value)}
													on:keydown={(event) => {
														if (event.key === 'Enter') submitInvite(project.id);
													}}
												/>
												<button
													type="button"
													class="kainbu-btn kainbu-btn--primary kainbu-btn--compact"
													on:click={() => submitInvite(project.id)}
												>
													Send
												</button>
											</div>
											{#if inviteFeedback?.projectId === project.id}
												<p
													class={`mt-1.5 text-xs ${inviteFeedback.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}
												>
													{inviteFeedback.message}
												</p>
											{/if}
										{/if}
									</article>
								{:else}
									<article class={projectCardClass(project, true)}>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<h4 class="kainbu-board-card__title truncate">{project.name}</h4>
												<p class="mt-0.5 text-[11px] text-app-subtext">
													{memberLabel(project)}
												</p>
											</div>
											<button
												type="button"
												class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
												on:click={() => onOpenProject(project.id)}
											>
												Open
												<ArrowRight size={11} />
											</button>
										</div>
										<div class="mt-2 flex flex-wrap gap-1">
											{#each project.members.filter(m => !m.leftAt).slice(0, 5) as member (`pinned-shared-${project.id}-${member.userId}`)}
												<span class="inline-flex rounded-md bg-app-element/40 px-1.5 py-0.5 text-[10px] text-app-text/80">
													{getMemberName(member)}
												</span>
											{/each}
										</div>
										<div class="mt-3 flex items-center justify-between gap-2">
											<div class="flex items-center gap-1.5">
												<button
													type="button"
													class="rounded-md p-1.5 text-app-primary transition hover:text-app-primary-hover"
													on:click={() => onToggleProjectPin(project.id, false)}
													aria-label="Unpin board"
													title="Unpin"
												>
													<PinOff size={13} />
												</button>
												<button
													type="button"
													class="inline-flex items-center gap-1 text-xs font-medium text-app-subtext transition hover:text-app-primary"
													on:click={() => onOpenProject(project.id)}
												>
													Open board
													<ArrowRight size={11} />
												</button>
											</div>
											<button
												type="button"
												class="text-xs text-app-subtext/60 transition hover:text-rose-400"
												on:click={() => onLeaveProject(project.id)}
											>
												Leave
											</button>
										</div>
									</article>
								{/if}
							{/each}
						</div>
					</section>
				{/if}

				<section>
					<h3 class="kainbu-dashboard__section-label mb-3">
						Your boards
						<span class="kainbu-dashboard__section-count">{ownedProjects.length}</span>
					</h3>

					{#if ownedProjects.length}
						<div class="kainbu-board-grid">
							{#each ownedProjects as project (project.id)}
								<article class={projectCardClass(project)}>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											{#if renamingId === project.id}
												<input
													bind:value={renameValue}
													class="w-full rounded-md border border-app-primary/40 bg-app-bg px-2 py-1 text-sm font-semibold text-app-text outline-none"
													on:keydown={(event) => {
														if (event.key === 'Enter') commitRename();
														if (event.key === 'Escape') renamingId = null;
													}}
													on:blur={commitRename}
												/>
											{:else}
												<h4 class="kainbu-board-card__title truncate">
													{project.name}
												</h4>
											{/if}
											<p class="mt-0.5 text-[11px] text-app-subtext">
												Updated {new Date(project.updatedAt).toLocaleDateString()}
											</p>
										</div>
										<button
											type="button"
											class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
											on:click={() => onOpenProject(project.id)}
										>
											Open
											<ArrowRight size={11} />
										</button>
									</div>

									<div class="mt-3 flex items-center gap-1.5 text-[11px] text-app-subtext">
										<Users size={11} />
										<span>{memberLabel(project)}</span>
										<div class="ml-1 flex flex-wrap gap-1">
											{#each project.members.filter(m => !m.leftAt).slice(0, 4) as member (`${project.id}-${member.userId}`)}
												<span class="inline-flex items-center gap-1 rounded-md bg-app-element/40 px-1.5 py-0.5 text-[10px] text-app-text/80">
													<span class="max-w-24 truncate">{getMemberName(member)}</span>
													{#if member.role !== 'owner'}
														<button
															type="button"
															class="text-app-subtext/40 transition hover:text-rose-400"
															on:click={() => onRemoveMember(project.id, member.userId)}
														>
															<X size={9} />
														</button>
													{/if}
												</span>
											{/each}
										</div>
									</div>

									{#if project.invites.length}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each project.invites as invite (`${project.id}-${invite.id}`)}
												<button
													type="button"
													class="inline-flex items-center gap-1 rounded-md bg-app-element/30 px-1.5 py-0.5 text-[10px] text-app-subtext transition hover:text-rose-300"
													on:click={() => onCancelInvite(invite.id)}
												>
													<span class="truncate max-w-24">{invite.inviteeEmail}</span>
													<X size={9} />
												</button>
											{/each}
										</div>
									{/if}

									<div class="kainbu-board-card__toolbar flex items-center gap-1.5">
										<button
											type="button"
											class={`rounded-md p-1.5 transition ${
												isPinned(project)
													? 'text-app-primary hover:text-app-primary-hover'
													: 'text-app-subtext/60 hover:text-app-primary'
											}`}
											on:click={() => onToggleProjectPin(project.id, !isPinned(project))}
											aria-label={isPinned(project) ? 'Unpin board' : 'Pin board'}
											title={isPinned(project) ? 'Unpin' : 'Pin'}
										>
											{#if isPinned(project)}
												<PinOff size={13} />
											{:else}
												<Pin size={13} />
											{/if}
										</button>
										<button
											type="button"
											class="rounded-md p-1.5 text-app-subtext/60 transition hover:text-app-primary"
											on:click={() => startRename(project)}
											aria-label="Rename"
										>
											<Pencil size={13} />
										</button>
										<button
											type="button"
											class="rounded-md p-1.5 text-app-subtext/60 transition hover:text-app-primary"
											on:click={() =>
												(inviteOpenFor = inviteOpenFor === project.id ? null : project.id)}
											aria-label="Invite"
										>
											<Mail size={13} />
										</button>
										<button
											type="button"
											class="rounded-md p-1.5 text-app-subtext/60 transition hover:text-rose-400"
											on:click={() => onDeleteProject(project.id)}
											aria-label="Delete"
										>
											<Trash2 size={13} />
										</button>
									</div>

									{#if inviteOpenFor === project.id}
										<div class="mt-2 flex gap-2">
											<input
												value={inviteDrafts[project.id] || ''}
												type="email"
												placeholder="teammate@example.com"
												class="min-w-0 flex-1 rounded-lg border border-app-border/50 bg-app-bg px-3 py-1.5 text-xs text-app-text outline-none transition focus:border-app-primary/40"
												on:input={(event) =>
													setInviteDraft(project.id, (event.currentTarget as HTMLInputElement).value)}
												on:keydown={(event) => {
													if (event.key === 'Enter') submitInvite(project.id);
												}}
											/>
											<button
												type="button"
												class="kainbu-btn kainbu-btn--primary kainbu-btn--compact"
												on:click={() => submitInvite(project.id)}
											>
												Send
											</button>
										</div>
										{#if inviteFeedback?.projectId === project.id}
											<p
												class={`mt-1.5 text-xs ${inviteFeedback.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}
											>
												{inviteFeedback.message}
											</p>
										{/if}
									{/if}
								</article>
							{/each}
						</div>
					{:else}
						<div class="kainbu-dashboard-empty">
							<p class="text-sm font-medium text-app-text">No boards yet</p>
							<p class="max-w-sm text-sm leading-relaxed text-app-subtext">
								Create a board to start organizing tasks, notes, and invites in one place.
							</p>
							<button
								type="button"
								class="kainbu-btn kainbu-btn--ghost mt-1"
								on:click={onCreateProject}
							>
								<FolderPlus size={14} />
								Create your first board
							</button>
						</div>
					{/if}
				</section>

				<section>
					<h3 class="kainbu-dashboard__section-label mb-3">
						Shared with you
						<span class="kainbu-dashboard__section-count">{sharedProjects.length}</span>
					</h3>

					{#if sharedProjects.length}
						<div class="kainbu-board-grid">
							{#each sharedProjects as project (project.id)}
								<article class={projectCardClass(project)}>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<h4 class="kainbu-board-card__title truncate">{project.name}</h4>
											<p class="mt-0.5 text-[11px] text-app-subtext">
												{memberLabel(project)}
											</p>
										</div>
										<button
											type="button"
											class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
											on:click={() => onOpenProject(project.id)}
										>
											Open
											<ArrowRight size={11} />
										</button>
									</div>
									<div class="mt-2 flex flex-wrap gap-1">
										{#each project.members.filter(m => !m.leftAt).slice(0, 5) as member (`shared-${project.id}-${member.userId}`)}
											<span class="inline-flex rounded-md bg-app-element/40 px-1.5 py-0.5 text-[10px] text-app-text/80">
												{getMemberName(member)}
											</span>
										{/each}
									</div>
									<div class="mt-3 flex items-center justify-between gap-2">
										<div class="flex items-center gap-1.5">
											<button
												type="button"
												class={`rounded-md p-1.5 transition ${
													isPinned(project)
														? 'text-app-primary hover:text-app-primary-hover'
														: 'text-app-subtext/60 hover:text-app-primary'
												}`}
												on:click={() => onToggleProjectPin(project.id, !isPinned(project))}
												aria-label={isPinned(project) ? 'Unpin board' : 'Pin board'}
												title={isPinned(project) ? 'Unpin' : 'Pin'}
											>
												{#if isPinned(project)}
													<PinOff size={13} />
												{:else}
													<Pin size={13} />
												{/if}
											</button>
											<button
												type="button"
												class="inline-flex items-center gap-1 text-xs font-medium text-app-subtext transition hover:text-app-primary"
												on:click={() => onOpenProject(project.id)}
											>
												Open board
												<ArrowRight size={11} />
											</button>
										</div>
										<button
											type="button"
											class="text-xs text-app-subtext/60 transition hover:text-rose-400"
											on:click={() => onLeaveProject(project.id)}
										>
											Leave
										</button>
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="kainbu-dashboard-empty">
							<p class="text-sm font-medium text-app-text">Nothing shared yet</p>
							<p class="max-w-sm text-sm leading-relaxed text-app-subtext">
								When someone invites you to a board, it will appear here for quick access.
							</p>
						</div>
					{/if}
				</section>

				<section>
					<div class="mb-3 flex items-center justify-between gap-3">
						<h3 class="kainbu-dashboard__section-label">
							Due soon
							<span class="kainbu-dashboard__section-count">{timedTasks.length}</span>
						</h3>
						<Clock3 size={14} class="text-app-subtext/70" />
					</div>

					{#if timedTasks.length}
						<div class="kainbu-board-grid kainbu-board-grid--compact">
							{#each timedTasks as timed (`${timed.projectId}-${timed.task.id}`)}
								<article class="kainbu-board-card kainbu-board-card--due">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="kainbu-board-card__title break-words">{timed.task.title}</p>
											<p class="mt-0.5 text-[11px] text-app-subtext">
												{timed.projectName} / {timed.columnTitle}
											</p>
										</div>
										<p class={`shrink-0 font-mono text-xs font-semibold tabular-nums ${timed.dueAt - tickNow <= 0 ? 'text-rose-400' : 'text-app-subtext'}`}>
											{formatCountdown(timed.dueAt, tickNow)}
										</p>
									</div>

									<p class="mt-2 text-xs text-app-subtext">Due {formatDueDateValue(timed.dueAt)}</p>

									{#if timed.task.tags.length}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each timed.task.tags.slice(0, 4) as tag (tag.id)}
												<span class={getTagToneClasses(tag.color)}>
													{tag.label}
												</span>
											{/each}
										</div>
									{/if}
									<div class="mt-3 flex items-center justify-between gap-3">
										<button
											type="button"
											class="inline-flex items-center gap-1 text-xs font-medium text-app-subtext transition hover:text-app-primary"
											on:click={() => onOpenProject(timed.projectId)}
										>
											Open board
											<ArrowRight size={11} />
										</button>
										{#if timed.dueAt <= tickNow}
											<button
												type="button"
												class="text-xs font-semibold text-app-subtext transition hover:text-rose-300"
												on:click={() =>
													onClearTimedTaskDue(
														timed.projectId,
														timed.columnId,
														timed.task.id
													)}
											>
												Clear
											</button>
										{/if}
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="kainbu-dashboard-empty">
							<p class="text-sm font-medium text-app-text">No due dates</p>
							<p class="max-w-sm text-sm leading-relaxed text-app-subtext">
								Tasks with due dates across your boards will show up here.
							</p>
						</div>
					{/if}
				</section>
			</div>
		</div>
	</section>

{#if shortcutsOpen}
	<div class="kainbu-overlay fixed inset-0 z-[130]">
		<button
			type="button"
			class="absolute inset-0"
			aria-label="Close shortcuts"
			on:click={() => (shortcutsOpen = false)}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Shortcuts &amp; cheatsheet"
			class="absolute inset-x-0 bottom-0 z-10 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-app-border/60 bg-app-surface lg:inset-auto lg:left-1/2 lg:top-1/2 lg:max-h-[min(85vh,32rem)] lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-lg"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-app-border/40 px-4 py-3">
				<div>
					<p class="text-sm font-semibold text-app-text">Shortcuts &amp; cheatsheet</p>
					<p class="text-xs text-app-subtext">Tips for using Kainbu boards</p>
				</div>
				<button
					type="button"
					class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
					on:click={() => (shortcutsOpen = false)}
				>
					<X size={16} />
				</button>
			</div>
			<div class="overflow-y-auto px-4 py-3 text-sm text-app-text">
				<div class="space-y-4">
					<section>
						<h4 class="mb-1.5 text-xs font-bold uppercase tracking-wider text-app-subtext">
							Hashtag auto-tagging
						</h4>
						<p class="leading-relaxed text-app-text/85">
							Type <code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">#tagname</code>
							at the end of a task title to automatically create or apply a tag.
						</p>
						<p class="mt-1 text-xs text-app-subtext">
							Example: &ldquo;Fix login bug <code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">#urgent</code>
							<code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">#backend</code>&rdquo;
							&rarr; title becomes &ldquo;Fix login bug&rdquo; with tags [urgent, backend]
						</p>
					</section>

					<section>
						<h4 class="mb-1.5 text-xs font-bold uppercase tracking-wider text-app-subtext">
							Markdown formatting
						</h4>
						<ul class="space-y-1 text-sm text-app-text/85">
							<li><code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">**bold**</code> &mdash; bold text</li>
							<li><code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">*italic*</code> &mdash; italic text</li>
							<li><code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">`code`</code> &mdash; inline code</li>
							<li><code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">- [ ] todo</code> &mdash; checkbox</li>
						</ul>
					</section>

					<section>
						<h4 class="mb-1.5 text-xs font-bold uppercase tracking-wider text-app-subtext">
							Kanban board shortcuts
						</h4>
						<ul class="space-y-1 text-sm text-app-text/85">
							<li><kbd class="rounded bg-app-element/70 px-1.5 py-0.5 font-mono text-[11px] text-app-text">Ctrl+F</kbd> &mdash; Search board tasks</li>
							<li><kbd class="rounded bg-app-element/70 px-1.5 py-0.5 font-mono text-[11px] text-app-text">Esc</kbd> &mdash; Close menus / search / link view</li>
							<li><kbd class="rounded bg-app-element/70 px-1.5 py-0.5 font-mono text-[11px] text-app-text">Enter</kbd> &mdash; Save inline-edited title</li>
							<li><kbd class="rounded bg-app-element/70 px-1.5 py-0.5 font-mono text-[11px] text-app-text">Shift+Enter</kbd> &mdash; New line in title edit</li>
							<li><kbd class="rounded bg-app-element/70 px-1.5 py-0.5 font-mono text-[11px] text-app-text">Double-click</kbd> &mdash; Edit task title inline</li>
						</ul>
					</section>

					<section>
						<h4 class="mb-1.5 text-xs font-bold uppercase tracking-wider text-app-subtext">
							Tips
						</h4>
						<ul class="space-y-1 text-sm text-app-text/85">
							<li>Drag tasks between columns to reorganize</li>
							<li>Click the checkbox icon to toggle task completion</li>
							<li>Use <code class="rounded bg-app-element/60 px-1 py-0.5 font-mono text-[11px]">#tag</code> in the title to auto-tag</li>
							<li>Link tasks to show relationships on the board</li>
						</ul>
					</section>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.kainbu-dashboard {
		background:
			radial-gradient(
				ellipse 80% 50% at 50% -20%,
				color-mix(in oklab, var(--color-app-primary) 8%, transparent),
				transparent 70%
			),
			transparent;
	}

	.kainbu-dashboard__kicker {
		font-size: 0.8125rem;
		font-weight: 500;
		font-style: italic;
		font-family: var(--font-serif);
		color: color-mix(in oklab, var(--color-app-subtext) 92%, var(--color-app-primary));
		letter-spacing: 0.01em;
	}

	.kainbu-dashboard__title {
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3.5vw, 2.375rem);
		font-weight: 700;
		line-height: 1.05;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}

	.kainbu-dashboard__stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.kainbu-dashboard__stat {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-app-subtext);
		background: color-mix(in oklab, var(--color-app-element) 65%, transparent);
		box-shadow: inset 0 1px 0 color-mix(in oklab, white 5%, transparent);
	}

	.kainbu-dashboard__stat-value {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-app-text);
	}

	.kainbu-dashboard__section-label {
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-app-text);
	}

	.kainbu-dashboard__section-count {
		margin-left: 0.35rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--color-app-subtext);
	}

	.kainbu-dashboard__section-count::before {
		content: '·';
		margin-right: 0.35rem;
		opacity: 0.45;
	}

	.kainbu-dashboard__insights {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
		gap: 0.625rem;
	}

	.kainbu-insight {
		min-width: 0;
		padding: 0.875rem 1rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 58%, transparent);
		border-radius: 0.875rem;
		background: color-mix(in oklab, var(--color-app-surface) 82%, transparent);
		box-shadow: inset 0 1px 0 color-mix(in oklab, white 5%, transparent);
	}

	.kainbu-insight__label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-app-subtext);
	}

	.kainbu-insight__value {
		margin-top: 0.25rem;
		font-size: 1.6rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--color-app-text);
	}

	.kainbu-insight__meta {
		margin-top: 0.35rem;
		font-size: 0.75rem;
		color: var(--color-app-subtext);
	}

	.kainbu-dashboard__activity-band,
	.kainbu-dashboard__activity-log {
		padding: 1rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 55%, transparent);
		border-radius: 0.875rem;
		background: color-mix(in oklab, var(--color-app-surface) 74%, transparent);
	}

	.kainbu-dashboard__activity-band {
		display: grid;
		grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
		align-items: center;
		gap: 1rem;
	}

	@media (max-width: 720px) {
		.kainbu-dashboard__activity-band {
			grid-template-columns: 1fr;
		}
	}

	.kainbu-activity-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
	}

	.kainbu-activity-pill {
		display: grid;
		min-width: min(15rem, 78vw);
		gap: 0.1rem;
		padding: 0.65rem 0.75rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-app-element) 58%, transparent);
		text-align: left;
		color: var(--color-app-text);
		transition:
			background 0.16s ease,
			transform 0.16s ease;
	}

	.kainbu-activity-pill:hover {
		background: color-mix(in oklab, var(--color-app-element) 78%, transparent);
		transform: translateY(-1px);
	}

	.kainbu-activity-pill__kind,
	.kainbu-activity-pill__time {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-app-subtext);
	}

	.kainbu-activity-filter {
		display: inline-flex;
		gap: 0.2rem;
		padding: 0.2rem;
		border-radius: 0.65rem;
		background: color-mix(in oklab, var(--color-app-element) 55%, transparent);
	}

	.kainbu-activity-filter__button {
		border-radius: 0.5rem;
		padding: 0.35rem 0.6rem;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: capitalize;
		color: var(--color-app-subtext);
		transition:
			background 0.16s ease,
			color 0.16s ease;
	}

	.kainbu-activity-filter__button:hover,
	.kainbu-activity-filter__button--active {
		background: var(--color-app-surface);
		color: var(--color-app-text);
	}

	.kainbu-activity-row {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.7rem;
		padding: 0.7rem 0;
		text-align: left;
	}

	.kainbu-activity-row:first-child {
		padding-top: 0;
	}

	.kainbu-activity-row:last-child {
		padding-bottom: 0;
	}

	.kainbu-activity-row__dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: var(--color-app-primary);
		box-shadow: 0 0 0 0.22rem color-mix(in oklab, var(--color-app-primary) 12%, transparent);
	}

	.kainbu-activity-row__dot[data-group='people'] {
		background: #0f9f8f;
		box-shadow: 0 0 0 0.22rem color-mix(in oklab, #0f9f8f 13%, transparent);
	}

	.kainbu-activity-row__dot[data-group='project'] {
		background: #f0a050;
		box-shadow: 0 0 0 0.22rem color-mix(in oklab, #f0a050 13%, transparent);
	}

	.kainbu-activity-project-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid color-mix(in oklab, var(--color-app-border) 40%, transparent);
		margin-bottom: 0;
	}

	.kainbu-dashboard-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		padding: 1.25rem 1.125rem;
		border-radius: 0.875rem;
		background: color-mix(in oklab, var(--color-app-element) 40%, transparent);
		border: 1px dashed color-mix(in oklab, var(--color-app-border) 60%, transparent);
	}

	.kainbu-invite-chip {
		display: flex;
		min-width: 14rem;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-app-surface) 88%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 5%, transparent),
			0 1px 2px color-mix(in oklab, var(--color-app-bg) 35%, transparent);
	}

	.kainbu-board-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17.5rem), 1fr));
		gap: 0.875rem;
	}

	.kainbu-board-grid--compact {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
	}

	.kainbu-board-rail {
		display: flex;
		gap: 0.875rem;
		overflow-x: auto;
		padding-bottom: 0.35rem;
		scroll-snap-type: x proximity;
	}

	.kainbu-board-rail :global(.kainbu-board-card) {
		flex: 0 0 min(19rem, 88vw);
		scroll-snap-align: start;
	}

	.kainbu-board-card {
		display: flex;
		flex-direction: column;
		min-height: 10.5rem;
		padding: 1rem 1.125rem;
		border-radius: 0.875rem;
		background: color-mix(in oklab, var(--color-app-surface) 86%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 6%, transparent),
			0 1px 3px color-mix(in oklab, var(--color-app-bg) 45%, transparent);
		transition:
			transform 0.22s ease,
			box-shadow 0.22s ease,
			background-color 0.22s ease;
	}

	.kainbu-board-card:hover {
		transform: translateY(-2px);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 7%, transparent),
			0 8px 24px -12px color-mix(in oklab, var(--color-app-bg) 75%, var(--color-app-primary));
	}

	.kainbu-board-card--active {
		background: color-mix(in oklab, var(--color-app-primary) 7%, var(--color-app-surface));
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-app-primary) 32%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 6%, transparent),
			0 4px 16px -10px color-mix(in oklab, var(--color-app-primary) 35%, transparent);
	}

	.kainbu-board-card--pinned {
		background: color-mix(in oklab, var(--color-app-primary) 5%, var(--color-app-surface));
	}

	.kainbu-board-card--due:hover {
		background: color-mix(in oklab, var(--color-app-element) 55%, var(--color-app-surface));
	}

	.kainbu-board-card__title {
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.015em;
		color: var(--color-app-text);
	}

	.kainbu-board-card__toolbar {
		margin-top: auto;
		padding-top: 0.75rem;
	}

	:root[data-color-mode='light'] .kainbu-board-card {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.72),
			0 1px 3px color-mix(in oklab, var(--color-app-bg) 12%, transparent);
	}

	:root[data-color-mode='light'] .kainbu-board-card:hover {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.85),
			0 10px 28px -14px color-mix(in oklab, var(--color-app-primary) 22%, transparent);
	}

	:root[data-color-mode='light'] .kainbu-dashboard__stat {
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.65);
	}

	.kainbu-shortcuts-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		color: var(--color-app-subtext);
		background: color-mix(in oklab, var(--color-app-element) 65%, transparent);
		box-shadow: inset 0 1px 0 color-mix(in oklab, white 5%, transparent);
		transition:
			background 0.16s ease,
			color 0.16s ease;
		flex-shrink: 0;
	}

	.kainbu-shortcuts-btn:hover {
		background: color-mix(in oklab, var(--color-app-element) 85%, transparent);
		color: var(--color-app-text);
	}
</style>
