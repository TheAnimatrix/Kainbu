<script lang="ts">
	import { CheckCheck, CloudAlert, CloudCog, Dot } from '$lib/icons';
	import type { SyncStatus } from '$lib/kainbu/types';

	export let status: SyncStatus = 'idle';
	export let compact = false;
	/** Optional detail for compact mode (e.g. hover on sync error dot). */
	export let hint = '';

	const config = {
		idle: {
			label: 'Idle',
			className: 'text-app-subtext border-app-border/70 bg-app-element/60',
			icon: Dot,
			dotClass: 'bg-app-subtext/55'
		},
		local: {
			label: 'Local',
			className: 'text-amber-200 border-amber-500/30 bg-amber-500/10',
			icon: Dot,
			dotClass: 'bg-amber-300'
		},
		syncing: {
			label: 'Syncing',
			className: 'text-app-primary border-app-primary/40 bg-app-primary/10',
			icon: CloudCog,
			dotClass: 'bg-app-primary'
		},
		synced: {
			label: 'Synced',
			className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
			icon: CheckCheck,
			dotClass: 'bg-emerald-300'
		},
		error: {
			label: 'Sync issue',
			className: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
			icon: CloudAlert,
			dotClass: 'bg-rose-300'
		}
	} as const;

	$: active = config[status];
</script>

{#if compact}
	<span
		class={`inline-flex h-2.5 w-2.5 rounded-full ${active.dotClass}`}
		aria-label={active.label}
		title={hint || active.label}
	></span>
{:else}
	<span
		class={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] ${active.className}`}
	>
		<svelte:component this={active.icon} size={12} />
		{active.label}
	</span>
{/if}
