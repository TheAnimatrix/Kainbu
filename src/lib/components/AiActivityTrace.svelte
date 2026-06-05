<script lang="ts">
	import { ChevronRight, LoaderCircle } from 'lucide-svelte';
	import type { AiProgressEvent } from '$lib/kainbu/types';

	export let events: AiProgressEvent[] = [];
	export let isLive = false;
	export let defaultExpanded = false;
	/** When true, live mode shows a single updating status line (no step list). */
	export let compact = false;

	let expanded = defaultExpanded;

	$: traceEvents = events.filter(
		(event) =>
			event.kind !== 'status' &&
			event.kind !== 'tool_result' &&
			(isLive || event.kind !== 'assistant_draft')
	);

	$: draftEvent = [...events].reverse().find((event) => event.kind === 'assistant_draft');
	$: stepEvents = traceEvents.filter((event) => event.kind !== 'assistant_draft');

	$: toolCallCount = stepEvents.filter((event) => event.kind === 'tool_call').length;

	$: latestLiveEvent = [...events]
		.filter(
			(event) =>
				event.kind !== 'tool_result' &&
				event.kind !== 'assistant_draft' &&
				event.kind !== 'status'
		)
		.at(-1);

	$: compactLiveText = (() => {
		if (!isLive || !compact) return '';
		if (latestLiveEvent?.kind === 'tool_call') return latestLiveEvent.message;
		if (latestLiveEvent?.kind === 'thinking') {
			const message = latestLiveEvent.message || '';
			return message && message !== 'Thinking…' ? streamingTail(message, 96) : 'Thinking…';
		}
		if (latestLiveEvent?.message) return latestLiveEvent.message;
		return 'Working…';
	})();

	$: summaryText = (() => {
		if (!stepEvents.length && !draftEvent) return isLive ? 'Working…' : '';
		const parts: string[] = [];
		if (toolCallCount) parts.push(`${toolCallCount} tool${toolCallCount === 1 ? '' : 's'}`);
		if (stepEvents.some((event) => event.kind === 'thinking')) parts.push('thinking');
		if (draftEvent && isLive) parts.push('reply');
		return parts.length ? parts.join(' · ') : 'Working…';
	})();

	// While live, the collapsed header reads as a single shimmering status line
	// ("Thinking…", a tool name, or "Writing reply…") rather than the full step list.
	$: liveSummaryText = (() => {
		if (!isLive) return summaryText;
		if (draftEvent) return 'Writing reply…';
		if (latestLiveEvent?.kind === 'tool_call') return latestLiveEvent.message;
		if (latestLiveEvent?.kind === 'thinking') return 'Thinking…';
		return summaryText || 'Working…';
	})();

	const toggleExpanded = () => {
		expanded = !expanded;
	};

	const summarizeDetail = (detail = '', maxLength = 96) =>
		detail.length > maxLength ? `${detail.slice(0, maxLength - 1).trimEnd()}…` : detail;

	// While a thinking step is actively streaming, show the most recent text (tail)
	// so it reads as a flowing stream instead of freezing on the first few words.
	const streamingTail = (detail = '', maxLength = 96) =>
		detail.length > maxLength ? `…${detail.slice(-(maxLength - 1)).trimStart()}` : detail;
</script>

{#if isLive && compact}
	<div class="max-w-[min(100%,32rem)] text-[11px] text-app-subtext/70">
		<div class="relative flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5">
			<div
				class="animate-shimmer-subtle pointer-events-none absolute inset-0 rounded-sm opacity-40"
			></div>
			<LoaderCircle size={12} class="relative shrink-0 animate-spin opacity-60" />
			<span class="relative min-w-0 flex-1 truncate font-normal">{compactLiveText}</span>
		</div>
	</div>
{:else if isLive || traceEvents.length || draftEvent}
	<div class="max-w-[min(100%,32rem)] text-[11px] text-app-subtext/70">
		<button
			type="button"
			class="relative flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition hover:text-app-subtext"
			on:click={toggleExpanded}
		>
			{#if isLive && !expanded}
				<div
					class="animate-shimmer-subtle pointer-events-none absolute inset-0 rounded-sm opacity-40"
				></div>
			{/if}
			<ChevronRight
				size={12}
				class={`relative shrink-0 opacity-60 transition-transform ${expanded ? 'rotate-90' : ''}`}
			/>
			<span class="relative min-w-0 flex-1 truncate font-normal"
				>{isLive ? liveSummaryText : summaryText || 'Working…'}</span
			>
			{#if isLive}
				<LoaderCircle size={12} class="relative shrink-0 animate-spin opacity-50" />
			{/if}
		</button>

		{#if expanded}
			<div class="mt-1 space-y-1 border-l border-app-border/30 pl-2.5">
				{#each stepEvents as event (event.id)}
					<div class="relative min-w-0">
						{#if isLive && event === stepEvents[stepEvents.length - 1]}
							<div
								class="animate-shimmer-subtle pointer-events-none absolute inset-0 rounded-sm opacity-50"
							></div>
						{/if}
						<p class="relative truncate font-normal leading-snug">
							{#if event.kind === 'thinking'}
								{@const isStreaming = isLive && event === stepEvents[stepEvents.length - 1]}
								<span class="text-app-subtext/55">Thinking</span>
								{#if event.message && event.message !== 'Thinking…'}
									<span class="text-app-subtext/50">
										{' — '}{isStreaming
											? streamingTail(event.message, 72)
											: summarizeDetail(event.message, 72)}</span
									>
								{/if}
							{:else if event.kind === 'tool_call'}
								{event.message}
							{:else}
								{event.message}
							{/if}
						</p>
					</div>
				{/each}
			</div>
		{/if}

		<!-- The streaming reply stays visible even while the thinking trace is collapsed. -->
		{#if draftEvent && isLive}
			<div class="relative mt-1 min-w-0 pl-2.5">
				<p class="relative text-[11px] font-normal leading-relaxed text-app-subtext/75">
					{draftEvent.message || '…'}
				</p>
			</div>
		{/if}
	</div>
{/if}
