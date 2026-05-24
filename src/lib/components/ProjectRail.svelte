<script lang="ts">
	import {
		ChevronRight,
		ChevronsDownUp,
		Download,
		FileText,
		FolderPlus,
		LayoutPanelTop,
		LogOut,
		PanelLeftClose,
		PanelLeftOpen,
		Pencil,
		Plus,
		RotateCcw,
		Settings2,
		Trash2
	} from 'lucide-svelte';
	import { BRAND_NAME } from '$lib/kainbu/constants';
	import type { Project, SyncStatus } from '$lib/kainbu/types';
	import SyncBadge from '$lib/components/SyncBadge.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';

	export let projects: Project[] = [];
	export let currentProjectId = '';
	export let currentBoardId = '';
	export let currentPageId = '';
	export let activeSurface: 'board' | 'page' | 'none' = 'board';
	export let visible = false;
	export let compact = false;
	export let syncStatus: SyncStatus = 'idle';
	export let profileEmail: string | null = null;
	export let profileUsername: string | null = null;
	export let onToggleCompact: () => void = () => {};
	export let onOpenBoard: (projectId: string, boardId: string) => void;
	export let onOpenPage: (projectId: string, pageId: string) => void;
	export let onCreateBoard: (projectId: string, name: string) => void | Promise<void>;
	export let onCreatePage: (projectId: string, name: string) => void | Promise<void>;
	export let onRenameBoard: (projectId: string, boardId: string, nextName: string) => void | Promise<void>;
	export let onRenamePage: (projectId: string, pageId: string, nextName: string) => void | Promise<void>;
	export let onDeleteBoard: (projectId: string, boardId: string) => void;
	export let onDeletePage: (projectId: string, pageId: string) => void;
	export let onCreate: () => void;
	export let onRename: (projectId: string, nextName: string) => void;
	export let onDelete: (projectId: string) => void;
	export let onExport: () => void;
	export let onRestore: (file: File) => void;
	export let onOpenSettings: () => void;
	export let onOpenAccount: () => void;
	export let onSignOut: () => void;

	let editingId: string | null = null;
	let editName = '';
	let editingItem:
		| { kind: 'board' | 'page'; projectId: string; itemId: string; value: string }
		| null = null;
	let creatingItem:
		| { kind: 'board' | 'page'; projectId: string; value: string }
		| null = null;
	let restoreInput: HTMLInputElement | null = null;
	let expandedProjectIds: string[] = [];
	let autoExpandedForProject = '';

	const beginRename = (project: Project) => {
		editingId = project.id;
		editName = project.name;
	};

	const commitRename = (projectId: string) => {
		if (editName.trim()) onRename(projectId, editName.trim());
		editingId = null;
		editName = '';
	};

	const beginItemRename = (
		kind: 'board' | 'page',
		projectId: string,
		itemId: string,
		name: string
	) => {
		creatingItem = null;
		editingItem = { kind, projectId, itemId, value: name };
	};

	const cancelItemRename = () => {
		editingItem = null;
	};

	const commitItemRename = async () => {
		if (!editingItem) return;
		const nextName = editingItem.value.trim();
		if (!nextName) {
			cancelItemRename();
			return;
		}

		const { kind, projectId, itemId } = editingItem;
		editingItem = null;
		if (kind === 'board') {
			await onRenameBoard(projectId, itemId, nextName);
			return;
		}

		await onRenamePage(projectId, itemId, nextName);
	};

	const beginCreateItem = (kind: 'board' | 'page', project: Project) => {
		editingItem = null;
		const seed = kind === 'board' ? `Board ${project.boards.length + 1}` : `Page ${project.pages.length + 1}`;
		creatingItem = {
			kind,
			projectId: project.id,
			value: seed
		};
	};

	const cancelCreateItem = () => {
		creatingItem = null;
	};

	const commitCreateItem = async () => {
		if (!creatingItem) return;
		const nextName = creatingItem.value.trim();
		if (!nextName) {
			cancelCreateItem();
			return;
		}

		const { kind, projectId } = creatingItem;
		creatingItem = null;
		if (kind === 'board') {
			await onCreateBoard(projectId, nextName);
			return;
		}

		await onCreatePage(projectId, nextName);
	};

	const initialsFor = (value: string | null) => {
		if (!value) return 'KB';
		return value
			.split(/[^a-zA-Z0-9]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() || '')
			.join('') || value.slice(0, 2).toUpperCase();
	};

	$: profileLabel = profileUsername || profileEmail || 'Account';
	$: profileMeta = profileUsername ? profileEmail || 'Open account settings' : 'Set username in settings';

	$: if (currentProjectId && currentProjectId !== autoExpandedForProject) {
		autoExpandedForProject = currentProjectId;
		if (!expandedProjectIds.includes(currentProjectId)) {
			expandedProjectIds = [...expandedProjectIds, currentProjectId];
		}
	}

	const toggleProjectExpansion = (projectId: string) => {
		expandedProjectIds = expandedProjectIds.includes(projectId)
			? expandedProjectIds.filter((id) => id !== projectId)
			: [...expandedProjectIds, projectId];
	};

	const collapseAll = () => {
		expandedProjectIds = [];
		autoExpandedForProject = '';
	};

	$: expandedSet = new Set(expandedProjectIds);
	$: hasAnyExpanded = expandedProjectIds.length > 0;
