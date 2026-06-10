<script lang="ts">
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { Search, X } from '$lib/icons';
	import type { TaskLinkPickerOption } from '$lib/kainbu/taskLinkPicker';

	const portalToBody = (node: HTMLElement) => {
		if (!browser) return {};
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	};

	export let open = false;
	export let position: { top: number; left: number } | null = null;
	export let options: TaskLinkPickerOption[] = [];
	export let onSelect: (taskId: string) => void = () => {};
	export let onClose: () => void = () => {};

	let query = '';
	let searchInput: HTMLInputElement | null = null;

	$: filteredOptions = options.filter((entry) => {
		const haystack = `${entry.title} ${entry.columnTitle} ${entry.tagLabels.join(' ')}`.toLowerCase();
		return haystack.includes(query.trim().toLowerCase());
	});

	$: if (open) {
		query = '';
		void tick().then(() => searchInput?.focus());
	}

	const handleSelect = (taskId: string) => {
		onSelect(taskId);
		onClose();
	};
</script>

{#if open && position}
	<div class="pointer-events-none fixed inset-0 z-[160]" use:portalToBody>
		<button
			type="button"
			class="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
			aria-label="Close link picker"
			onpointerdown={(event) => event.stopPropagation()}
			onclick={(event) => {
				event.stopPropagation();
				onClose();
			}}
		></button>
		<div
			role="dialog"
			aria-label="Link to task"
			data-task-link-picker
			class="pointer-events-auto fixed w-64 max-h-[min(24rem,calc(100vh-1.5rem))] overflow-hidden kainbu-context-menu rounded-lg p-0"
			style={`top:${position.top}px; left:${position.left}px;`}
			onmousedown={(event) => event.stopPropagation()}
			onclick={(event) => event.stopPropagation()}
		>
			<div class="flex items-center justify-between gap-2 border-b border-app-border/60 px-2 py-1.5">
				<p class="text-[13px] font-medium text-app-text">Link to task</p>
				<button
					type="button"
					class="rounded-md p-1 text-app-subtext transition hover:bg-app-element hover:text-app-text"
					onclick={onClose}
				>
					<X size={14} />
				</button>
			</div>
			<div class="border-b border-app-border/60 px-2 py-1.5">
				<label class="flex items-center gap-2 rounded-md border border-app-border/60 bg-app-bg px-2 py-1">
					<Search size={14} class="text-app-subtext" />
					<input
						bind:this={searchInput}
						bind:value={query}
						type="search"
						placeholder="Search tasks"
						class="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none"
					/>
				</label>
			</div>
			<div class="max-h-64 overflow-y-auto p-1">
				{#if !filteredOptions.length}
					<p class="px-2 py-2 text-[13px] text-app-subtext">No tasks match.</p>
				{:else}
					{#each filteredOptions as option (option.taskId)}
						<button
							type="button"
							class="kainbu-menu-item flex-col items-start gap-0.5"
							onclick={() => handleSelect(option.taskId)}
						>
							<span class="truncate text-sm font-medium text-app-text">{option.title}</span>
							<span class="text-[11px] text-app-subtext">{option.columnTitle}</span>
							{#if option.tagLabels.length}
								<div class="flex flex-wrap gap-1">
									{#each option.tagLabels.slice(0, 3) as label}
										<span
											class="rounded-full border border-app-border bg-app-element px-1.5 py-px text-[9px] uppercase tracking-[0.12em] text-app-subtext"
										>
											{label}
										</span>
									{/each}
								</div>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}
