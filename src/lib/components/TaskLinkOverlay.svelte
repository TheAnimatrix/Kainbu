<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { TaskLinkEdge } from '$lib/kainbu/taskLinks';
	import { buildRoutedLinkPath, type LinkCurvePath, type ViewportRect } from '$lib/kainbu/taskLinkGeometry';

	export let active = false;
	export let edges: TaskLinkEdge[] = [];
	export let redrawToken = 0;

	let paths: LinkCurvePath[] = [];
	let resizeObserver: ResizeObserver | null = null;
	let mutationObserver: MutationObserver | null = null;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let measureFrameId: number | null = null;

	const escapeTaskId = (taskId: string) =>
		typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
			? CSS.escape(taskId)
			: taskId.replace(/["\\]/g, '\\$&');

	const isVisibleCardElement = (card: HTMLElement) => {
		if (card.closest('[data-is-dnd-shadow-item-hint="true"]')) return false;
		const rect = card.getBoundingClientRect();
		return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.right > 0;
	};

	const getCardRect = (taskId: string): ViewportRect | null => {
		if (typeof document === 'undefined') return null;

		const matches = document.querySelectorAll<HTMLElement>(
			`[data-task-id="${escapeTaskId(taskId)}"]`
		);

		for (const card of matches) {
			if (!isVisibleCardElement(card)) continue;
			const rect = card.getBoundingClientRect();
			return {
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height
			};
		}

		return null;
	};

	const measurePaths = () => {
		if (!active) {
			paths = [];
			return;
		}

		const nextPaths: LinkCurvePath[] = [];
		const seen = new Set<string>();

		for (const edge of edges) {
			const key = `${edge.fromId}|${edge.toId}|${edge.kind}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const fromRect = getCardRect(edge.fromId);
			const toRect = getCardRect(edge.toId);
			if (!fromRect || !toRect) continue;

			nextPaths.push({
				d: buildRoutedLinkPath(fromRect, toRect),
				kind: edge.kind
			});
		}

		const expectedCount = new Set(
			edges.map((edge) => `${edge.fromId}|${edge.toId}|${edge.kind}`)
		).size;

		if (nextPaths.length === 0 && paths.length > 0 && expectedCount > 0) {
			scheduleRetry();
		}

		// Never retain paths for cards removed or hidden during DnD.
		paths = nextPaths;
	};

	const scheduleRetry = () => {
		if (retryTimer) return;
		retryTimer = setTimeout(() => {
			retryTimer = null;
			measurePaths();
		}, 48);
	};

	const scheduleMeasure = () => {
		if (measureFrameId !== null) return;
		measureFrameId = requestAnimationFrame(() => {
			measureFrameId = null;
			measurePaths();
		});
	};

	const stopScheduledMeasure = () => {
		if (measureFrameId !== null) {
			cancelAnimationFrame(measureFrameId);
			measureFrameId = null;
		}
	};

	const attachObservers = () => {
		window.addEventListener('scroll', scheduleMeasure, true);
		window.addEventListener('resize', scheduleMeasure);
		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver(scheduleMeasure);
		const board = document.querySelector('[data-kanban-board-root]');
		if (!board) return;
		resizeObserver.observe(board);
		board.querySelectorAll<HTMLElement>('[data-task-id]').forEach((card) => {
			resizeObserver?.observe(card);
		});
		mutationObserver?.disconnect();
		mutationObserver = new MutationObserver(scheduleMeasure);
		mutationObserver.observe(board, { childList: true, subtree: true, attributes: true });
	};

	const detachObservers = () => {
		window.removeEventListener('scroll', scheduleMeasure, true);
		window.removeEventListener('resize', scheduleMeasure);
		resizeObserver?.disconnect();
		resizeObserver = null;
		mutationObserver?.disconnect();
		mutationObserver = null;
	};

	$: if (active) {
		redrawToken;
		edges;
		void tick().then(() => {
			if (!active) return;
			measurePaths();
			attachObservers();
		});
	} else {
		stopScheduledMeasure();
		detachObservers();
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		paths = [];
	}

	onDestroy(() => {
		stopScheduledMeasure();
		detachObservers();
		if (retryTimer) clearTimeout(retryTimer);
	});
</script>

{#if active && paths.length}
	<svg
		class="pointer-events-none fixed inset-0 z-[120]"
		aria-hidden="true"
		width="100%"
		height="100%"
	>
		{#each paths as path (`${path.d}-${path.kind}`)}
			<path
				d={path.d}
				fill="none"
				stroke="var(--color-app-accent, #3b82f6)"
				stroke-width="2"
				stroke-opacity="0.72"
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-dasharray={path.kind === 'reference' ? '6 4' : undefined}
			/>
		{/each}
	</svg>
{/if}
