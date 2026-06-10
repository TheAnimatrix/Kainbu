<script lang="ts">
	import { FileText } from '$lib/icons';
	import MarkdownBlockEditor from '$lib/components/MarkdownBlockEditor.svelte';
	import type { TaskReferenceOption } from '$lib/kainbu/taskMarkdown';

	type PageDiffPart = {
		value: string;
		added?: boolean;
		removed?: boolean;
	};

	export let title = 'Page';
	export let content = '';
	export let comparisonContent: string | undefined = undefined;
	export let isLocked = false;
	export let active = true;
	export let referenceOptions: TaskReferenceOption[] = [];
	export let onReferenceNavigate: ((reference: TaskReferenceOption) => void) | undefined =
		undefined;
	export let onChange: (value: string) => void;
	export let hideHeader = false;

	const splitIntoBlocks = (value: string) => {
		const normalized = (value || '').replace(/\r\n/g, '\n').trim();
		if (!normalized.length) return [];
		return normalized.split(/\n\s*\n+/g);
	};

	const diffBlocks = (previousValue: string, nextValue: string): PageDiffPart[] => {
		const previous = splitIntoBlocks(previousValue);
		const next = splitIntoBlocks(nextValue);

		if (!previous.length && !next.length) return [];
		if (!previous.length) return next.map((value) => ({ value, added: true }));
		if (!next.length) return previous.map((value) => ({ value, removed: true }));

		const dp = Array.from({ length: previous.length + 1 }, () =>
			Array(next.length + 1).fill(0)
		);

		for (let row = 1; row <= previous.length; row += 1) {
			for (let column = 1; column <= next.length; column += 1) {
				dp[row][column] =
					previous[row - 1] === next[column - 1]
						? dp[row - 1][column - 1] + 1
						: Math.max(dp[row - 1][column], dp[row][column - 1]);
			}
		}

		const diff: PageDiffPart[] = [];
		let row = previous.length;
		let column = next.length;

		while (row > 0 || column > 0) {
			if (row > 0 && column > 0 && previous[row - 1] === next[column - 1]) {
				diff.unshift({ value: next[column - 1] });
				row -= 1;
				column -= 1;
			} else if (column > 0 && (row === 0 || dp[row][column - 1] >= dp[row - 1][column])) {
				diff.unshift({ value: next[column - 1], added: true });
				column -= 1;
			} else {
				diff.unshift({ value: previous[row - 1], removed: true });
				row -= 1;
			}
		}

		return diff;
	};

	$: isDiffMode = comparisonContent !== undefined;
	$: diffParts = isDiffMode && comparisonContent !== undefined ? diffBlocks(comparisonContent, content) : [];
</script>

<section class:hidden={!active} class="absolute inset-0 flex h-full flex-col overflow-hidden">
	{#if !hideHeader}
		<div class="flex items-center justify-between gap-2 border-b border-app-border/60 px-3 py-2">
			<p class="truncate text-sm font-medium text-app-text">{title}</p>
			{#if isDiffMode}
				<span class="text-xs text-app-accent">Reviewing changes</span>
			{/if}
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-hidden">
		{#if isDiffMode}
			<div class="h-full overflow-y-auto px-4 py-3 text-sm leading-relaxed">
				{#each diffParts as part, index (`diff-${index}-${part.added ? 'a' : part.removed ? 'r' : 's'}`)}
					{#if part.added}
						<div class="mb-2 whitespace-pre-wrap rounded border-l-2 border-emerald-500/50 bg-emerald-500/5 px-3 py-1.5 text-emerald-100">{part.value}</div>
					{:else if part.removed}
						<div class="mb-2 whitespace-pre-wrap rounded border-l-2 border-rose-500/50 bg-rose-500/5 px-3 py-1.5 text-rose-100 line-through opacity-70">
							{part.value}
						</div>
					{:else}
						<div class="mb-2 whitespace-pre-wrap px-3 py-1.5 text-app-text">{part.value}</div>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="h-full overflow-y-auto px-4 py-3">
				<MarkdownBlockEditor
					value={content}
					blockHandleMode="page"
					disabled={isLocked}
					{referenceOptions}
					{onReferenceNavigate}
					onChange={(nextValue) => onChange(nextValue)}
				/>
			</div>
		{/if}
	</div>
</section>
