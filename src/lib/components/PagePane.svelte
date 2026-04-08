<script lang="ts">
	import { FileText } from 'lucide-svelte';
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
	<div class="border-b border-app-border px-4 py-3">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-app-subtext">
					{title}
				</p>
			</div>
			{#if isDiffMode}
				<span
					class="rounded-full border border-app-accent/30 bg-app-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-app-accent"
				>
					Reviewing changes
				</span>
			{/if}
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden">
		<div class="h-full overflow-hidden rounded-sm bg-app-bg/50">
			{#if isDiffMode}
				<div class="h-full overflow-y-auto p-4 text-sm leading-relaxed">
					{#each diffParts as part, index (`diff-${index}-${part.added ? 'a' : part.removed ? 'r' : 's'}`)}
						{#if part.added}
							<div class="mb-2 whitespace-pre-wrap rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">{part.value}</div>
						{:else if part.removed}
							<div class="mb-2 whitespace-pre-wrap rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-rose-100 line-through opacity-70">
								{part.value}
							</div>
						{:else}
							<div class="mb-2 whitespace-pre-wrap rounded-md border border-app-border/60 bg-app-bg/50 px-3 py-2 text-app-text">{part.value}</div>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="h-full overflow-y-auto p-4">
					<MarkdownBlockEditor
						value={content}
						blockHandleMode="page"
						disabled={isLocked}
						{referenceOptions}
						{onReferenceNavigate}
						onChange={(nextValue) => onChange(nextValue)}
						placeholder={`## Notes\n- Add context\n- Link tasks with @\n- Use / for blocks`}
					/>
				</div>
			{/if}
		</div>
	</div>
</section>
