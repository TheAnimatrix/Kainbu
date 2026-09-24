<script lang="ts">
	import { CheckCircle2, ChevronRight, Circle, LoaderCircle, Sparkles, XCircle } from '$lib/icons';
	import { deriveToolActivities, type AiToolActivity } from '$lib/kainbu/aiActivity';
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
	let manuallyExpanded: boolean | null = null;
	let openToolIds = new Set<string>();

	const GENERIC_LIVE_LABELS = new Set(['Working…', 'Thinking…', 'Writing reply…']);
	const plainTraceText = (value = '') => stripMarkdownLite(value).trim();
	const isGenericLiveLabel = (text: string) => !text.trim() || GENERIC_LIVE_LABELS.has(text.trim());
	const summarize = (value = '', maxLength = 120) => {
		const plain = plainTraceText(value);
		return plain.length > maxLength ? `${plain.slice(0, maxLength - 1).trimEnd()}…` : plain;
	};
	const streamingTail = (value = '', maxLength = 120) => {
		const plain = plainTraceText(value);
		return plain.length > maxLength ? `…${plain.slice(-(maxLength - 1)).trimStart()}` : plain;
	};

	$: toolActivities = deriveToolActivities(events, isLive);
	$: thinkingEvents = events.filter(
		(event) => event.kind === 'thinking' && plainTraceText(event.message) !== 'Thinking…'
	);
	$: latestThinking = thinkingEvents.at(-1);
	$: latestStatus = events.filter((event) => event.kind === 'status').at(-1);
	$: draftEvent = events.filter((event) => event.kind === 'assistant_draft').at(-1);
	$: runningCount = toolActivities.filter((tool) => tool.state === 'running').length;
	$: completedCount = toolActivities.filter((tool) => tool.state === 'completed').length;
	$: errorCount = toolActivities.filter((tool) => tool.state === 'error').length;
	$: hasTraceDetails = toolActivities.length > 0 || Boolean(latestThinking);

	$: autoExpanded =
		isLive &&
		!compact &&
		!draftEvent?.message?.trim() &&
		(toolActivities.length > 0 || Boolean(latestThinking));
	$: expanded = manuallyExpanded ?? (defaultExpanded || autoExpanded);

	$: liveLabel = (() => {
		const runningTool = [...toolActivities].reverse().find((tool) => tool.state === 'running');
		if (runningTool) return runningTool.label;
		if (draftEvent?.message?.trim()) return latestStatus?.message || 'Writing reply…';
		if (latestStatus?.message) return latestStatus.message;
		if (latestThinking) return 'Thinking…';
		return '';
	})();

	$: settledLabel = (() => {
		if (errorCount) return `${errorCount} tool ${errorCount === 1 ? 'failure' : 'failures'}`;
		if (toolActivities.length) {
			const resolvedCount = completedCount + errorCount;
			return `${resolvedCount} of ${toolActivities.length} tool${toolActivities.length === 1 ? '' : 's'} finished`;
		}
		if (latestStatus?.message) return latestStatus.message;
		if (latestThinking) return 'Reasoning';
		return '';
	})();

	$: headerLabel = isLive ? liveLabel : settledLabel;
	$: compactLabel = (() => {
		if (!isLive || !compact) return '';
		if (runningCount || (headerLabel && !isGenericLiveLabel(headerLabel)))
			return summarize(headerLabel, 96);
		if (latestThinking) return streamingTail(latestThinking.message, 96);
		return '';
	})();
	$: showCompactLive = Boolean(isLive && compact && compactLabel);
	$: showTrace = showCompactLive || Boolean(headerLabel) || hasTraceDetails;

	const toggleExpanded = () => {
		manuallyExpanded = !expanded;
	};

	const toggleTool = (tool: AiToolActivity) => {
		if (!tool.input && !tool.result && !tool.resultDetail) return;
		const next = new Set(openToolIds);
		next.has(tool.id) ? next.delete(tool.id) : next.add(tool.id);
		openToolIds = next;
	};

	const stateLabel = (tool: AiToolActivity) => {
		if (tool.state === 'running') return 'Running';
		if (tool.state === 'completed') return 'Done';
		if (tool.state === 'error') return 'Failed';
		return 'No result';
	};
</script>

