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
	import { getProjectMemberDisplayName } from '$lib/kainbu/members';
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
	export let onClearTimedTaskDue: (projectId: string, columnId: string, taskId: string) => void;

	let inviteDrafts: Record<string, string> = {};
	let inviteOpenFor: string | null = null;
	let renamingId: string | null = null;
	let renameValue = '';
	let now = Date.now();
	let tickInterval: ReturnType<typeof setInterval>;

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
			now = Date.now();
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

	const memberLabel = (project: Project) => `${project.members.length} people`;
	const getMemberName = (member: Project['members'][number]) => getProjectMemberDisplayName(member);

	$: ownedProjects = projects.filter((project) => project.accessRole === 'owner');
	$: sharedProjects = projects.filter((project) => project.accessRole === 'member');

</script>

	<section
		class="absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5"
	>
		<div class="mx-auto flex min-w-0 max-w-7xl flex-col gap-5">
			<div class="flex flex-wrap items-end justify-between gap-3 px-1">
				<div>
					<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">It's BU, KainBu</p>
					<h2 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">
						Dashboard
					</h2>
					<div class="mt-2 flex flex-wrap gap-3 text-xs text-app-subtext">
						<span><span class="font-semibold text-app-text">{projects.length}</span> boards</span>
						<span><span class="font-semibold text-app-text">{sharedProjects.length}</span> shared</span>
						<span><span class="font-semibold text-app-text">{timedTasks.length}</span> due items</span>
					</div>
				</div>
				<div class="flex w-full flex-wrap gap-2 sm:w-auto">
					<button
						type="button"
						class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-app-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-app-primary-hover sm:flex-none"
						on:click={onCreateProject}
					>
						<FolderPlus size={14} />
						New board
					</button>
					{#if currentProjectId}
						<button
							type="button"
							class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-app-border px-4 py-2 text-sm font-semibold text-app-text transition hover:text-app-primary sm:flex-none"
							on:click={() => onOpenProject(currentProjectId)}
						>
							Current board
							<ArrowRight size={14} />
						</button>
					{/if}
				</div>
			</div>

			{#if incomingInvites.length}
				<div class="px-1">
					<p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-app-primary">
						Incoming Invites ({incomingInvites.length})
					</p>
					<div class="flex flex-wrap gap-2">
						{#each incomingInvites as invite (invite.id)}
							<div class="flex min-w-56 items-center gap-2 rounded-lg border border-app-border/60 px-3 py-2">
								<Mail size={13} class="shrink-0 text-app-primary" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-app-text">
										{invite.projectName || 'Shared board'}
									</p>
									<p class="truncate text-xs text-app-subtext">{invite.inviteeEmail}</p>
								</div>
								<button
									type="button"
									class="rounded-md bg-app-primary px-2 py-1 text-xs font-semibold text-white transition hover:bg-app-primary-hover"
									on:click={() => onAcceptInvite(invite.id)}
								>
									<Check size={12} />
								</button>
								<button
									type="button"
									class="rounded-md border border-app-border px-2 py-1 text-xs text-app-subtext transition hover:text-rose-300"
									on:click={() => onRejectInvite(invite.id)}
								>
									<X size={12} />
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="space-y-5">
				<section>
					<div class="mb-2.5 flex items-center justify-between gap-3 px-1">
						<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-subtext">
							Boards <span class="text-app-subtext/50">· {ownedProjects.length}</span>
						</p>
					</div>

					{#if ownedProjects.length}
						<div class="flex gap-3 overflow-x-auto pb-2">
							{#each ownedProjects as project (project.id)}
								<article
									class={`w-80 shrink-0 rounded-xl border p-4 transition ${
										project.id === currentProjectId
											? 'border-app-primary/30 bg-app-primary/5'
											: 'border-app-border/50 bg-app-surface/60'
									}`}
								>
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
												<h3 class="truncate text-lg font-bold text-app-text">
													{project.name}
												</h3>
											{/if}
											<p class="mt-0.5 text-[11px] text-app-subtext">
												Updated {new Date(project.updatedAt).toLocaleDateString()}
											</p>
										</div>
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded-lg border border-app-border/50 px-2.5 py-1.5 text-xs font-medium text-app-text transition hover:text-app-primary"
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
											{#each project.members.slice(0, 4) as member (`${project.id}-${member.userId}`)}
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

									<div class="mt-3 flex items-center gap-1.5">
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
												class="rounded-lg bg-app-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-app-primary-hover"
												on:click={() => submitInvite(project.id)}
											>
												Send
											</button>
										</div>
									{/if}
								</article>
							{/each}
						</div>
					{:else}
						<div class="rounded-lg border border-dashed border-app-border/40 px-5 py-6 text-center text-sm text-app-subtext">
							Your owned boards will appear here once you create one.
						</div>
					{/if}
				</section>

				<section>
					<div class="mb-2.5 flex items-center justify-between gap-3 px-1">
						<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-subtext">
							Shared Boards <span class="text-app-subtext/50">· {sharedProjects.length}</span>
						</p>
					</div>

					{#if sharedProjects.length}
						<div class="flex gap-3 overflow-x-auto pb-2">
							{#each sharedProjects as project (project.id)}
								<article
									class={`w-72 shrink-0 rounded-xl border p-4 transition ${
										project.id === currentProjectId
											? 'border-app-primary/30 bg-app-primary/5'
											: 'border-app-border/50 bg-app-surface/60'
									}`}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<h3 class="truncate text-lg font-bold text-app-text">{project.name}</h3>
											<p class="mt-0.5 text-[11px] text-app-subtext">
												{memberLabel(project)}
											</p>
										</div>
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded-lg border border-app-border/50 px-2.5 py-1.5 text-xs font-medium text-app-text transition hover:text-app-primary"
											on:click={() => onOpenProject(project.id)}
										>
											Open
											<ArrowRight size={11} />
										</button>
									</div>
									<div class="mt-2 flex flex-wrap gap-1">
										{#each project.members.slice(0, 5) as member (`shared-${project.id}-${member.userId}`)}
											<span class="inline-flex rounded-md bg-app-element/40 px-1.5 py-0.5 text-[10px] text-app-text/80">
												{getMemberName(member)}
											</span>
										{/each}
									</div>
									<div class="mt-3 flex items-center justify-between">
										<button
											type="button"
											class="inline-flex items-center gap-1 text-xs font-medium text-app-subtext transition hover:text-app-primary"
											on:click={() => onOpenProject(project.id)}
										>
											Open board
											<ArrowRight size={11} />
										</button>
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
						<div class="rounded-lg border border-dashed border-app-border/40 px-5 py-6 text-center text-sm text-app-subtext">
							Shared boards will show up here when invitations are accepted.
						</div>
					{/if}
				</section>

				<section>
					<div class="mb-2.5 flex items-center justify-between gap-3 px-1">
						<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-subtext">
							Due Tasks
						</p>
						<Clock3 size={14} class="text-app-accent/60" />
					</div>

					{#if timedTasks.length}
						<div class="flex gap-3 overflow-x-auto pb-2">
							{#each timedTasks as timed (`${timed.projectId}-${timed.task.id}`)}
								<article
									class="w-72 shrink-0 rounded-xl border border-app-border/50 bg-app-surface/60 p-4 transition hover:bg-app-element/30"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="break-words text-base font-bold text-app-text">{timed.task.title}</p>
											<p class="mt-0.5 text-[11px] text-app-subtext">
												{timed.projectName} / {timed.columnTitle}
											</p>
										</div>
										<p class={`shrink-0 font-mono text-xs font-semibold tabular-nums ${timed.dueAt - now <= 0 ? 'text-rose-400' : 'text-app-subtext'}`}>
											{formatCountdown(timed.dueAt, now)}
										</p>
									</div>

									<p class="mt-2 text-xs text-app-subtext">Due {formatDueDateValue(timed.dueAt)}</p>

									{#if timed.task.tags.length}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each timed.task.tags.slice(0, 4) as tag (tag.id)}
												<span class={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${getTagToneClasses(tag.color)}`}>
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
										{#if timed.dueAt <= now}
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
						<div class="rounded-lg border border-dashed border-app-border/40 px-5 py-6 text-center text-sm text-app-subtext">
							No active due dates yet.
						</div>
					{/if}
				</section>
			</div>
		</div>
	</section>
