<script lang="ts">
	import { FileText } from '$lib/icons';
	import RichText from '$lib/components/RichText.svelte';
	import { DEMO_NOTE } from './demoData';
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-app-bg text-app-text">
	<div class="flex h-11 items-center gap-2 border-b border-app-border/60 px-3">
		<FileText size={14} strokeWidth={1.75} class="text-app-subtext" />
		<span class="text-xs font-semibold">Notes</span>
		<span class="text-[10px] text-app-subtext">· Tend Mobile</span>
	</div>

	<div class="landing-note-wrap min-h-0 flex-1 overflow-hidden px-5 py-4">
		<RichText value={DEMO_NOTE} className="kainbu-prose prose-tight" />
	</div>
</div>

<style>
	.landing-note-wrap :global(.kainbu-prose) {
		font-size: 0.8125rem;
		line-height: 1.55;
	}

	.landing-note-wrap :global(h1) {
		font-size: 1.05rem;
		margin-bottom: 0.5rem;
	}

	.landing-note-wrap :global(h2) {
		font-size: 0.875rem;
		margin-top: 0.85rem;
		margin-bottom: 0.35rem;
	}

	.landing-note-wrap :global(blockquote) {
		font-size: 0.78rem;
	}
</style>
