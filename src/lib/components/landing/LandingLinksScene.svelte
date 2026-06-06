<script lang="ts">
	import { Link2 } from 'lucide-svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import type { BackgroundTheme } from '$lib/kainbu/types';
	import { DEMO_LINK_GROUP } from './demoData';

	const theme: BackgroundTheme = { kind: 'gradient', id: 'indigo-rain' };

	const anchor = DEMO_LINK_GROUP[0];
	const linked = DEMO_LINK_GROUP.slice(1);
</script>

<div class="relative h-full w-full overflow-hidden text-app-text" style="--link-color: 129 140 248;">
	<ThemedBackdrop {theme} colorMode="dark" />

	<div class="relative flex h-full flex-col">
		<div class="flex h-10 items-center gap-2 border-b border-app-border/60 px-3">
			<span class="inline-flex items-center gap-1.5 rounded-md border border-app-primary/40 bg-app-primary/15 px-2 py-1 text-[11px] font-medium text-app-text">
				<Link2 size={12} strokeWidth={2} /> Linked · {DEMO_LINK_GROUP.length} cards
			</span>
			<span class="text-[11px] text-app-subtext">View links</span>
		</div>

		<div class="relative min-h-0 flex-1 px-4 py-4">
			<svg
				class="pointer-events-none absolute inset-0 h-full w-full"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path
					d="M 40 50 C 56 50, 56 26, 70 26"
					fill="none"
					stroke="rgb(var(--link-color))"
					stroke-width="1.4"
					vector-effect="non-scaling-stroke"
					opacity="0.7"
				/>
				<path
					d="M 40 50 C 56 50, 56 74, 70 74"
					fill="none"
					stroke="rgb(var(--link-color))"
					stroke-width="1.4"
					vector-effect="non-scaling-stroke"
					opacity="0.7"
				/>
			</svg>

			<div class="relative grid h-full grid-cols-2 items-center gap-x-8">
				<div class="flex justify-start">
					<article class="w-[170px] rounded-lg border border-app-primary/50 bg-app-surface/90 p-2.5 ring-1 ring-app-primary/30 backdrop-blur-sm">
						<p class="text-[10px] text-app-subtext">{anchor.column}</p>
						<p class="mt-0.5 text-xs font-medium leading-snug">{anchor.title}</p>
						<div class="mt-1.5 flex flex-wrap gap-1">
							{#each anchor.tags as tag (tag.id)}
								<span class={`inline-flex rounded px-1.5 py-px text-[9px] font-medium leading-tight ${getTagToneClasses(tag.color)}`}>
									{tag.label}
								</span>
							{/each}
						</div>
					</article>
				</div>

				<div class="flex flex-col gap-5">
					{#each linked as card (card.id)}
						<article class="w-[170px] rounded-lg border border-app-border/80 bg-app-surface/85 p-2.5 backdrop-blur-sm">
							<p class="text-[10px] text-app-subtext">{card.column}</p>
							<p class="mt-0.5 text-xs font-medium leading-snug">{card.title}</p>
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each card.tags as tag (tag.id)}
									<span class={`inline-flex rounded px-1.5 py-px text-[9px] font-medium leading-tight ${getTagToneClasses(tag.color)}`}>
										{tag.label}
									</span>
								{/each}
							</div>
						</article>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
