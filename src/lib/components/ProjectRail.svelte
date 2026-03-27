<script lang="ts">
	import {
		Download,
		FolderPlus,
		LogOut,
		Pencil,
		RotateCcw,
		Settings2,
		Trash2
	} from 'lucide-svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { BRAND_KATAKANA, BRAND_NAME } from '$lib/kainbu/constants';
	import type { Project, SyncStatus } from '$lib/kainbu/types';
	import SyncBadge from '$lib/components/SyncBadge.svelte';

	export let projects: Project[] = [];
	export let currentProjectId = '';
	export let visible = false;
	export let syncStatus: SyncStatus = 'idle';
	export let onSwitch: (projectId: string) => void;
	export let onCreate: () => void;
	export let onRename: (projectId: string, nextName: string) => void;
	export let onDelete: (projectId: string) => void;
	export let onExport: () => void;
	export let onRestore: (file: File) => void;
	export let onOpenSettings: () => void;
	export let onSignOut: () => void;

	let editingId: string | null = null;
	let editName = '';
	let restoreInput: HTMLInputElement | null = null;

	const beginRename = (project: Project) => {
		editingId = project.id;
		editName = project.name;
	};

	const commitRename = (projectId: string) => {
		if (editName.trim()) onRename(projectId, editName.trim());
		editingId = null;
		editName = '';
	};
</script>

<aside
	class={`hidden h-screen shrink-0 overflow-hidden border-r bg-app-surface/96 backdrop-blur-xl transition-[width,opacity,padding,border-color] duration-300 lg:flex ${
		visible
			? 'w-[18rem] border-app-border px-3 py-3 opacity-100'
			: 'w-0 border-transparent px-0 py-0 opacity-0 pointer-events-none'
	}`}
>
	{#if visible}
		<div class="flex min-h-0 flex-1 flex-col">
			<div class="rounded-[1.1rem] border border-app-border bg-app-bg/65 px-3.5 py-3">
				<div class="flex items-start justify-between gap-3">
					<div class="flex min-w-0 items-center gap-3">
						<BrandMark size={42} alt="" />
						<div class="min-w-0">
							<p class="font-display text-lg font-extrabold tracking-tight text-app-text">
								{BRAND_NAME}
							</p>
							<p class="font-display text-[10px] font-bold tracking-[0.32em] text-app-primary">
								{BRAND_KATAKANA}
							</p>
						</div>
					</div>
					<SyncBadge status={syncStatus} compact={true} />
				</div>
				<p class="mt-3 text-[11px] leading-relaxed text-app-subtext">
					Projects stay one tap away while the workspace keeps the width it needs.
				</p>
			</div>

			<div class="mt-3 flex min-h-0 flex-1 flex-col">
				<div class="flex items-center justify-between gap-3 px-1 pb-2">
					<div>
						<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-app-subtext">
							Projects
						</p>
						<p class="mt-1 text-xs text-app-subtext">{projects.length} active</p>
					</div>
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-[0.95rem] border border-dashed border-app-primary/35 bg-app-primary/10 px-3 py-2 text-xs font-semibold text-app-primary transition hover:border-app-primary"
						on:click={onCreate}
					>
						<FolderPlus size={15} />
						New
					</button>
				</div>

				<div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
					{#each projects as project (project.id)}
						<div
							class={`rounded-[1rem] border transition ${
								project.id === currentProjectId
									? 'border-app-primary/30 bg-app-primary/10'
									: 'border-transparent bg-transparent hover:border-app-border hover:bg-app-element/30'
							}`}
						>
							<div class="flex items-center gap-2.5 px-3 py-2.5">
								<button
									type="button"
									class="grid h-9 w-9 shrink-0 place-items-center rounded-[0.9rem] bg-app-bg text-xs font-bold uppercase text-app-text"
									on:click={() => onSwitch(project.id)}
								>
									{project.name.slice(0, 2)}
								</button>
								<div class="min-w-0 flex-1">
									{#if editingId === project.id}
										<input
											bind:value={editName}
											class="w-full rounded-lg border border-app-primary/40 bg-app-bg px-2 py-1 text-sm text-app-text outline-none"
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
											on:click={() => onSwitch(project.id)}
										>
											<p class="truncate text-sm font-semibold text-app-text">{project.name}</p>
											<p class="text-[10px] uppercase tracking-[0.18em] text-app-subtext">
												{project.accessRole} · {new Date(project.updatedAt).toLocaleDateString()}
											</p>
										</button>
									{/if}
								</div>
								<div class="flex items-center gap-0.5">
									{#if project.accessRole === 'owner'}
										<button
											type="button"
											class="rounded-lg p-1.5 text-app-subtext transition hover:bg-app-bg hover:text-app-text"
											on:click={() => beginRename(project)}
										>
											<Pencil size={13} />
										</button>
										<button
											type="button"
											class="rounded-lg p-1.5 text-app-subtext transition hover:bg-rose-500/10 hover:text-rose-300"
											on:click={() => onDelete(project.id)}
										>
											<Trash2 size={13} />
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-3 space-y-3 border-t border-app-border pt-3">
				<div class="grid grid-cols-2 gap-2">
					<button
						type="button"
						class="inline-flex items-center justify-center gap-2 rounded-[0.95rem] border border-app-border bg-app-element px-3 py-2.5 text-sm font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
						on:click={onOpenSettings}
					>
						<Settings2 size={15} />
						Settings
					</button>
					<button
						type="button"
						class="inline-flex items-center justify-center gap-2 rounded-[0.95rem] border border-app-border bg-app-element px-3 py-2.5 text-sm font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
						on:click={onExport}
					>
						<Download size={15} />
						Backup
					</button>
					<button
						type="button"
						class="inline-flex items-center justify-center gap-2 rounded-[0.95rem] border border-app-border bg-app-element px-3 py-2.5 text-sm font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
						on:click={() => restoreInput?.click()}
					>
						<RotateCcw size={15} />
						Restore
					</button>
					<button
						type="button"
						class="inline-flex items-center justify-center gap-2 rounded-[0.95rem] border border-app-border bg-app-element px-3 py-2.5 text-sm font-semibold text-app-text transition hover:border-rose-500/35 hover:text-rose-300"
						on:click={onSignOut}
					>
						<LogOut size={15} />
						Sign Out
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
	{/if}
</aside>
