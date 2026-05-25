<script lang="ts">
	export let label = '';
	export let value: string | number = '';
	export let hint = '';
</script>

<div class="min-w-[8rem] flex-1 border border-app-border/40 bg-app-surface/40 px-3 py-2">
	<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-subtext">{label}</p>
	<p class="mt-1 text-lg font-semibold tabular-nums text-app-text">{value}</p>
	{#if hint}
		<p class="mt-0.5 text-xs text-app-subtext">{hint}</p>
	{/if}
</div>
