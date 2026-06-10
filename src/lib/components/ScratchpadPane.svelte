<script lang="ts">
	import { Edit3, Eye, Plus, Trash2 } from '$lib/icons';
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
	<div class="flex items-center gap-2 border-b border-app-border/60 px-3 py-2">
		<label class="sr-only" for="scratchpad-pad-select">Select pad</label>
		<select
			id="scratchpad-pad-select"
			class="min-w-0 flex-1 truncate rounded-md border border-app-border/60 bg-transparent px-2 py-1.5 text-sm font-medium text-app-text outline-none transition hover:border-app-primary/40 focus:border-app-primary/60 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[16rem]"
			value={activePad?.id || ''}
			disabled={isDiffMode || isLocked}
			on:change={(event) => onSelectPad((event.currentTarget as HTMLSelectElement).value)}
		>
			{#each pads as pad}
				<option value={pad.id}>{pad.name}</option>
			{/each}
		</select>

		<span class="text-xs text-app-subtext/80">
			{pads.length} pad{pads.length === 1 ? '' : 's'}
		</span>

		<div class="ml-auto flex items-center gap-1">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-app-subtext transition hover:bg-app-element hover:text-app-text disabled:cursor-not-allowed disabled:opacity-50"
				disabled={isDiffMode || isLocked}
				title="New pad"
				aria-label="New pad"
				on:click={onCreatePad}
			>
				<Plus size={15} />
			</button>

			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-app-subtext transition hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
				disabled={isDiffMode || isLocked || !canDeletePad}
				title={canDeletePad && activePad ? `Delete ${activePad.name}` : 'Keep at least one pad'}
				aria-label="Delete pad"
				on:click={() => activePad && onDeletePad(activePad.id)}
			>
				<Trash2 size={15} />
			</button>

			{#if isDiffMode}
				<span class="ml-1 text-xs text-app-accent">Reviewing changes</span>
			{:else}
				<button
					type="button"
					class="ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-app-subtext transition hover:bg-app-element hover:text-app-text"
					on:click={() => (isPreview = !isPreview)}
				>
					{#if isPreview}
						<Edit3 size={13} />
						Edit
					{:else}
						<Eye size={13} />
						Preview
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden">
		{#if isDiffMode}
			<div class="h-full overflow-y-auto px-4 py-3 font-mono text-sm leading-relaxed">
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
			<div class="kainbu-prose h-full overflow-y-auto px-4 py-3">
				<RichText value={content || '*No content to preview*'} />
			</div>
		{:else}
			<textarea
				class="h-full w-full resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-app-text outline-none placeholder:text-app-subtext/40"
				placeholder="Start typing…"
				value={content}
				disabled={isLocked}
				on:input={(event) => onChange((event.currentTarget as HTMLTextAreaElement).value)}
			></textarea>
		{/if}
	</div>
</section>
