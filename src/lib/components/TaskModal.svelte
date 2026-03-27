<script lang="ts">
	import {
		CheckSquare,
		ChevronDown,
		Clock3,
		Eye,
		FileText,
		Lock,
		PencilLine,
		Plus,
		Square,
		Tag as TagIcon,
		X
	} from 'lucide-svelte';
	import { SURFACE_TONE_OPTIONS, TAG_COLORS } from '$lib/kainbu/constants';
	import RichText from '$lib/components/RichText.svelte';
	import { createId } from '$lib/kainbu/id';
	import { clearTaskDueAt, getTaskDueAt, setTaskDueAt } from '$lib/kainbu/timing';
	import { getModalToneStyle, getTagToneClasses } from '$lib/kainbu/tags';
	import type { Tag, Task } from '$lib/kainbu/types';

	export let task: Task;
	export let columnTitle = '';
	export let existingTags: Tag[] = [];
	export let onClose: () => void;
	export let onSave: (nextTask: Task) => void;

	type DescriptionMode = 'write' | 'preview';

	let draft: Task = structuredClone(task);
	let tagSearch = '';
	let descriptionMode: DescriptionMode = 'write';
	let activeTaskId = task.id;
	let viewportWidth = 0;
	let tonePickerOpen = false;
	let tagColorPickerOpen = false;
	let selectedTagColor: string = TAG_COLORS[0]?.value ?? '';

	$: draft = structuredClone(task);
	$: isMobile = viewportWidth > 0 && viewportWidth < 1024;
	$: recentTags = existingTags
		.filter((tag) => !draft.tags.some((current) => current.label === tag.label))
		.slice(0, 6);
	$: if (task.id !== activeTaskId) {
		activeTaskId = task.id;
		descriptionMode = 'write';
	}
	$: canSave = draft.title.trim().length > 0;
	$: draftDueAt = getTaskDueAt(draft);
	$: currentTone =
		SURFACE_TONE_OPTIONS.find((t) => t.value === (draft.color || '')) ?? SURFACE_TONE_OPTIONS[0];
	$: currentTagColorSwatch =
		TAG_COLORS.find((c) => c.value === selectedTagColor) ?? TAG_COLORS[0];

	const autoGrowTitle = (node: HTMLTextAreaElement) => {
		const resize = () => {
			node.style.height = '0px';
			node.style.height = `${node.scrollHeight}px`;
		};

		queueMicrotask(resize);
		node.addEventListener('input', resize);

		return {
			update: resize,
			destroy() {
				node.removeEventListener('input', resize);
			}
		};
	};

	const toggleComplete = () => {
		const checked = !draft.checked;
		draft = {
			...draft,
			checked,
			completedAt: checked ? Date.now() : undefined
		};
	};

	const addTag = (label: string, color: string) => {
		const clean = label.trim();
		if (!clean || draft.tags.some((tag) => tag.label.toLowerCase() === clean.toLowerCase())) {
			return;
		}

		draft = {
			...draft,
			tags: [...draft.tags, { id: createId(), label: clean, color }]
		};
		tagSearch = '';
	};

	const deleteTag = (tagId: string) => {
		draft = {
			...draft,
			tags: draft.tags.filter((tag) => tag.id !== tagId)
		};
	};

	const toggleDescriptionCheckbox = (index: number, checked: boolean) => {
		if (!draft.description) return;
		let count = 0;
		draft = {
			...draft,
			description: draft.description.replace(/- \[([ xX])\]/g, (match, inner) => {
				if (count++ === index) {
					return checked ? '- [x]' : '- [ ]';
				}
				return match;
			})
		};
	};

	const setTaskColor = (color: string) => {
		draft = {
			...draft,
			color: color || undefined
		};
	};

	const toLocalInputValue = (timestamp?: number) => {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
		return normalized.toISOString().slice(0, 16);
	};

	const fromLocalInputValue = (value: string) => {
		if (!value.trim()) return undefined;
		const parsed = new Date(value).getTime();
		return Number.isFinite(parsed) ? parsed : undefined;
	};
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			if (tonePickerOpen || tagColorPickerOpen) {
				tonePickerOpen = false;
				tagColorPickerOpen = false;
			} else {
				onClose();
			}
		}
	}}
	on:mousedown={() => {
		tonePickerOpen = false;
		tagColorPickerOpen = false;
	}}
