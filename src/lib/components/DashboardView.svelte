<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		ArrowRight,
		Check,
		Clock3,
		FolderPlus,
		Mail,
		Pencil,
		Trash2,
		Users,
		X
	} from 'lucide-svelte';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import { formatDueDateValue } from '$lib/kainbu/timing';
	import type { DashboardTimedTask, Project, ProjectInvite } from '$lib/kainbu/types';

	export let projects: Project[] = [];
	export let currentProjectId = '';
	export let incomingInvites: ProjectInvite[] = [];
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

	let inviteDrafts: Record<string, string> = {};
	let inviteOpenFor: string | null = null;
	let renamingId: string | null = null;
	let renameValue = '';

	const startRename = (project: Project) => {
		renamingId = project.id;
		renameValue = project.name;
	};

	const commitRename = () => {
		if (renamingId && renameValue.trim()) {
			onRenameProject(renamingId, renameValue.trim());
		}
		renamingId = null;
	};
	let now = Date.now();
	let tickInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		tickInterval = setInterval(() => {
			now = Date.now();
		}, 1000);
	});
	onDestroy(() => {
		clearInterval(tickInterval);
	});

	const formatCountdown = (target: number, now: number) => {
		const delta = target - now;
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

	$: ownedProjects = projects.filter((project) => project.accessRole === 'owner');
	$: sharedProjects = projects.filter((project) => project.accessRole === 'member');

	const submitInvite = (projectId: string) => {
		const email = inviteDrafts[projectId]?.trim();
		if (!email) return;
		onInvite(projectId, email);
		inviteDrafts = {
			...inviteDrafts,
			[projectId]: ''
		};
	};

	const setInviteDraft = (projectId: string, value: string) => {
		inviteDrafts = {
			...inviteDrafts,
			[projectId]: value
		};
	};
</script>

<section
	class="absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5"
>
	<div class="mx-auto flex min-w-0 max-w-7xl flex-col gap-3 sm:gap-4">
		<!-- Header row -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap gap-3 text-xs text-app-subtext">
				<span><span class="font-semibold text-app-text">{projects.length}</span> boards</span>
				<span class="text-app-border">|</span>
				<span><span class="font-semibold text-app-text">{timedTasks.length}</span> due dates</span>
			</div>
			<div class="flex w-full flex-wrap gap-2 sm:w-auto">
				<button
					type="button"
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-app-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-app-primary-hover sm:flex-none"
					on:click={onCreateProject}
				>
					<FolderPlus size={14} />
					New board
				</button>
				{#if currentProjectId}
					<button
						type="button"
						class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-app-border bg-app-element px-3 py-2 text-sm font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary sm:flex-none"
						on:click={() => onOpenProject(currentProjectId)}
					>
						Current board
						<ArrowRight size={14} />
					</button>
				{/if}
			</div>
		</div>

		<!-- Incoming invites (compact banner) -->
		{#if incomingInvites.length}
			<div class="rounded-xl border border-app-border bg-app-surface/88 p-3">
				<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-app-primary">
					Incoming Invites ({incomingInvites.length})
				</p>
				<div class="space-y-2 sm:flex sm:flex-wrap sm:gap-2 sm:space-y-0">
					{#each incomingInvites as invite (invite.id)}
						<div
							class="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-app-border bg-app-bg/75 px-3 py-2 sm:flex-nowrap"
						>
							<Mail size={13} class="shrink-0 text-app-primary" />
							<div class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-app-text"
									>{invite.projectName || 'Shared board'}</span
								>
								<span class="block truncate text-xs text-app-subtext">{invite.inviteeEmail}</span>
							</div>
							<button
								type="button"
								class="shrink-0 rounded-md bg-app-primary px-2 py-1 text-xs font-semibold text-white transition hover:bg-app-primary-hover"
								on:click={() => onAcceptInvite(invite.id)}
							>
								<Check size={12} />
							</button>
							<button
								type="button"
								class="shrink-0 rounded-md border border-app-border px-2 py-1 text-xs font-semibold text-app-subtext transition hover:border-rose-400/35 hover:text-rose-300"
								on:click={() => onRejectInvite(invite.id)}
							>
								<X size={12} />
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Main grid -->
		<div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
			<!-- Boards column -->
			<div class="min-w-0 space-y-4">
				<!-- Owned boards -->
				<div class="rounded-xl border border-app-border bg-app-surface/88 p-3 shadow-sm">
					<div class="mb-3 flex items-center justify-between">
						<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-app-primary">
							My Boards ({ownedProjects.length})
						</p>
					</div>

					{#if ownedProjects.length}
						<div class="divide-y divide-app-border">
							{#each ownedProjects as project (project.id)}
								<div
									class={`px-1 py-2 transition ${
										project.id === currentProjectId
											? 'bg-app-primary/6'
											: ''
									}`}
								>
									<div class="flex items-center gap-2">
										<div class="min-w-0 flex-1">
											{#if renamingId === project.id}
												<input
													bind:value={renameValue}
													class="w-full rounded-md border border-app-primary/45 bg-app-bg px-2 py-0.5 text-sm font-semibold text-app-text outline-none"
													on:keydown={(e) => {
														if (e.key === 'Enter') commitRename();
														if (e.key === 'Escape') renamingId = null;
													}}
													on:blur={commitRename}
												/>
											{:else}
												<button
													type="button"
													class="truncate text-sm font-semibold text-app-text hover:text-app-primary transition"
													on:click={() => onOpenProject(project.id)}
												>
													{project.name}
												</button>
											{/if}
											<div class="flex flex-wrap items-center gap-1 text-[11px] text-app-subtext">
												<Users size={10} class="shrink-0" />
												<span class="tabular-nums">{project.members.length}</span>
												{#each project.members as member (`${project.id}-${member.userId}`)}
													<span class="inline-flex items-center gap-0.5">
														<span class="max-w-40 truncate">
															{member.isCurrentUser ? 'You' : member.email || member.userId}
														</span>
														{#if member.role !== 'owner'}
															<button
																type="button"
																class="text-app-subtext/40 hover:text-rose-400"
																on:click={() => onRemoveMember(project.id, member.userId)}
															>
																<X size={9} />
															</button>
														{/if}
													</span>
												{/each}
												{#each project.invites as invite (`${project.id}-${invite.id}`)}
													<span class="inline-flex items-center gap-0.5 italic">
														<span class="max-w-40 truncate">{invite.inviteeEmail}</span>
														<button
															type="button"
															class="text-app-subtext/40 hover:text-rose-400"
															on:click={() => onCancelInvite(invite.id)}
														>
															<X size={9} />
														</button>
													</span>
												{/each}
											</div>
										</div>
										<button
												type="button"
												class="shrink-0 ml-auto inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-semibold text-app-subtext transition hover:bg-app-element hover:text-app-primary"
												on:click={() => onOpenProject(project.id)}
											>
												Open <ArrowRight size={11} />
											</button>
									</div>
									<div class="mt-1.5 flex flex-wrap gap-2 pl-1">
										<button
											type="button"
											class="rounded-lg border border-app-border p-2.5 text-app-subtext/60 transition hover:border-app-primary/35 hover:text-app-primary lg:p-1.5"
											title="Rename"
											on:click={() => startRename(project)}
										>
											<Pencil size={16} class="lg:hidden" />
											<Pencil size={13} class="hidden lg:block" />
										</button>
										<button
											type="button"
											class="rounded-lg border border-app-border p-2.5 text-app-subtext/60 transition hover:border-rose-400/35 hover:text-rose-400 lg:p-1.5"
											title="Delete"
											on:click={() => onDeleteProject(project.id)}
										>
											<Trash2 size={16} class="lg:hidden" />
											<Trash2 size={13} class="hidden lg:block" />
										</button>
										<button
											type="button"
											class="rounded-lg border border-app-border p-2.5 text-app-subtext/60 transition hover:border-app-primary/35 hover:text-app-primary lg:p-1.5"
											title="Invite"
											on:click={() =>
												(inviteOpenFor = inviteOpenFor === project.id ? null : project.id)}
										>
											<Mail size={16} class="lg:hidden" />
											<Mail size={13} class="hidden lg:block" />
										</button>
									</div>

									{#if inviteOpenFor === project.id}
										<div class="mt-1.5 flex gap-1.5 pl-1">
											<input
												value={inviteDrafts[project.id] || ''}
												type="email"
												placeholder="teammate@example.com"
												class="min-w-0 flex-1 rounded-md border border-app-border bg-app-bg px-2 py-1 text-xs text-app-text outline-none transition focus:border-app-primary/45"
												on:input={(event) =>
													setInviteDraft(
														project.id,
														(event.currentTarget as HTMLInputElement).value
													)}
												on:keydown={(event) => {
													if (event.key === 'Enter') submitInvite(project.id);
												}}
											/>
											<button
												type="button"
												class="rounded-md bg-app-primary px-2 py-1 text-xs font-semibold text-white transition hover:bg-app-primary-hover"
												on:click={() => submitInvite(project.id)}
											>
												Send
											</button>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<p class="py-4 text-center text-sm text-app-subtext">
							No owned boards yet. Create one to get started.
						</p>
					{/if}
				</div>

				<!-- Shared boards -->
				{#if sharedProjects.length}
					<div class="rounded-xl border border-app-border bg-app-surface/88 p-3 shadow-sm">
						<p class="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-app-primary">
							Shared With Me ({sharedProjects.length})
						</p>
						<div class="divide-y divide-app-border">
							{#each sharedProjects as project (project.id)}
								<div
									class={`px-1 py-2 transition ${
										project.id === currentProjectId
											? 'bg-app-accent/6'
											: ''
									}`}
								>
									<div class="flex items-center gap-2">
										<div class="min-w-0 flex-1">
											<button
												type="button"
												class="truncate text-sm font-semibold text-app-text hover:text-app-primary transition"
												on:click={() => onOpenProject(project.id)}
											>
												{project.name}
											</button>
											<div class="flex flex-wrap items-center gap-1 text-[11px] text-app-subtext">
												<Users size={10} class="shrink-0" />
												<span class="tabular-nums">{project.members.length}</span>
												{#each project.members as member (`shared-${project.id}-${member.userId}`)}
													<span class="max-w-40 truncate">
														{member.isCurrentUser ? 'You' : member.email || member.userId}
													</span>
												{/each}
											</div>
										</div>
										<div class="flex shrink-0 items-center gap-1">
											<button
												type="button"
												class="ml-1 inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-semibold text-app-subtext transition hover:bg-app-element hover:text-app-primary"
												on:click={() => onOpenProject(project.id)}
											>
												Open <ArrowRight size={11} />
											</button>
											<button
												type="button"
												class="rounded-md px-2 py-1 text-xs font-semibold text-app-subtext/60 transition hover:bg-app-element hover:text-rose-300"
												on:click={() => onLeaveProject(project.id)}
											>
												Leave
											</button>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Due dates sidebar -->
			<div
				class="min-w-0 rounded-xl border border-app-border bg-app-surface/88 p-3 shadow-sm lg:self-start"
			>
				<div class="mb-3 flex items-center justify-between">
					<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-app-primary">
						Due Dates ({timedTasks.length})
					</p>
					<Clock3 size={14} class="text-app-accent" />
				</div>

				{#if timedTasks.length}
					<div class="divide-y divide-app-border">
						{#each timedTasks as timed (`${timed.projectId}-${timed.task.id}`)}
							<button
								type="button"
								class="w-full py-2 px-0.5 text-left transition hover:bg-app-bg/40"
								on:click={() => onOpenProject(timed.projectId)}
							>
								<div class="flex items-baseline justify-between gap-2">
									<p class="min-w-0 truncate text-sm font-medium text-app-text">
										{timed.task.title}
									</p>
									<p
										class="shrink-0 font-mono text-xs font-bold tabular-nums {timed.dueAt - now <= 0
											? 'text-rose-400'
											: 'text-app-text/70'}"
									>
										{formatCountdown(timed.dueAt, now)}
									</p>
								</div>
								<div class="flex items-center gap-2 text-[10px] text-app-subtext">
									<span>{timed.projectName} / {timed.columnTitle}</span>
									<span class="ml-auto shrink-0">Due {formatDueDateValue(timed.dueAt)}</span>
								</div>
								{#if timed.task.tags.length}
									<div class="mt-1 flex flex-wrap gap-1">
										{#each timed.task.tags.slice(0, 3) as tag (tag.id)}
											<span
												class={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${getTagToneClasses(tag.color)}`}
											>
												{tag.label}
											</span>
										{/each}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div class="py-6 text-center">
						<Clock3 size={16} class="mx-auto text-app-subtext" />
						<p class="mt-2 text-xs text-app-subtext">No active due dates</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</section>
