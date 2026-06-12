<script lang="ts">
	import {
		ChevronRight,
		Download,
		FileText,
		FolderPlus,
		Grid,
		LayoutPanelTop,
		LogOut,
		Pencil,
		Plus,
		RotateCcw,
		Settings2,
		Trash2,
		X
	} from '$lib/icons';
	import type { Project } from '$lib/kainbu/types';

	export let projects: Project[] = [];
	export let currentProjectId = '';
	export let currentBoardId = '';
	export let currentPageId = '';
	export let activeSurface: 'board' | 'page' | 'none' = 'board';
	export let onClose: () => void;
	export let onOpenBoard: (projectId: string, boardId: string) => void;
	export let onOpenPage: (projectId: string, pageId: string) => void;
	export let onCreateBoard: (projectId: string) => void;
	export let onCreatePage: (projectId: string) => void;
	export let onRenameBoard: (projectId: string, boardId: string) => void;
	export let onRenamePage: (projectId: string, pageId: string) => void;
	export let onDeleteBoard: (projectId: string, boardId: string) => void;
	export let onDeletePage: (projectId: string, pageId: string) => void;
	export let onCreate: () => void;
	export let onRename: (projectId: string, nextName: string) => void;
	export let onDelete: (projectId: string) => void;
	export let onExport: () => void;
	export let onRestore: (file: File) => void;
	export let onOpenSettings: () => void;
	export let onSignOut: () => void;
	export let onDashboard: () => void;

	let editingId: string | null = null;
	let editName = '';
	let restoreInput: HTMLInputElement | null = null;
	let expandedProjectIds: string[] = [];
	let autoExpandedForProject = '';

	const beginRename = (project: Project) => {
		editingId = project.id;
		editName = project.name;
	};

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

	$: expandedSet = new Set(expandedProjectIds);
</script>

