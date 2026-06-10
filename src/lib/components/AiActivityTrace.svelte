<script lang="ts">
	import { ChevronRight, LoaderCircle } from '$lib/icons';
	import { stripMarkdownLite } from '$lib/kainbu/markdown';
	import type { AiProgressEvent } from '$lib/kainbu/types';

	export let events: AiProgressEvent[] = [];
	export let isLive = false;
	export let defaultExpanded = false;
	/** When true, live mode shows a single updating status line (no step list). */
	export let compact = false;
	/** When false, the caller provides its own activity indicator (e.g. stream orb). */
	export let showSpinner = true;

	let expanded = defaultExpanded;

	const GENERIC_LIVE_LABELS = new Set(['Working…', 'Thinking…', 'Writing reply…']);

	const isGenericLiveLabel = (text: string) => !text.trim() || GENERIC_LIVE_LABELS.has(text.trim());

	const plainTraceText = (value = '') => stripMarkdownLite(value);

	$: traceEvents = events.filter(
		(event) =>
			event.kind !== 'status' &&
			event.kind !== 'tool_result' &&
			(isLive || event.kind !== 'assistant_draft')
	);

	$: draftEvent = [...events].reverse().find((event) => event.kind === 'assistant_draft');
	$: stepEvents = traceEvents.filter((event) => event.kind !== 'assistant_draft');

	$: if (isLive) {
		if (draftEvent?.message?.trim()) {
			expanded = false;
		} else if (!compact && stepEvents.some((event) => event.kind === 'thinking')) {
			expanded = true;
		}
	}

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
		if (draftEvent?.message?.trim()) {
			return streamingTail(plainTraceText(draftEvent.message), 96);
		}
		if (latestLiveEvent?.kind === 'tool_call') return latestLiveEvent.message;
		if (latestLiveEvent?.kind === 'thinking') {
			const message = plainTraceText(latestLiveEvent.message || '');
			return message && message !== 'Thinking…' ? streamingTail(message, 96) : '';
		}
		if (latestLiveEvent?.message) return plainTraceText(latestLiveEvent.message);
		return '';
	})();

	$: summaryText = (() => {
		if (!stepEvents.length && !draftEvent) return '';
		const parts: string[] = [];
		if (toolCallCount) parts.push(`${toolCallCount} tool${toolCallCount === 1 ? '' : 's'}`);
		if (stepEvents.some((event) => event.kind === 'thinking')) parts.push('thinking');
		if (draftEvent && isLive) parts.push('reply');
		return parts.length ? parts.join(' · ') : '';
	})();

	$: liveSummaryText = (() => {
		if (!isLive) return summaryText;
		if (draftEvent) return 'Writing reply…';
		if (latestLiveEvent?.kind === 'tool_call') return latestLiveEvent.message;
		if (latestLiveEvent?.kind === 'thinking') return 'Thinking…';
		return summaryText;
	})();

	const toggleExpanded = () => {
		expanded = !expanded;
	};

	const summarizeDetail = (detail = '', maxLength = 96) => {
		const plain = plainTraceText(detail);
		return plain.length > maxLength ? `${plain.slice(0, maxLength - 1).trimEnd()}…` : plain;
	};

	const streamingTail = (detail = '', maxLength = 96) =>
		detail.length > maxLength ? `…${detail.slice(-(maxLength - 1)).trimStart()}` : detail;

	$: showCompactLive = isLive && compact && compactLiveText && !isGenericLiveLabel(compactLiveText);
	$: showLiveHeader =
		isLive &&
		!compact &&
		(expanded || !isGenericLiveLabel(liveSummaryText) || Boolean(draftEvent?.message?.trim()));
	$: showTrace =
		showCompactLive ||
		showLiveHeader ||
		(!isLive && (traceEvents.length > 0 || Boolean(draftEvent)));
</script>

{#if showTrace}
	{#if showCompactLive}
		<div class="max-w-[min(100%,32rem)] text-[11px] text-app-subtext/70">
			<div class="relative flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5">
				<div
					class="animate-shimmer-subtle pointer-events-none absolute inset-0 rounded-sm opacity-40"
				></div>
				{#if showSpinner}
					<LoaderCircle size={12} class="relative shrink-0 animate-spin opacity-60" />
				{/if}
				<span class="relative min-w-0 flex-1 truncate font-normal">{compactLiveText}</span>
			</div>
		</div>
	{:else}
		<div class="max-w-[min(100%,32rem)] text-[11px] text-app-subtext/70">
			{#if showLiveHeader || !isLive}
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
						>{isLive ? liveSummaryText : summaryText}</span
					>
					{#if isLive && showSpinner}
						<LoaderCircle size={12} class="relative shrink-0 animate-spin opacity-50" />
					{/if}
				</button>
			{/if}

			{#if expanded}
				<div class="mt-1 space-y-1 border-l border-app-border/30 pl-2.5">
					{#each stepEvents as event (event.id)}
						<div class="relative min-w-0">
							{#if isLive && event === stepEvents[stepEvents.length - 1]}
								<div
									class="animate-shimmer-subtle pointer-events-none absolute inset-0 rounded-sm opacity-50"
								></div>
							{/if}
							<p
								class={`relative font-normal leading-snug ${
									event.kind === 'thinking'
										? 'line-clamp-4 whitespace-pre-wrap break-words'
										: 'truncate'
								}`}
							>
								{#if event.kind === 'thinking'}
									{@const isStreaming = isLive && event === stepEvents[stepEvents.length - 1]}
									{@const thinkingText = plainTraceText(event.message || '')}
									<span class="text-app-subtext/55">Thinking</span>
									{#if thinkingText && thinkingText !== 'Thinking…'}
										<span class="text-app-subtext/50">
											{' — '}{isStreaming
												? streamingTail(thinkingText, 320)
												: summarizeDetail(thinkingText, 320)}</span
										>
									{/if}
								{:else if event.kind === 'tool_call'}
									{event.message}
								{:else}
									{plainTraceText(event.message)}
								{/if}
							</p>
						</div>
					{/each}
				</div>
			{/if}

			{#if draftEvent && isLive && !compact}
				<div class="relative mt-1 min-w-0 pl-2.5">
					<p class="relative text-[11px] font-normal leading-relaxed text-app-subtext/75">
						{plainTraceText(draftEvent.message) || '…'}
					</p>
				</div>
			{/if}
		</div>
	{/if}
{/if}