<!-- Interaction grammar adapted from Beautiful UI's Thinking State, Tool Chips,
     and Task Rows (MIT): https://github.com/slev12397/beautiful-ui -->
{#if showTrace}
	{#if showCompactLive}
		<div class="activity-trace max-w-[min(100%,34rem)] text-xs text-app-subtext" role="status">
			<div class="activity-live flex min-w-0 items-center gap-2 py-0.5">
				{#if showSpinner}
					<LoaderCircle size={13} class="shrink-0 animate-spin opacity-65" />
				{/if}
				<span class="activity-shimmer min-w-0 flex-1 truncate font-medium">{compactLabel}</span>
			</div>
		</div>
	{:else}
		<div class="activity-trace max-w-[min(100%,36rem)] text-xs text-app-subtext">
			<button
				type="button"
				class={`-mx-1.5 flex min-h-7 max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/45 ${
					hasTraceDetails ? 'hover:bg-app-element/40 hover:text-app-text' : 'cursor-default'
				}`}
				aria-expanded={hasTraceDetails ? expanded : undefined}
				disabled={!hasTraceDetails}
				on:click={toggleExpanded}
			>
				<span class="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
					{#if isLive}
						{#if showSpinner}
							<LoaderCircle size={14} class="animate-spin opacity-65" />
						{:else}
							<Sparkles size={14} class="text-app-primary/80" />
						{/if}
					{:else if errorCount}
						<XCircle size={14} class="text-rose-500" />
					{:else if toolActivities.length > 0 && completedCount === toolActivities.length}
						<CheckCircle2 size={14} class="text-emerald-600 dark:text-emerald-400" />
					{:else}
						<Sparkles size={14} class="opacity-60" />
					{/if}
				</span>
				<span
					class:activity-shimmer={isLive}
					class="min-w-0 flex-1 truncate font-medium text-app-subtext"
					role={isLive ? 'status' : undefined}
				>
					{headerLabel}
				</span>
				{#if hasTraceDetails}
					<ChevronRight
						size={13}
						class={`shrink-0 opacity-55 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
					/>
				{/if}
			</button>

			{#if hasTraceDetails}
				<div class:activity-panel-open={expanded} class="activity-panel grid" inert={!expanded}>
					<div class="min-h-0 overflow-hidden">
						<div class="relative ml-[7px] mt-1 border-l border-app-border/55 pb-0.5 pl-4">
							{#if latestThinking}
								<div class="relative mb-1.5 flex min-w-0 gap-2 py-1">
									<span
										class="activity-node absolute -left-[19px] top-2.5 h-1.5 w-1.5 rounded-full bg-app-subtext/40"
									></span>
									<div class="min-w-0">
										<div
											class="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-subtext/55"
										>
											Reasoning
										</div>
										<p
											class="line-clamp-4 whitespace-pre-wrap break-words leading-relaxed text-app-subtext/80"
										>
											{isLive
												? streamingTail(latestThinking.message, 360)
												: summarize(latestThinking.message, 360)}
										</p>
									</div>
								</div>
							{/if}

							{#each toolActivities as tool (tool.id)}
								{@const hasDetails = Boolean(tool.input || tool.result || tool.resultDetail)}
								{@const toolOpen = openToolIds.has(tool.id)}
								<div class="relative min-w-0">
									<span
										class={`activity-node absolute -left-[20px] top-[11px] flex h-3 w-3 items-center justify-center rounded-full bg-app-bg ${
											tool.state === 'error' ? 'text-rose-500' : 'text-app-subtext/65'
										}`}
										aria-hidden="true"
									>
										{#if tool.state === 'running'}
											<LoaderCircle size={11} class="animate-spin" />
										{:else if tool.state === 'completed'}
											<CheckCircle2 size={11} class="text-emerald-600 dark:text-emerald-400" />
										{:else if tool.state === 'error'}
											<XCircle size={11} />
										{:else}
											<Circle size={9} />
										{/if}
									</span>
									<button
										type="button"
										class={`group/tool -mx-1 flex min-h-7 w-[calc(100%+0.5rem)] min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/45 ${
											hasDetails ? 'hover:bg-app-element/40' : 'cursor-default'
										}`}
										aria-expanded={hasDetails ? toolOpen : undefined}
										disabled={!hasDetails}
										on:click={() => toggleTool(tool)}
									>
										<span class="min-w-0 flex-1 truncate font-medium text-app-text/85"
											>{tool.label}</span
										>
										<span
											class={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
												tool.state === 'running'
													? 'bg-app-primary/10 text-app-primary'
													: tool.state === 'completed'
														? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
														: tool.state === 'error'
															? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
															: 'bg-app-element/55 text-app-subtext/70'
											}`}
										>
											{stateLabel(tool)}
										</span>
										{#if hasDetails}
											<ChevronRight
												size={12}
												class={`shrink-0 opacity-45 transition-transform duration-200 ${toolOpen ? 'rotate-90' : ''}`}
											/>
										{/if}
									</button>

									{#if hasDetails}
										<div
											class:activity-tool-detail-open={toolOpen}
											class="activity-tool-detail grid"
										>
											<div class="min-h-0 overflow-hidden">
												<div
													class="mb-1 ml-1 border-l border-app-border/40 py-1 pl-3 text-[11px] leading-relaxed text-app-subtext/70"
												>
													{#if tool.input}
														<p class="break-words font-mono">{summarize(tool.input, 240)}</p>
													{/if}
													{#if tool.result}
														<p class={`break-words ${tool.input ? 'mt-1' : ''}`}>
															{summarize(tool.result, 240)}
														</p>
													{/if}
												</div>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.activity-panel,
	.activity-tool-detail {
		grid-template-rows: 0fr;
		opacity: 0;
		transition:
			grid-template-rows 260ms cubic-bezier(0.23, 1, 0.32, 1),
			opacity 180ms ease;
	}

	.activity-panel-open,
	.activity-tool-detail-open {
		grid-template-rows: 1fr;
		opacity: 1;
	}

	.activity-shimmer {
		background-image: linear-gradient(
			90deg,
			color-mix(in oklab, var(--color-app-subtext) 62%, transparent) 30%,
			var(--color-app-text) 50%,
			color-mix(in oklab, var(--color-app-subtext) 62%, transparent) 70%
		);
		background-size: 220% 100%;
		background-clip: text;
		color: transparent;
		animation: activity-shimmer 1.6s linear infinite;
	}

	@keyframes activity-shimmer {
		to {
			background-position: -220% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.activity-panel,
		.activity-tool-detail {
			transition: none;
		}

		.activity-shimmer {
			animation: none;
			background: none;
			color: inherit;
		}
	}
</style>
