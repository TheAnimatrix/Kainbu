<script lang="ts">
	import {
		Download,
		FolderPlus,
		LogOut,
		Pencil,
		RotateCcw,
		Settings2,
		Trash2,
		X
	} from 'lucide-svelte';
	import type { Project } from '$lib/kainbu/types';

	export let projects: Project[] = [];
	export let currentProjectId = '';
	export let onClose: () => void;
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
</script>

<div class="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm lg:hidden">
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
		class="absolute inset-x-0 bottom-0 z-10 flex max-h-[85vh] flex-col overflow-hidden rounded-t-[2rem] border border-app-border bg-app-surface shadow-kainbu-xl"
	>
		<div class="flex shrink-0 items-center justify-between border-b border-app-border px-5 py-4">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.28em] text-app-subtext">Projects</p>
				<h2 class="mt-1 text-xl font-semibold text-app-text">Switch workspace</h2>
			</div>
			<button
				type="button"
				class="rounded-2xl border border-app-border bg-app-element p-3 text-app-subtext"
				on:click={onClose}
			>
				<X size={18} />
			</button>
		</div>

		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
			<button
				type="button"
				class="flex w-full items-center justify-center gap-2 rounded-[1.2rem] border border-dashed border-app-primary/35 bg-app-primary/10 px-4 py-3 text-sm font-semibold text-app-primary"
				on:click={onCreate}
			>
				<FolderPlus size={16} />
				New Project
			</button>

			{#each projects as project (project.id)}
				<div
					class={`rounded-[1.25rem] border p-3 ${
						project.id === currentProjectId
							? 'border-app-primary/30 bg-app-primary/10'
							: 'border-app-border bg-app-bg/70'
					}`}
				>
					<div class="flex items-center gap-3">
						<button
							type="button"
							class="grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] bg-app-surface text-sm font-bold uppercase text-app-text"
							on:click={() => onSwitch(project.id)}
						>
							{project.name.slice(0, 2)}
						</button>
						<div class="min-w-0 flex-1">
							{#if editingId === project.id}
								<input
									bind:value={editName}
									class="w-full rounded-lg border border-app-primary/40 bg-app-surface px-2 py-1 text-sm text-app-text outline-none"
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
								<button type="button" class="block w-full text-left" on:click={() => onSwitch(project.id)}>
									<p class="truncate font-semibold text-app-text">{project.name}</p>
									<p class="text-[11px] text-app-subtext">
										{project.accessRole} · {new Date(project.updatedAt).toLocaleDateString()}
									</p>
								</button>
							{/if}
						</div>
						<div class="flex items-center gap-1">
							{#if project.accessRole === 'owner'}
								<button
									type="button"
									class="rounded-xl p-2 text-app-subtext transition hover:bg-app-surface hover:text-app-text"
									on:click={() => beginRename(project)}
								>
									<Pencil size={14} />
								</button>
								<button
									type="button"
									class="rounded-xl p-2 text-app-subtext transition hover:bg-rose-500/10 hover:text-rose-300"
									on:click={() => onDelete(project.id)}
								>
									<Trash2 size={14} />
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<div class="grid shrink-0 grid-cols-2 gap-2 border-t border-app-border px-5 py-4">
			<button
				type="button"
				class="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-app-border bg-app-element px-3 py-3 text-sm font-semibold text-app-text"
				on:click={onOpenSettings}
			>
				<Settings2 size={16} />
				Settings
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-app-border bg-app-element px-3 py-3 text-sm font-semibold text-app-text"
				on:click={onExport}
			>
				<Download size={16} />
				Backup
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-app-border bg-app-element px-3 py-3 text-sm font-semibold text-app-text"
				on:click={() => restoreInput?.click()}
			>
				<RotateCcw size={16} />
				Restore
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-app-border bg-app-element px-3 py-3 text-sm font-semibold text-app-text"
				on:click={onSignOut}
			>
				<LogOut size={16} />
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