/>

<div
	class={`fixed inset-0 z-50 flex bg-black/60 backdrop-blur-md ${
		isMobile ? 'items-stretch justify-stretch p-0' : 'items-center justify-center p-4'
	}`}
>
	<button
		type="button"
		class="absolute inset-0 cursor-default"
		aria-label="Close task editor"
		on:click={onClose}
	></button>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Task editor"
		class={`relative z-10 flex w-full flex-col overflow-hidden bg-app-surface shadow-kainbu-xl ${
			isMobile
				? 'h-[100dvh] max-h-[100dvh] rounded-none border-0 pt-[var(--safe-top)]'
				: 'max-h-[90vh] max-w-4xl rounded-[1.45rem] border border-app-border'
		}`}
		style={getModalToneStyle(draft.color)}
	>
		<div
			class={`flex items-start justify-between gap-3 border-b border-app-border bg-app-surface ${
				isMobile ? 'px-4 py-3' : 'px-5 py-4'
			}`}
		>
			<div class="min-w-0 flex-1">
				<textarea
					bind:value={draft.title}
					use:autoGrowTitle
					rows="2"
					class={`max-h-56 w-full resize-none overflow-y-auto bg-transparent font-display font-bold leading-tight tracking-tight text-app-text outline-none placeholder:text-app-subtext/40 ${
						isMobile ? 'text-[20px]' : 'text-[24px]'
					}`}
					placeholder="Task title"
				></textarea>
				<div
					class={`mt-2 flex flex-wrap items-center gap-2 uppercase tracking-[0.25em] text-app-subtext ${
						isMobile ? 'text-[10px]' : 'text-xs'
					}`}
				>
					<span>in {columnTitle}</span>
				</div>
			</div>
			<button
				type="button"
				class={`border border-app-border bg-app-element text-app-subtext transition hover:text-app-text ${
					isMobile ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'
				}`}
				on:click={onClose}
			>
				<X size={18} />
			</button>
		</div>

		<div
			class={`min-h-0 flex-1 overflow-y-auto ${isMobile ? 'p-3' : 'p-4'}`}
		>
			<!-- Metadata strip -->
			<div class={`flex flex-wrap items-start gap-x-5 gap-y-3 ${isMobile ? 'pb-3' : 'pb-4'}`}>
				<!-- Status -->
				<div class="flex items-center gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<Lock size={13} />
						Status
					</span>
					<button
						type="button"
						class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
							draft.checked
								? 'border-app-accent/40 bg-app-accent/10 text-app-accent'
								: 'border-app-border bg-app-element text-app-text hover:border-app-primary/40 hover:text-app-primary'
						}`}
						on:click={toggleComplete}
					>
						{#if draft.checked}
							<CheckSquare size={13} />
							Completed
						{:else}
							<Square size={13} />
							Mark Complete
						{/if}
					</button>
				</div>

				<!-- Due Date -->
				<div class="flex items-center gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<Clock3 size={13} />
						Due
					</span>
					<input
						type="datetime-local"
						class="rounded-lg border border-app-border bg-app-element px-2 py-1 text-xs text-app-text outline-none transition focus:border-app-primary/40"
						value={toLocalInputValue(draftDueAt ?? undefined)}
						on:input={(event) => {
							const nextDueAt = fromLocalInputValue(
								(event.currentTarget as HTMLInputElement).value
							);
							draft =
								nextDueAt === undefined ? clearTaskDueAt(draft) : setTaskDueAt(draft, nextDueAt);
						}}
					/>
					{#if draftDueAt !== null}
						<button
							type="button"
							class="text-xs font-semibold text-app-subtext transition hover:text-app-primary"
							on:click={() => (draft = clearTaskDueAt(draft))}
						>
							Clear
						</button>
					{/if}
				</div>

				<!-- Card Tone -->
				<div class="relative flex items-center gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<TagIcon size={13} />
						Tone
					</span>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-element px-2 py-1 text-xs font-semibold text-app-text transition hover:border-app-primary/40"
						on:mousedown|stopPropagation
						on:click={() => (tonePickerOpen = !tonePickerOpen)}
					>
						<span class={`inline-block h-4 w-4 rounded-full border ${currentTone.swatchClass}`}
						></span>
						{currentTone.label}
						<ChevronDown
							size={12}
							class={`transition ${tonePickerOpen ? 'rotate-180' : ''}`}
						/>
					</button>
					{#if tonePickerOpen}
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class="absolute left-0 top-full z-20 mt-1.5 rounded-xl border border-app-border bg-app-surface p-2 shadow-kainbu-xl"
							on:mousedown|stopPropagation
						>
							<div class="flex flex-wrap gap-1.5">
								{#each SURFACE_TONE_OPTIONS as tone}
									<button
										type="button"
										aria-label={`Set card tone to ${tone.label}`}
										title={tone.label}
										class={`h-7 w-7 rounded-full border p-0 transition ${tone.swatchClass} ${
											(draft.color || '') === tone.value
												? 'scale-110 border-white/80 ring-2 ring-app-primary/45'
												: 'hover:scale-110 hover:border-app-primary/35'
										}`}
										on:click={() => {
											setTaskColor(tone.value);
											tonePickerOpen = false;
										}}
									></button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Tags -->
			<div class={`border-t border-app-border ${isMobile ? 'py-3' : 'py-3'}`}>
				<div class="flex flex-wrap items-start gap-2">
					<span class="flex items-center gap-1.5 py-1 text-xs font-semibold text-app-subtext">
						<TagIcon size={13} />
						Tags
					</span>
					{#if draft.tags.length}
						{#each draft.tags as tag (tag.id)}
							<span
								class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getTagToneClasses(tag.color)}`}
							>
								{tag.label}
								<button
									type="button"
									class="opacity-70 transition hover:opacity-100"
									on:click={() => deleteTag(tag.id)}
								>
									<X size={11} />
								</button>
							</span>
						{/each}
					{/if}
				</div>
				<div class="mt-2 flex items-center gap-2">
					<input
						bind:value={tagSearch}
						class="min-w-0 max-w-56 flex-1 rounded-lg border border-app-border bg-app-element px-2 py-1 text-xs text-app-text outline-none transition focus:border-app-primary/40"
						placeholder="New tag..."
						on:keydown={(event) => {
							if (event.key === 'Enter') addTag(tagSearch || 'New Tag', selectedTagColor);
						}}
					/>
					<div class="relative">
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-element px-2 py-1 text-xs text-app-text transition hover:border-app-primary/40"
							on:mousedown|stopPropagation
							on:click={() => (tagColorPickerOpen = !tagColorPickerOpen)}
						>
							<span
								class={`inline-block h-4 w-4 rounded-full border ${currentTagColorSwatch.swatchClass}`}
							></span>
							<ChevronDown
								size={11}
								class={`transition ${tagColorPickerOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if tagColorPickerOpen}
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<div
								class="absolute right-0 top-full z-20 mt-1.5 w-[14.5rem] max-w-[min(14.5rem,calc(100vw-3rem))] rounded-2xl border border-app-border bg-app-surface/96 p-3 shadow-kainbu-xl backdrop-blur-sm"
								on:mousedown|stopPropagation
							>
								<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext">
									Tag color
								</p>
								<div class="grid grid-cols-4 gap-2">
									{#each TAG_COLORS as color}
										<button
											type="button"
											aria-label={`Select ${color.value.replace('tone:', '')} color`}
											title={color.value.replace('tone:', '')}
											class={`h-8 w-8 rounded-full border p-0 transition ${color.swatchClass} ${
												selectedTagColor === color.value
													? 'border-white/80 ring-2 ring-app-primary/45 ring-offset-2 ring-offset-app-surface'
													: 'hover:-translate-y-0.5 hover:border-app-primary/35'
											}`}
											on:click={() => {
												selectedTagColor = color.value;
												tagColorPickerOpen = false;
											}}
										></button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					<button
						type="button"
						class="rounded-full bg-app-primary px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-app-primary-hover"
						on:click={() => addTag(tagSearch || 'New Tag', selectedTagColor)}
					>
						<Plus size={12} />
					</button>
				</div>
				{#if recentTags.length}
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">Recent</span>
						{#each recentTags as tag (tag.id)}
							<button
								type="button"
								class={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-100 ${getTagToneClasses(tag.color)}`}
								on:click={() => addTag(tag.label, tag.color)}
							>
								{tag.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Description (full width) -->
			<div class="border-t border-app-border pt-3">
				<div class="mb-2 flex items-center justify-between gap-3">
					<div class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<FileText size={13} />
						Description
					</div>
					<div class="flex rounded-full border border-app-border bg-app-element p-0.5 text-xs">
						<button
							type="button"
							class={`rounded-full px-2.5 py-1 font-semibold transition ${
								descriptionMode === 'write' ? 'bg-app-primary text-white' : 'text-app-subtext'
							}`}
							on:click={() => (descriptionMode = 'write')}
						>
							<PencilLine size={12} class="mr-1 inline" />
							Write
						</button>
						<button
							type="button"
							class={`rounded-full px-2.5 py-1 font-semibold transition ${
								descriptionMode === 'preview' ? 'bg-app-accent text-white' : 'text-app-subtext'
							}`}
							on:click={() => (descriptionMode = 'preview')}
						>
							<Eye size={12} class="mr-1 inline" />
							Preview
						</button>
					</div>
				</div>

				{#if descriptionMode === 'write'}
					<textarea
						bind:value={draft.description}
						rows={isMobile ? 11 : 16}
						class={`w-full resize-y rounded-lg border border-app-border bg-app-bg/60 text-sm leading-relaxed text-app-text outline-none transition focus:border-app-primary/50 focus:ring-2 focus:ring-app-primary/20 ${
							isMobile ? 'min-h-[15rem] px-3 py-2.5' : 'min-h-[22rem] px-3.5 py-3'
						}`}
						placeholder={'## Notes\n- Add structure\n- Add links\n- Add checklists'}
					></textarea>
				{:else}
					<div
						class={`rounded-lg border border-app-border bg-app-bg/60 ${
							isMobile ? 'min-h-[15rem] px-3 py-2.5' : 'min-h-[22rem] px-4 py-3'
						}`}
					>
						{#if draft.description?.trim()}
							<RichText value={draft.description} className="kainbu-prose" onCheckboxToggle={toggleDescriptionCheckbox} />
						{:else}
							<p class="text-sm leading-relaxed text-app-subtext">
								Nothing to preview yet. Write some markdown and switch back here.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div
			class={`flex border-t border-app-border bg-app-surface/95 backdrop-blur ${
				isMobile
					? 'sticky bottom-0 gap-2 px-3 pt-3 pb-[max(0.85rem,var(--safe-bottom))]'
					: 'items-center justify-end gap-3 px-5 py-4'
			}`}
		>
			<button
				type="button"
				class={`border border-app-border bg-app-element text-sm font-semibold text-app-text transition hover:border-app-primary/40 hover:text-app-primary ${
					isMobile ? 'flex-1 rounded-xl px-3 py-2.5' : 'rounded-2xl px-4 py-3'
				}`}
				on:click={onClose}
			>
				Cancel
			</button>
			<button
				type="button"
				disabled={!canSave}
				class={`inline-flex items-center justify-center gap-2 bg-app-primary text-sm font-semibold text-white transition hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${
					isMobile
						? 'flex-1 rounded-xl px-3 py-2.5'
						: 'rounded-2xl px-5 py-3 hover:-translate-y-0.5'
				}`}
				on:click={() => onSave(draft)}
			>
				<Plus size={16} />
				Save Task
			</button>
		</div>
	</div>
</div>
