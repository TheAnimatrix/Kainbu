<script lang="ts">
	import { Check, LayoutPanelTop, FileText, Search, Share2 } from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ChatOrb from '$lib/components/ChatOrb.svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import { getChatOrbStyle } from '$lib/kainbu/backgrounds';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import type { BackgroundTheme } from '$lib/kainbu/types';
	import { DEMO_BOARD, DEMO_PROJECTS } from './demoData';

	interface Props {
		themeId?: string;
	}

	let { themeId = 'lagoon-veil' }: Props = $props();

	const theme = $derived<BackgroundTheme>({ kind: 'gradient', id: themeId });
	const orbStyle = $derived(getChatOrbStyle(theme, '', 'dark'));
</script>

<div class="relative h-full w-full overflow-hidden text-app-text">
	<ThemedBackdrop {theme} colorMode="dark" />

	<div class="relative flex h-full">
		<aside class="hidden w-36 shrink-0 flex-col border-r border-app-border/70 bg-app-surface/70 backdrop-blur-md sm:flex">
			<div class="flex h-11 items-center gap-2 border-b border-app-border/60 px-3">
				<BrandMark size={22} framed={false} />
				<span class="text-sm font-semibold tracking-tight">Kainbu</span>
			</div>
			<div class="flex-1 px-2 py-3">
				<p class="px-1.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-app-subtext">
					Projects
				</p>
				<ul class="space-y-0.5">
					{#each DEMO_PROJECTS as project (project.id)}
						<li
							class={`truncate rounded-md px-2 py-1.5 text-xs ${
								project.active
									? 'bg-app-element font-medium text-app-text'
									: 'text-app-subtext'
							}`}
						>
							{project.name}
						</li>
					{/each}
				</ul>
				<div class="mt-1 space-y-0.5 border-l border-app-border/60 pl-2">
					<p class="flex items-center gap-1.5 rounded-md bg-app-primary/10 px-2 py-1 text-[11px] text-app-text">
						<LayoutPanelTop size={12} strokeWidth={1.75} /> Board
					</p>
					<p class="flex items-center gap-1.5 px-2 py-1 text-[11px] text-app-subtext">
						<FileText size={12} strokeWidth={1.75} /> Notes
					</p>
				</div>
			</div>
		</aside>

		<div class="min-w-0 flex-1">
			<div class="flex h-11 items-center justify-between gap-2 border-b border-app-border/60 px-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold">Tend Mobile</p>
				</div>
				<div class="flex items-center gap-1.5 text-app-subtext">
					<Search size={14} strokeWidth={1.75} />
					<Share2 size={14} strokeWidth={1.75} />
				</div>
			</div>

			<div class="h-[calc(100%-2.75rem)] overflow-hidden p-3">
				<div class="flex h-full gap-2.5">
					{#each DEMO_BOARD as column (column.id)}
						<div class="flex h-full min-h-0 w-[152px] shrink-0 flex-col overflow-hidden rounded-lg border border-app-border/80 bg-app-column/80 backdrop-blur-sm">
							<div class="flex items-center justify-between border-b border-app-border/70 px-2.5 py-2">
								<span class="truncate text-xs font-semibold">{column.title}</span>
								<span class="text-[10px] text-app-subtext">{column.tasks.length}</span>
							</div>
							<div class="min-h-0 flex-1 space-y-2 overflow-hidden p-2">
								{#each column.tasks as task (task.id)}
									<article class="rounded-md border border-app-border/80 bg-app-surface/85 p-2">
										<div class="flex items-start gap-1.5">
											<span
												class={`mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
													task.checked
														? 'border-app-primary bg-app-primary/80'
														: 'border-app-subtext/60'
												}`}
											>
												{#if task.checked}
													<Check size={8} class="text-white" />
												{/if}
											</span>
											<span class={`text-[11px] font-medium leading-snug ${task.checked ? 'text-app-subtext line-through' : ''}`}>
												{task.title}
											</span>
										</div>
										{#if task.tags?.length}
											<div class="mt-1.5 flex flex-wrap gap-1 pl-[18px]">
												{#each task.tags as tag (tag.id)}
													<span class={`inline-flex rounded px-1.5 py-px text-[9px] font-medium leading-tight ${getTagToneClasses(tag.color)}`}>
														{tag.label}
													</span>
												{/each}
											</div>
										{/if}
									</article>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<ChatOrb style={orbStyle} />
</div>
