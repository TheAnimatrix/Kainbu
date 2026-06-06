<script lang="ts">
	import { KeyRound, Check } from 'lucide-svelte';

	const providers = [
		{
			name: 'OpenRouter',
			blurb: 'Models + utility calls',
			hint: 'sk-or-v1-…3f9a',
			placeholder: 'sk-or-...'
		},
		{
			name: 'Vercel AI Gateway',
			blurb: 'Gateway-routed models',
			hint: 'vck_…be21',
			placeholder: 'vck_...'
		}
	];
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-app-surface/60 text-app-text">
	<div class="flex h-11 items-center gap-2 border-b border-app-border/60 px-3">
		<KeyRound size={14} strokeWidth={1.75} class="text-app-subtext" />
		<span class="text-xs font-semibold">AI keys</span>
		<span class="ml-auto text-[10px] text-app-subtext">Stored server-side · env fallback</span>
	</div>

	<div class="min-h-0 flex-1 space-y-2.5 overflow-hidden p-3">
		{#each providers as provider (provider.name)}
			<div class="rounded-lg border border-app-border/60 bg-app-bg/50 p-2.5">
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<p class="text-xs font-medium">{provider.name}</p>
						<p class="text-[10px] text-app-subtext">{provider.blurb}</p>
					</div>
					<span class="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
						<Check size={10} strokeWidth={3} /> Configured
					</span>
				</div>
				<div class="mt-2 flex items-center justify-between rounded-md border border-app-border/70 bg-app-element/50 px-2.5 py-1.5">
					<span class="font-mono text-[11px] text-app-text">{provider.placeholder}</span>
					<span class="font-mono text-[10px] text-app-subtext">{provider.hint}</span>
				</div>
			</div>
		{/each}
	</div>
</div>