</script>

<aside
	class={`hidden h-screen shrink-0 overflow-hidden border-r border-app-border/40 bg-app-bg transition-[width,opacity,padding] duration-300 lg:flex ${
		visible
			? compact
				? 'w-[4.75rem] px-0 py-0 opacity-100'
				: 'w-66 px-0 py-0 opacity-100'
			: 'w-0 border-transparent px-0 py-0 opacity-0 pointer-events-none'
	}`}
>
	{#if visible}
		<div class="flex min-h-0 flex-1 flex-col">
			{#if compact}
				<div class="flex min-h-0 flex-1 flex-col items-center gap-3 px-2 py-3">
					<div class="flex w-full flex-col items-center gap-2">
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-app-border/50 bg-app-element/30 text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
							on:click={onToggleCompact}
							aria-label="Expand sidebar"
							title="Expand sidebar"
						>
							<PanelLeftOpen size={16} />
						</button>
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-app-text transition hover:bg-app-element/40"
							on:click={onCreate}
							aria-label="New project"
							title="New project"
						>
							<FolderPlus size={16} />
						</button>
						<div class="scale-90">
							<SyncBadge status={syncStatus} compact={true} />
						</div>
					</div>

					<div class="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto pb-1">
						{#each projects as project (project.id)}
							<button
								type="button"
								class={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[10px] font-bold uppercase tracking-[0.12em] transition-all duration-200 ease-out motion-reduce:transition-none ${
									project.id === currentProjectId
										? 'scale-100 border-app-primary/45 bg-app-primary/16 text-app-text shadow-[0_0_0_1px_rgba(194,65,12,0.28)]'
										: 'scale-[0.94] border-transparent bg-app-element/25 text-app-subtext hover:scale-[0.98] hover:border-app-border/50 hover:text-app-text'
								}`}
								on:click={() => onOpenBoard(project.id, project.activeBoardId)}
								aria-label={`Open ${project.name}`}
								title={project.name}
							>
								{initialsFor(project.name)}
							</button>
						{/each}
					</div>

					<div class="flex w-full flex-col items-center gap-2 border-t border-app-border/40 pt-3">
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-app-text transition hover:bg-app-element/40"
							on:click={onOpenAccount}
							aria-label={profileLabel}
							title={profileLabel}
						>
							<div class="grid h-8 w-8 place-items-center rounded-lg bg-app-element/60 text-[10px] font-bold uppercase text-app-subtext">
								{initialsFor(profileLabel)}
							</div>
						</button>
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-app-subtext transition hover:bg-app-element/40 hover:text-app-text"
							on:click={onOpenSettings}
							aria-label="Settings"
							title="Settings"
						>
							<Settings2 size={16} />
						</button>
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-app-subtext transition hover:bg-app-element/40 hover:text-app-text"
							on:click={onExport}
							aria-label="Backup"
							title="Backup"
						>
							<Download size={16} />
						</button>
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-app-subtext transition hover:bg-app-element/40 hover:text-app-text"
							on:click={() => restoreInput?.click()}
							aria-label="Restore"
							title="Restore"
						>
							<RotateCcw size={16} />
						</button>
						<button
							type="button"
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-app-subtext transition hover:bg-app-element/40 hover:text-rose-400"
							on:click={onSignOut}
							aria-label="Sign out"
							title="Sign out"
						>
							<LogOut size={16} />
						</button>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
					<div class="flex min-w-0 items-center gap-2">
						<button
							type="button"
							class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-app-border/50 bg-app-element/25 text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
							on:click={onToggleCompact}
							aria-label="Compact sidebar"
							title="Compact sidebar"
						>
							<PanelLeftClose size={15} />
						</button>
						<BrandMark size={24} framed={false} alt="{BRAND_NAME} logo" />
						<p class="text-sm font-bold tracking-tight text-app-text">
							{BRAND_NAME}
						</p>
					</div>
					<SyncBadge status={syncStatus} compact={true} />
				</div>

				<div class="flex min-h-0 flex-1 flex-col">
					<div class="flex items-center justify-between px-4 pb-1.5 pt-3">
						<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext/70">
							Projects
						</p>
						<div class="flex items-center gap-0.5">
							{#if hasAnyExpanded}
								<button
									type="button"
									class="rounded-md p-1 text-app-subtext/40 transition hover:text-app-text"
									on:click={collapseAll}
									aria-label="Collapse all"
									title="Collapse all"
								>
									<ChevronsDownUp size={13} />
								</button>
							{/if}
							<button
								type="button"
								class="rounded-md p-1 text-app-subtext/60 transition hover:text-app-primary"
								on:click={onCreate}
								aria-label="New project"
							>
								<FolderPlus size={14} />
							</button>
						</div>
					</div>

					<div class="min-h-0 flex-1 overflow-y-auto px-1.5">
						{#each projects as project (project.id)}
							<div class="mb-0.5">
								<div class="group flex items-center gap-1 rounded-md px-2 py-1.5 transition hover:bg-app-element/40">
									<button
										type="button"
										class="shrink-0 text-app-subtext/50 transition-colors duration-200 hover:text-app-text"
										on:click={() => toggleProjectExpansion(project.id)}
										aria-label={expandedSet.has(project.id) ? 'Collapse' : 'Expand'}
										aria-expanded={expandedSet.has(project.id)}
									>
										<ChevronRight
											size={13}
											class={`transition-transform duration-200 ease-out ${
												expandedSet.has(project.id) ? 'rotate-90' : ''
											}`}
										/>
									</button>

									<div class="min-w-0 flex-1">
										{#if editingId === project.id}
											<input
												bind:value={editName}
												class="w-full rounded bg-transparent px-1 py-0 text-sm font-semibold text-app-text outline-none ring-1 ring-app-primary/40"
												on:blur={() => commitRename(project.id)}
												on:keydown={(event) => {
													if (event.key === 'Enter') commitRename(project.id);
													if (event.key === 'Escape') editingId = null;
												}}
											/>
										{:else}
											<button
												type="button"
												class="block w-full text-left"
												on:click={() => onOpenBoard(project.id, project.activeBoardId)}
											>
												<p
													class={`truncate text-sm transition-colors duration-200 ${
														project.id === currentProjectId
															? 'font-semibold text-app-text'
															: 'font-medium text-app-subtext hover:text-app-text'
													}`}
												>
													{project.name}
												</p>
											</button>
										{/if}
									</div>

									<div class="flex items-center gap-0 opacity-0 transition group-hover:opacity-100">
										{#if project.accessRole === 'owner'}
											<button
												type="button"
												class="rounded p-1 text-app-subtext/50 transition hover:text-app-text"
												on:click={() => beginRename(project)}
											>
												<Pencil size={12} />
											</button>
											<button
												type="button"
												class="rounded p-1 text-app-subtext/50 transition hover:text-rose-400"
												on:click={() => onDelete(project.id)}
											>
												<Trash2 size={12} />
											</button>
										{/if}
									</div>
								</div>

								<div
									class={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
										expandedSet.has(project.id) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
									}`}
								>
									<div class="overflow-hidden">
										<div class="ml-5 border-l border-app-border/40 pb-1 pl-2">
										{#each project.boards as board (board.id)}
											<div
												class={`group/item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${
													project.id === currentProjectId &&
													board.id === currentBoardId &&
													activeSurface === 'board'
														? 'bg-app-element/50 text-app-text'
														: 'text-app-subtext/80 hover:bg-app-element/30 hover:text-app-text'
												}`}
											>
												{#if
													editingItem &&
													editingItem.kind === 'board' &&
													editingItem.projectId === project.id &&
													editingItem.itemId === board.id
												}
													<div class="flex min-w-0 flex-1 items-center gap-2">
														<LayoutPanelTop size={13} class="shrink-0 opacity-60" />
														<input
															bind:value={editingItem.value}
															class="w-full rounded bg-transparent px-1 py-0 text-[13px] text-app-text outline-none ring-1 ring-app-primary/40"
															on:blur={() => void commitItemRename()}
															on:keydown={(event) => {
																if (event.key === 'Enter') void commitItemRename();
																if (event.key === 'Escape') cancelItemRename();
															}}
														/>
													</div>
												{:else}
													<button
														type="button"
														class="flex min-w-0 flex-1 items-center gap-2 text-left"
														on:click={() => onOpenBoard(project.id, board.id)}
													>
														<LayoutPanelTop size={13} class="shrink-0 opacity-60" />
														<span class="truncate">{board.name}</span>
													</button>
												{/if}
												{#if project.accessRole === 'owner'}
													<div class="flex items-center gap-0 opacity-0 transition group-hover/item:opacity-100">
														<button
															type="button"
															class="rounded p-0.5 text-app-subtext/40 transition hover:text-app-text"
															on:click={() => beginItemRename('board', project.id, board.id, board.name)}
															title="Rename board"
														>
															<Pencil size={10} />
														</button>
														{#if project.boards.length > 1}
															<button
																type="button"
																class="rounded p-0.5 text-app-subtext/40 transition hover:text-rose-400"
																on:click={() => onDeleteBoard(project.id, board.id)}
																title="Delete board"
															>
																<Trash2 size={10} />
															</button>
														{/if}
													</div>
												{/if}
											</div>
										{/each}

										{#if creatingItem && creatingItem.kind === 'board' && creatingItem.projectId === project.id}
											<div class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-app-subtext/80">
												<LayoutPanelTop size={13} class="shrink-0 opacity-60" />
												<input
													bind:value={creatingItem.value}
													class="w-full rounded bg-transparent px-1 py-0 text-[13px] text-app-text outline-none ring-1 ring-app-primary/40"
													on:blur={() => void commitCreateItem()}
													on:keydown={(event) => {
														if (event.key === 'Enter') void commitCreateItem();
														if (event.key === 'Escape') cancelCreateItem();
													}}
												/>
											</div>
										{/if}

										{#each project.pages as page (page.id)}
											<div
												class={`group/item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${
													project.id === currentProjectId &&
													page.id === currentPageId &&
													activeSurface === 'page'
														? 'bg-app-element/50 text-app-text'
														: 'text-app-subtext/80 hover:bg-app-element/30 hover:text-app-text'
												}`}
											>
												{#if
													editingItem &&
													editingItem.kind === 'page' &&
													editingItem.projectId === project.id &&
													editingItem.itemId === page.id
												}
													<div class="flex min-w-0 flex-1 items-center gap-2">
														<FileText size={13} class="shrink-0 opacity-60" />
														<input
															bind:value={editingItem.value}
															class="w-full rounded bg-transparent px-1 py-0 text-[13px] text-app-text outline-none ring-1 ring-app-primary/40"
															on:blur={() => void commitItemRename()}
															on:keydown={(event) => {
																if (event.key === 'Enter') void commitItemRename();
																if (event.key === 'Escape') cancelItemRename();
															}}
														/>
													</div>
												{:else}
													<button
														type="button"
														class="flex min-w-0 flex-1 items-center gap-2 text-left"
														on:click={() => onOpenPage(project.id, page.id)}
													>
														<FileText size={13} class="shrink-0 opacity-60" />
														<span class="truncate">{page.name}</span>
													</button>
												{/if}
												{#if project.accessRole === 'owner'}
													<div class="flex items-center gap-0 opacity-0 transition group-hover/item:opacity-100">
														<button
															type="button"
															class="rounded p-0.5 text-app-subtext/40 transition hover:text-app-text"
															on:click={() => beginItemRename('page', project.id, page.id, page.name)}
															title="Rename page"
														>
															<Pencil size={10} />
														</button>
														{#if project.pages.length > 1}
															<button
																type="button"
																class="rounded p-0.5 text-app-subtext/40 transition hover:text-rose-400"
																on:click={() => onDeletePage(project.id, page.id)}
																title="Delete page"
															>
																<Trash2 size={10} />
															</button>
														{/if}
													</div>
												{/if}
											</div>
										{/each}

										{#if creatingItem && creatingItem.kind === 'page' && creatingItem.projectId === project.id}
											<div class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-app-subtext/80">
												<FileText size={13} class="shrink-0 opacity-60" />
												<input
													bind:value={creatingItem.value}
													class="w-full rounded bg-transparent px-1 py-0 text-[13px] text-app-text outline-none ring-1 ring-app-primary/40"
													on:blur={() => void commitCreateItem()}
													on:keydown={(event) => {
														if (event.key === 'Enter') void commitCreateItem();
														if (event.key === 'Escape') cancelCreateItem();
													}}
												/>
											</div>
										{/if}

										<div class="mt-1 flex items-center gap-1 px-1">
											<button
												type="button"
												class="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-app-subtext/50 transition hover:text-app-primary"
												on:click={() => beginCreateItem('board', project)}
											>
												<Plus size={11} />
												Board
											</button>
											<button
												type="button"
												class="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-app-subtext/50 transition hover:text-app-primary"
												on:click={() => beginCreateItem('page', project)}
											>
												<Plus size={11} />
												Page
											</button>
										</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div class="border-t border-app-border/40 px-3 pb-3 pt-2">
					<button
						type="button"
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-app-element/40"
						on:click={onOpenAccount}
					>
						<div class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-app-element/60 text-[10px] font-bold uppercase text-app-subtext">
							{initialsFor(profileLabel)}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-app-text">{profileLabel}</p>
							<p class="truncate text-[11px] text-app-subtext/70">{profileMeta}</p>
						</div>
					</button>

					<div class="mt-1.5 flex items-center gap-1 px-1">
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-app-subtext/70 transition hover:text-app-text"
							on:click={onOpenSettings}
						>
							<Settings2 size={13} />
							Settings
						</button>
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-app-subtext/70 transition hover:text-app-text"
							on:click={onExport}
						>
							<Download size={13} />
							Backup
						</button>
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-app-subtext/70 transition hover:text-app-text"
							on:click={() => restoreInput?.click()}
						>
							<RotateCcw size={13} />
						</button>
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-app-subtext/70 transition hover:text-rose-400"
							on:click={onSignOut}
						>
							<LogOut size={13} />
						</button>
					</div>
				</div>
			{/if}

			<input
				bind:this={restoreInput}
				type="file"
				accept=".json"
				class="hidden"
				on:change={(event) => {
					const file = (event.currentTarget as HTMLInputElement).files?.[0];
					if (file) onRestore(file);
					(event.currentTarget as HTMLInputElement).value = '';
				}}
			/>
		</div>
	{/if}
</aside>
