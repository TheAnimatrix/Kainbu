<script lang="ts">
	import { Edit3, Eye, Plus, Trash2 } from 'lucide-svelte';
	import { diffWords } from '$lib/kainbu/diff';
	import RichText from '$lib/components/RichText.svelte';
	import type { ScratchpadPad } from '$lib/kainbu/types';

	export let pads: ScratchpadPad[] = [];
	export let activePadId = '';
	export let content = '';
	export let isLocked = false;
	export let comparisonContent: string | undefined = undefined;
	export let active = true;
	export let onSelectPad: (padId: string) => void;
	export let onCreatePad: () => void;
	export let onDeletePad: (padId: string) => void;
	export let onChange: (value: string) => void;

	let isPreview = false;

	$: activePad = pads.find((pad) => pad.id === activePadId) || pads[0];
	$: canDeletePad = pads.length > 1 && activePad !== undefined;
	$: isDiffMode = comparisonContent !== undefined;
	$: diffParts =
		isDiffMode && comparisonContent !== undefined ? diffWords(comparisonContent, content) : [];
	$: if (isDiffMode) {
		isPreview = false;
	}
</script>

<section class:hidden={!active} class="absolute inset-0 flex h-full flex-col overflow-hidden">
	<div class="border-b border-app-border px-4 py-3">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<h2 class="text-lg font-bold text-app-text">Scratchpad</h2>
				<p class="text-xs uppercase tracking-[0.25em] text-app-subtext">Markdown notebook</p>
			</div>

			<div class="flex items-center gap-3">
				<span
					class="rounded-full border border-app-border bg-app-element/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-app-subtext"
				>
					{pads.length} pad{pads.length === 1 ? '' : 's'}
				</span>

				{#if isDiffMode}
					<span
						class="rounded-full border border-app-accent/30 bg-app-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-app-accent"
					>
						Reviewing changes
					</span>
				{:else}
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-element px-3 py-2 text-sm text-app-text transition hover:border-app-primary/40 hover:text-app-primary"
						on:click={() => (isPreview = !isPreview)}
					>
						{#if isPreview}
							<Edit3 size={16} />
							Edit
						{:else}
							<Eye size={16} />
							Preview
						{/if}
					</button>
				{/if}
			</div>
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<label class="sr-only" for="scratchpad-pad-select">Select scratchpad pad</label>
			<select
				id="scratchpad-pad-select"
				class="min-w-0 flex-1 rounded-xl border border-app-border bg-app-element px-3 py-2.5 text-sm font-medium text-app-text outline-none transition hover:border-app-primary/35 focus:border-app-primary/50 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
				value={activePad?.id || ''}
				disabled={isDiffMode || isLocked}
				on:change={(event) => onSelectPad((event.currentTarget as HTMLSelectElement).value)}
			>
				{#each pads as pad}
					<option value={pad.id}>{pad.name}</option>
				{/each}
			</select>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-element px-3 py-2.5 text-sm font-medium text-app-text transition hover:border-app-primary/40 hover:text-app-primary disabled:cursor-not-allowed disabled:opacity-60"
					disabled={isDiffMode || isLocked}
					on:click={onCreatePad}
				>
					<Plus size={16} />
					New pad
				</button>

				<button
					type="button"
					class="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-element px-3 py-2.5 text-sm font-medium text-app-text transition hover:border-rose-400/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={isDiffMode || isLocked || !canDeletePad}
					title={canDeletePad && activePad ? `Delete ${activePad.name}` : 'Keep at least one pad'}
					on:click={() => activePad && onDeletePad(activePad.id)}
				>
					<Trash2 size={16} />
					Delete
				</button>
			</div>
		</div>

		<p class="mt-2 text-xs text-app-subtext">
			AI usually edits the active pad and can pull other pads only when it needs more context.
		</p>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden p-2 lg:p-3">
		<div class="h-full overflow-hidden rounded-[1.1rem] border border-app-border bg-app-bg/70">
			{#if isDiffMode}
				<div class="h-full overflow-y-auto p-4 font-mono text-sm leading-relaxed">
					{#each diffParts as part}
						{#if part.added}
							<span class="rounded bg-emerald-500/15 px-0.5 text-emerald-200">{part.value}</span>
						{:else if part.removed}
							<span class="rounded bg-rose-500/15 px-0.5 text-rose-200 line-through opacity-70">
								{part.value}
							</span>
						{:else}
							<span class="text-app-text">{part.value}</span>
						{/if}
					{/each}
				</div>
			{:else if isPreview}
				<div class="kainbu-prose h-full overflow-y-auto p-4">
					<RichText value={content || '*No content to preview*'} />
				</div>
			{:else}
				<textarea
					class="h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-app-text outline-none placeholder:text-app-subtext/50"
					placeholder="Start typing your notes here..."
					value={content}
					disabled={isLocked}
					on:input={(event) => onChange((event.currentTarget as HTMLTextAreaElement).value)}
				></textarea>
			{/if}
		</div>
	</div>
</section>
