<script lang="ts">
	import { ArrowLeft, Check, ChevronRight, X } from 'lucide-svelte';
	import { getCheckedMoveTargetLabel } from '$lib/kainbu/boardPreferences';
	import type { BoardPreferences, KanbanData } from '$lib/kainbu/types';

	export let open = false;
	export let preferences: BoardPreferences;
	export let columns: KanbanData = [];
	export let onClose: () => void;
	export let onChange: (next: BoardPreferences) => void;

	let pickingColumn = false;

	const close = () => {
		pickingColumn = false;
		onClose();
	};

	const updatePreferences = (patch: Partial<BoardPreferences>) => {
		onChange({ ...preferences, ...patch });
	};

	const selectMoveTarget = (target: 'off' | 'default' | string) => {
		if (target === 'off') {
			updatePreferences({ moveCheckedTasks: false, checkedTaskTargetColumnId: '' });
		} else if (target === 'default') {
			updatePreferences({ moveCheckedTasks: true, checkedTaskTargetColumnId: '' });
		} else {
			updatePreferences({ moveCheckedTasks: true, checkedTaskTargetColumnId: target });
		}
		pickingColumn = false;
	};

	$: moveTargetLabel = getCheckedMoveTargetLabel(columns, preferences);
	$: hasDoneColumn = columns.some((column) => column.title.trim().toLowerCase() === 'done');
</script>

{#if open}
	<div class="fixed inset-0 z-[130] bg-black/45 backdrop-blur-sm">
		<button type="button" class="absolute inset-0" aria-label="Close board options" onclick={close}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Board options"
			class="absolute inset-x-0 bottom-0 z-10 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-app-border/60 bg-app-surface lg:inset-auto lg:left-1/2 lg:top-1/2 lg:max-h-[min(85vh,32rem)] lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-app-border/40 px-4 py-3">
				<p class="text-sm font-semibold text-app-text">Board options</p>
				<button
					type="button"
					class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-app-subtext transition hover:bg-app-element hover:text-app-text"
					aria-label="Close"
					onclick={close}
				>
					<X size={16} />
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{#if pickingColumn}
					<button
						type="button"
						class="mb-2 inline-flex items-center gap-1 text-xs font-medium text-app-subtext transition hover:text-app-text"
						onclick={() => (pickingColumn = false)}
					>
						<ArrowLeft size={14} />
						Back
					</button>
					<p class="text-xs font-semibold text-app-text">Move checked tasks to</p>
					<div class="mt-2 space-y-1">
						<button
							type="button"
							class="flex w-full items-center justify-between rounded-lg border border-app-border/40 px-3 py-2.5 text-left transition hover:bg-app-element/60"
							onclick={() => selectMoveTarget('off')}
						>
							<span class="text-sm text-app-text">Off</span>
							{#if !preferences.moveCheckedTasks}
								<Check size={16} class="text-app-primary" />
							{/if}
						</button>
						<button
							type="button"
							class="flex w-full items-center justify-between rounded-lg border border-app-border/40 px-3 py-2.5 text-left transition hover:bg-app-element/60"
							onclick={() => selectMoveTarget('default')}
						>
							<div>
								<p class="text-sm text-app-text">Done</p>
								{#if !hasDoneColumn}
									<p class="mt-0.5 text-xs text-app-subtext">Uses a column titled Done when it exists.</p>
								{/if}
							</div>
							{#if preferences.moveCheckedTasks && !preferences.checkedTaskTargetColumnId.trim()}
								<Check size={16} class="text-app-primary" />
							{/if}
						</button>
						{#each columns as column (column.id)}
							<button
								type="button"
								class="flex w-full items-center justify-between rounded-lg border border-app-border/40 px-3 py-2.5 text-left transition hover:bg-app-element/60"
								onclick={() => selectMoveTarget(column.id)}
							>
								<span class="text-sm text-app-text">{column.title}</span>
								{#if preferences.moveCheckedTasks && preferences.checkedTaskTargetColumnId === column.id}
									<Check size={16} class="text-app-primary" />
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<label
						class="flex items-center justify-between gap-3 rounded-lg border border-app-border/40 px-3 py-2.5"
					>
						<div>
							<p class="text-sm font-medium text-app-text">Checkbox on new tasks</p>
							<p class="mt-0.5 text-xs text-app-subtext">
								Start new cards with a checkbox ready to toggle.
							</p>
						</div>
						<input
							type="checkbox"
							class="h-4 w-4 accent-app-primary"
							checked={preferences.defaultShowCheckbox}
							onchange={(event) =>
								updatePreferences({
									defaultShowCheckbox: (event.currentTarget as HTMLInputElement).checked
								})}
						/>
					</label>

					<button
						type="button"
						class="mt-2 flex w-full items-center justify-between gap-3 rounded-lg border border-app-border/40 px-3 py-2.5 text-left transition hover:bg-app-element/60"
						onclick={() => (pickingColumn = true)}
					>
						<div class="min-w-0">
							<p class="text-sm font-medium text-app-text">Move checked tasks to</p>
							<p class="mt-0.5 text-xs text-app-subtext">
								When a card is checked, move it to the selected column.
							</p>
						</div>
						<span class="inline-flex shrink-0 items-center gap-1 text-sm text-app-subtext">
							{moveTargetLabel}
							<ChevronRight size={14} />
						</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
