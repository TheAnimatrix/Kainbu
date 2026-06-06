<script lang="ts">
	import { LayoutPanelTop, FileText, MessageSquare } from 'lucide-svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import { BRAND_NAME, DEFAULT_COLUMN_WIDTH } from '$lib/kainbu/constants';
	import { DEFAULT_BACKGROUND_THEME } from '$lib/kainbu/backgrounds';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import type { KanbanData } from '$lib/kainbu/types';

	const demoBoard: KanbanData = [
		{
			id: 'todo',
			title: 'To Do',
			width: DEFAULT_COLUMN_WIDTH,
			tasks: [
				{
					id: 't1',
					title: 'Explore Kainbu capabilities',
					description: 'Try asking the assistant to rewrite this description or add new tasks.',
					tags: [{ id: 'tag1', label: 'Feature', color: 'tone:blue' }],
					hasCheckbox: true,
					checked: false
				}
			]
		},
		{
			id: 'doing',
			title: 'In Progress',
			width: DEFAULT_COLUMN_WIDTH,
			tasks: [
				{
					id: 't2',
					title: 'Draft project plan',
					description: '- Define scope\n- Set milestones\n- Assign resources',
					tags: [
						{ id: 'tag2', label: 'Urgent', color: 'tone:red' },
						{ id: 'tag3', label: 'Q2', color: 'tone:amber' }
					],
					hasCheckbox: true,
					checked: false
				}
			]
		},
		{
			id: 'done',
			title: 'Done',
			width: DEFAULT_COLUMN_WIDTH,
			tasks: [
				{
					id: 't3',
					title: 'Set up workspace',
					description: '',
					tags: [],
					hasCheckbox: true,
					checked: true
				}
			]
		}
	];

	const chatMessages = [
		{
			role: 'assistant' as const,
			text: 'Hello. I can help you manage your board and notes. Ask me to add tasks, rewrite copy, or summarize what is here.'
		},
		{
			role: 'user' as const,
			text: 'Move Draft project plan to In Progress and tag it urgent.'
		},
		{
			role: 'assistant' as const,
			text: 'Done. **Draft project plan** is in In Progress with the Urgent tag. Review the card on your board.'
		}
	];
</script>

<div
	class="landing-workspace relative overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-kainbu-xl"
	aria-hidden="true"
>
	<ThemedBackdrop theme={DEFAULT_BACKGROUND_THEME} colorMode="dark" />

	<div class="relative flex h-[min(68vh,34rem)] min-h-[22rem]">
		<aside
			class="hidden w-14 shrink-0 flex-col border-r border-app-border/80 bg-app-surface/75 backdrop-blur-md sm:flex"
		>
			<div class="flex h-12 items-center justify-center border-b border-app-border/70">
				<BrandMark size={28} framed={false} />
			</div>
			<div class="flex flex-1 flex-col items-center gap-2 px-1.5 py-3">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-app-primary/35 bg-app-primary/10 text-app-text"
				>
					<LayoutPanelTop size={16} strokeWidth={1.75} />
				</div>
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg text-app-subtext opacity-55"
				>
					<FileText size={16} strokeWidth={1.75} />
				</div>
			</div>
		</aside>

		<div class="relative min-w-0 flex-1 overflow-hidden">
			<div class="flex h-11 items-center justify-between border-b border-app-border/70 px-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold text-app-text">Product launch</p>
					<p class="truncate text-[11px] text-app-subtext">Board</p>
				</div>
				<div class="rounded-md border border-app-border bg-app-element px-2 py-1 text-[10px] text-app-subtext">
					Synced
				</div>
			</div>

			<div class="h-[calc(100%-2.75rem)] overflow-hidden p-3">
				<div class="flex h-full gap-3 overflow-x-auto pb-1">
					{#each demoBoard as column (column.id)}
						<div
							class="flex h-full max-h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-app-border bg-app-column"
							style={`width:${Math.min(column.width ?? DEFAULT_COLUMN_WIDTH, 220)}px;`}
						>
							<div class="flex items-center justify-between gap-2 border-b border-app-border px-3 py-2.5">
								<h3 class="truncate text-sm font-semibold text-app-text">{column.title}</h3>
								<span class="text-[11px] text-app-subtext">{column.tasks.length}</span>
							</div>
							<div class="min-h-0 flex-1 space-y-2 overflow-hidden p-2">
								{#each column.tasks as task (task.id)}
									<article
										class="rounded-lg border border-app-border bg-app-surface/90 p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]"
									>
										<div class="flex items-start gap-2">
											<input
												type="checkbox"
												checked={task.checked}
												disabled
												class="mt-0.5"
												tabindex="-1"
											/>
											<div class="min-w-0 flex-1">
												<RichText
													value={task.title}
													className={`kainbu-prose prose-tight text-sm font-medium ${task.checked ? 'opacity-70' : ''}`}
												/>
												{#if task.description?.trim()}
													<div class="mt-1 inline-flex items-center gap-1 text-[10px] text-app-subtext">
														<FileText size={12} />
														<span>Description</span>
													</div>
												{/if}
											</div>
										</div>
										{#if task.tags?.length}
											<div class="mt-2 flex flex-wrap gap-1">
												{#each task.tags as tag (tag.id)}
													<span
														class={`inline-flex rounded-md px-1.5 py-px text-[10px] font-medium leading-tight ${getTagToneClasses(tag.color)}`}
													>
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

		<aside
			class="hidden w-[min(18rem,34%)] shrink-0 flex-col border-l border-app-border/80 bg-app-surface/88 backdrop-blur-xl md:flex"
		>
			<div class="flex h-11 items-center gap-2 border-b border-app-border/70 px-3">
				<BrandMark size={22} framed={false} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-semibold text-app-text">Assistant</p>
					<p class="truncate text-[10px] text-app-subtext">{BRAND_NAME}</p>
				</div>
				<MessageSquare size={14} class="text-app-subtext" strokeWidth={1.75} />
			</div>

			<div class="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
				{#each chatMessages as message, index (index)}
					<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
						<div
							class={`max-w-[92%] rounded-xl border px-3 py-2.5 ${
								message.role === 'user'
									? 'border-app-primary/25 bg-app-primary/10 text-app-text'
									: 'border-app-border bg-app-element/80 text-app-text'
							}`}
						>
							{#if message.role === 'assistant'}
								<RichText
									value={message.text}
									className="kainbu-prose kainbu-chat-prose text-[13px]"
								/>
							{:else}
								<p class="whitespace-pre-wrap text-[13px] leading-relaxed">{message.text}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<div class="border-t border-app-border/70 p-3">
				<div
					class="rounded-lg border border-app-border bg-app-bg/70 px-3 py-2 text-[12px] text-app-subtext"
				>
					Ask about tasks, notes, or plans...
				</div>
			</div>
		</aside>
	</div>
</div>

<style>
	.landing-workspace {
		pointer-events: none;
		user-select: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.landing-workspace {
			animation: landing-preview-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
	}

	@keyframes landing-preview-enter {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