<div class="kainbu-overlay fixed inset-0 z-[130] lg:hidden">
	<button
		type="button"
		class="absolute inset-0"
		aria-label="Close project picker"
		on:click={onClose}
	></button>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Project picker"
		class="absolute inset-x-0 bottom-0 z-10 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-app-border/60 bg-app-surface"
	>
		<div class="flex shrink-0 items-center justify-between border-b border-app-border/40 px-4 py-3">
			<p class="text-sm font-semibold text-app-text">Projects</p>
			<button
				type="button"
				class="rounded-lg p-2 text-app-subtext transition hover:text-app-text"
				on:click={onClose}
			>
				<X size={16} />
			</button>
		</div>

		<div class="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
			<button
				type="button"
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-app-element/30 px-4 py-2.5 text-sm font-medium text-app-text transition hover:bg-app-element/50"
				on:click={onDashboard}
			>
				<Grid size={15} />
				Dashboard
			</button>

			<button
				type="button"
				class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-app-primary/35 px-4 py-2.5 text-sm font-medium text-app-primary"
				on:click={onCreate}
			>
				<FolderPlus size={15} />
				New Project
			</button>

			{#each projects as project (project.id)}
				<div class="mt-1">
					<div class="group flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-app-element/40">
						<button
							type="button"
							class="shrink-0 text-app-subtext/50 transition-colors duration-200 hover:text-app-text"
							on:click={() => toggleProjectExpansion(project.id)}
							aria-expanded={expandedSet.has(project.id)}
							aria-label={expandedSet.has(project.id) ? 'Collapse' : 'Expand'}
						>
							<ChevronRight
								size={14}
								class={`transition-transform duration-200 ease-out ${
									expandedSet.has(project.id) ? 'rotate-90' : ''
								}`}
							/>
						</button>
						<div class="min-w-0 flex-1">
							{#if editingId === project.id}
								<input
									bind:value={editName}
									class="w-full rounded-md bg-transparent px-1 py-0 text-sm font-semibold text-app-text outline-none ring-1 ring-app-primary/40"
									on:blur={() => {
										if (editName.trim()) onRename(project.id, editName.trim());
										editingId = null;
									}}
									on:keydown={(event) => {
										if (event.key === 'Enter' && editName.trim()) {
											onRename(project.id, editName.trim());
											editingId = null;
										}
										if (event.key === 'Escape') editingId = null;
									}}
								/>
							{:else}
								<button type="button" class="block w-full text-left" on:click={() => onOpenBoard(project.id, project.activeBoardId)}>
									<p
										class={`truncate text-sm transition-colors duration-200 ${
											project.id === currentProjectId
												? 'font-semibold text-app-text'
												: 'font-medium text-app-subtext'
										}`}
									>
										{project.name}
									</p>
								</button>
							{/if}
						</div>
						<div class="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
							{#if project.accessRole === 'owner'}
								<button
									type="button"
									class="rounded p-1.5 text-app-subtext/50 transition hover:text-app-text"
									on:click={() => beginRename(project)}
								>
									<Pencil size={13} />
								</button>
								<button
									type="button"
									class="rounded p-1.5 text-app-subtext/50 transition hover:text-rose-400"
									on:click={() => onDelete(project.id)}
								>
									<Trash2 size={13} />
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
							<div class="ml-6 border-l border-app-border/40 pl-2 pb-1">
							{#each project.boards as board (board.id)}
								<div
									class={`group/item flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
										project.id === currentProjectId &&
										board.id === currentBoardId &&
										activeSurface === 'board'
											? 'text-app-text bg-app-element/50'
											: 'text-app-subtext/80 hover:text-app-text hover:bg-app-element/30'
									}`}
								>
									<button
										type="button"
										class="flex min-w-0 flex-1 items-center gap-2 text-left"
										on:click={() => onOpenBoard(project.id, board.id)}
									>
										<LayoutPanelTop size={14} class="shrink-0 opacity-60" />
										<span class="truncate">{board.name}</span>
									</button>
									<div class="flex items-center gap-0 opacity-0 transition group-hover/item:opacity-100">
										<button
											type="button"
											class="rounded p-1 text-app-subtext/40 transition hover:text-app-text"
											on:click={() => onRenameBoard(project.id, board.id)}
										>
											<Pencil size={11} />
										</button>
										{#if project.boards.length > 1}
											<button
												type="button"
												class="rounded p-1 text-app-subtext/40 transition hover:text-rose-400"
												on:click={() => onDeleteBoard(project.id, board.id)}
											>
												<Trash2 size={11} />
											</button>
										{/if}
									</div>
								</div>
							{/each}

							{#each project.pages as page (page.id)}
								<div
									class={`group/item flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
										project.id === currentProjectId &&
										page.id === currentPageId &&
										activeSurface === 'page'
											? 'text-app-text bg-app-element/50'
											: 'text-app-subtext/80 hover:text-app-text hover:bg-app-element/30'
									}`}
								>
									<button
										type="button"
										class="flex min-w-0 flex-1 items-center gap-2 text-left"
										on:click={() => onOpenPage(project.id, page.id)}
									>
										<FileText size={14} class="shrink-0 opacity-60" />
										<span class="truncate">{page.name}</span>
									</button>
									<div class="flex items-center gap-0 opacity-0 transition group-hover/item:opacity-100">
										<button
											type="button"
											class="rounded p-1 text-app-subtext/40 transition hover:text-app-text"
											on:click={() => onRenamePage(project.id, page.id)}
										>
											<Pencil size={11} />
										</button>
										{#if project.pages.length > 1}
											<button
												type="button"
												class="rounded p-1 text-app-subtext/40 transition hover:text-rose-400"
												on:click={() => onDeletePage(project.id, page.id)}
											>
												<Trash2 size={11} />
											</button>
										{/if}
									</div>
								</div>
							{/each}

							<div class="mt-1 flex items-center gap-1 px-1">
								<button
									type="button"
									class="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-app-subtext/50 transition hover:text-app-primary"
									on:click={() => onCreateBoard(project.id)}
								>
									<Plus size={11} />
									Board
								</button>
								<button
									type="button"
									class="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-app-subtext/50 transition hover:text-app-primary"
									on:click={() => onCreatePage(project.id)}
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

		<div class="grid shrink-0 grid-cols-4 gap-1.5 border-t border-app-border/40 px-4 py-3">
			<button
				type="button"
				class="inline-flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] text-app-subtext transition hover:text-app-text"
				on:click={onOpenSettings}
			>
				<Settings2 size={15} />
				Settings
			</button>
			<button
				type="button"
				class="inline-flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] text-app-subtext transition hover:text-app-text"
				on:click={onExport}
			>
				<Download size={15} />
				Backup
			</button>
			<button
				type="button"
				class="inline-flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] text-app-subtext transition hover:text-app-text"
				on:click={() => restoreInput?.click()}
			>
				<RotateCcw size={15} />
				Restore
			</button>
			<button
				type="button"
				class="inline-flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] text-app-subtext transition hover:text-rose-400"
				on:click={onSignOut}
			>
				<LogOut size={15} />
				Logout
			</button>
		</div>

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
</div>
