<script lang="ts">
	import { Check, X, Plus, MessageSquare } from 'lucide-svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import { DEMO_CHAT, DEMO_PROPOSAL } from './demoData';
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-app-surface/60 text-app-text">
	<div class="flex h-11 items-center gap-2 border-b border-app-border/60 px-3">
		<BrandMark size={20} framed={false} />
		<span class="text-xs font-semibold">Assistant</span>
		<MessageSquare size={13} class="ml-auto text-app-subtext" strokeWidth={1.75} />
	</div>

	<div class="min-h-0 flex-1 space-y-2.5 overflow-hidden p-3">
		{#each DEMO_CHAT as message (message.id)}
			<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
				<p
					class={`max-w-[88%] rounded-xl border px-2.5 py-1.5 text-[12px] leading-relaxed ${
						message.role === 'user'
							? 'border-app-primary/30 bg-app-primary/10'
							: 'border-app-border/70 bg-app-element/70'
					}`}
				>
					{message.text}
				</p>
			</div>
		{/each}

		<div class="rounded-xl border border-app-border bg-app-bg/70 p-2.5">
			<div class="flex items-center justify-between">
				<span class="text-[11px] font-semibold">Proposed changes</span>
				<span class="text-[10px] text-app-subtext">{DEMO_PROPOSAL.summary}</span>
			</div>

			<ul class="mt-2 space-y-1.5">
				{#each DEMO_PROPOSAL.tasks as task (task.id)}
					<li class="flex items-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1.5">
						<Plus size={11} class="shrink-0 text-emerald-300" strokeWidth={2.5} />
						<span class="min-w-0 flex-1 truncate text-[11px]">{task.title}</span>
						<span class={`inline-flex shrink-0 rounded px-1.5 py-px text-[9px] font-medium leading-tight ${getTagToneClasses(task.tag.color)}`}>
							{task.tag.label}
						</span>
					</li>
				{/each}
			</ul>

			<div class="mt-2.5 flex items-center gap-2">
				<span class="inline-flex items-center gap-1 rounded-md bg-app-primary px-2.5 py-1 text-[11px] font-semibold text-white">
					<Check size={12} strokeWidth={2.5} /> Accept
				</span>
				<span class="inline-flex items-center gap-1 rounded-md border border-app-border px-2.5 py-1 text-[11px] font-medium text-app-subtext">
					<X size={12} strokeWidth={2.5} /> Reject
				</span>
				<span class="ml-auto text-[10px] text-app-subtext">Nothing applies until you accept</span>
			</div>
		</div>
	</div>

	<div class="border-t border-app-border/60 p-3">
		<div class="rounded-lg border border-app-border bg-app-bg/70 px-3 py-2 text-[11px] text-app-subtext">
			Ask about this board, notes, or plans...
		</div>
	</div>
</div>
