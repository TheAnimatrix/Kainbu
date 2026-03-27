<script lang="ts">
	import { afterUpdate, tick } from 'svelte';
	import { Check, Info, LoaderCircle, Paperclip, Send, Trash2, X, XCircle } from 'lucide-svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { MODEL_PRESET_LABELS } from '$lib/kainbu/constants';
	import { createId } from '$lib/kainbu/id';
	import { getTagToneClasses } from '$lib/kainbu/tags';
	import type {
		ChatAttachment,
		ChatMessage,
		ChatMode,
		ChatTaskCard,
		ModelPreset,
		PendingProposal
	} from '$lib/kainbu/types';
	import RichText from '$lib/components/RichText.svelte';

	export let history: ChatMessage[] = [];
	export let draft = '';
	export let queuedAttachments: ChatAttachment[] = [];
	export let queuedTaskCards: ChatTaskCard[] = [];
	export let isProcessing = false;
	export let pendingProposal: PendingProposal | null = null;
	export let proposalPreviewActive = false;
	export let chatMode: ChatMode = 'auto';
	export let modelPreset: ModelPreset = 'fast';
	export let active = true;
	export let chrome: 'floating' | 'sidebar' | 'mobile' = 'floating';
	export let onDraftChange: (value: string) => void;
	export let onSend: () => void;
	export let onAddAttachments: (attachments: ChatAttachment[]) => void;
	export let onRemoveAttachment: (attachmentId: string) => void;
	export let onRemoveTaskCard: (taskCardId: string) => void;
	export let onClearHistory: () => void;
	export let onChatModeChange: (mode: ChatMode) => void;
	export let onModelPresetChange: (preset: ModelPreset) => void;
	export let onReviewProposal: (() => void) | null = null;
	export let onAcceptProposal: () => void;
	export let onRejectProposal: () => void;
	export let onCollapseSidebar: (() => void) | null = null;

	let fileInput: HTMLInputElement | null = null;
	let historyViewport: HTMLDivElement | null = null;
	let previewViewport: HTMLDivElement | null = null;
	const COMPOSER_MIN_HEIGHT = 44;
	const COMPOSER_MAX_HEIGHT = 176;
	const PREVIEW_MIN_SCALE = 1;
	const PREVIEW_MAX_SCALE = 4;
	const TEXT_ATTACHMENT_EXTENSIONS = [
		'.txt',
		'.md',
		'.json',
		'.js',
		'.jsx',
		'.ts',
		'.tsx',
		'.css',
		'.html'
	];

	$: isSidebar = chrome === 'sidebar';
	$: isMobileChrome = chrome === 'mobile';
	$: isFramelessChrome = isSidebar || isMobileChrome;

	let previousHistorySignature = '';
	let previousActive = false;
	let previewAttachment: ChatAttachment | null = null;
	let previewScale = PREVIEW_MIN_SCALE;
	let previewOffsetX = 0;
	let previewOffsetY = 0;
	let previewIsDragging = false;
	let previewPointers = new Map<number, { x: number; y: number }>();
	let previewPinchStartDistance = 0;
	let previewPinchStartScale = PREVIEW_MIN_SCALE;
	let previewDragStartX = 0;
	let previewDragStartY = 0;
	let previewDragOriginX = 0;
	let previewDragOriginY = 0;

	$: if (!active && previewAttachment) {
		previewAttachment = null;
	}

	const toDataUrl = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => resolve(reader.result as string);
			reader.readAsDataURL(file);
		});

	const toText = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => resolve(reader.result as string);
			reader.readAsText(file);
		});

	const isSupportedTextAttachment = (file: File) => {
		const normalizedName = file.name.toLowerCase();
		return (
			file.type.startsWith('text/') ||
			file.type === 'application/json' ||
			file.type === 'application/javascript' ||
			TEXT_ATTACHMENT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
		);
	};

	const handleFiles = async (fileList: FileList | null) => {
		if (!fileList?.length) return;

		const nextAttachments: ChatAttachment[] = [];
		for (const file of Array.from(fileList)) {
			if (file.type.startsWith('image/')) {
				nextAttachments.push({
					id: createId(),
					kind: 'image',
					name: file.name,
					mimeType: file.type,
					content: await toDataUrl(file)
				});
				continue;
			}

			if (isSupportedTextAttachment(file)) {
				nextAttachments.push({
					id: createId(),
					kind: 'text',
					name: file.name,
					mimeType: file.type || 'text/plain',
					content: await toText(file)
				});
			}
		}

		if (nextAttachments.length) {
			onAddAttachments(nextAttachments);
		}
		if (fileInput) fileInput.value = '';
	};

	const canSendMessage = () =>
		(draft.trim().length > 0 || queuedAttachments.length > 0 || queuedTaskCards.length > 0) &&
		!isProcessing;

	const submitComposer = () => {
		if (!canSendMessage()) return;
		onSend();
	};

	const clampPreviewScale = (value: number) =>
		Math.max(PREVIEW_MIN_SCALE, Math.min(PREVIEW_MAX_SCALE, value));

	const clampPreviewOffset = (nextX: number, nextY: number, scale = previewScale) => {
		if (!previewViewport || scale <= PREVIEW_MIN_SCALE) {
			return { x: 0, y: 0 };
		}

		const bounds = previewViewport.getBoundingClientRect();
		const maxX = Math.max(0, (bounds.width * scale - bounds.width) / 2);
		const maxY = Math.max(0, (bounds.height * scale - bounds.height) / 2);

		return {
			x: Math.max(-maxX, Math.min(maxX, nextX)),
			y: Math.max(-maxY, Math.min(maxY, nextY))
		};
	};

	const applyPreviewTransform = (scale: number, nextX = previewOffsetX, nextY = previewOffsetY) => {
		previewScale = clampPreviewScale(scale);
		const nextOffset = clampPreviewOffset(nextX, nextY, previewScale);
		previewOffsetX = nextOffset.x;
		previewOffsetY = nextOffset.y;
		if (previewScale <= PREVIEW_MIN_SCALE) {
			previewIsDragging = false;
		}
	};

	const resetPreviewTransform = () => {
		previewScale = PREVIEW_MIN_SCALE;
		previewOffsetX = 0;
		previewOffsetY = 0;
		previewIsDragging = false;
		previewPointers = new Map();
		previewPinchStartDistance = 0;
		previewPinchStartScale = PREVIEW_MIN_SCALE;
		previewDragStartX = 0;
		previewDragStartY = 0;
		previewDragOriginX = 0;
		previewDragOriginY = 0;
	};

	const openAttachmentPreview = (attachment: ChatAttachment) => {
		if (attachment.kind !== 'image') return;
		resetPreviewTransform();
		previewAttachment = attachment;
	};

	const closeAttachmentPreview = () => {
		resetPreviewTransform();
		previewAttachment = null;
	};

	const getPointerDistance = (points: Array<{ x: number; y: number }>) =>
		points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;

	const handlePreviewPointerDown = (event: PointerEvent) => {
		if (!previewAttachment) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		previewPointers = new Map(previewPointers).set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});

		if (previewPointers.size === 1) {
			previewDragStartX = event.clientX;
			previewDragStartY = event.clientY;
			previewDragOriginX = previewOffsetX;
			previewDragOriginY = previewOffsetY;
			previewIsDragging = previewScale > PREVIEW_MIN_SCALE;
		}

		if (previewPointers.size === 2) {
			previewPinchStartDistance = getPointerDistance([...previewPointers.values()]);
			previewPinchStartScale = previewScale;
			previewIsDragging = false;
		}
	};

	const handlePreviewPointerMove = (event: PointerEvent) => {
		if (!previewPointers.has(event.pointerId)) return;
		previewPointers = new Map(previewPointers).set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});

		if (previewPointers.size >= 2) {
			const distance = getPointerDistance([...previewPointers.values()]);
			if (!previewPinchStartDistance) {
				previewPinchStartDistance = distance;
				previewPinchStartScale = previewScale;
				return;
			}

			const nextScale = clampPreviewScale(
				previewPinchStartScale * (distance / previewPinchStartDistance)
			);
			applyPreviewTransform(nextScale);
			return;
		}

		if (previewPointers.size === 1 && previewScale > PREVIEW_MIN_SCALE) {
			const nextX = previewDragOriginX + (event.clientX - previewDragStartX);
			const nextY = previewDragOriginY + (event.clientY - previewDragStartY);
			const nextOffset = clampPreviewOffset(nextX, nextY);
			previewOffsetX = nextOffset.x;
			previewOffsetY = nextOffset.y;
			previewIsDragging = true;
		}
	};

	const handlePreviewPointerEnd = (event: PointerEvent) => {
		if (previewPointers.has(event.pointerId)) {
			previewPointers = new Map(previewPointers);
			previewPointers.delete(event.pointerId);
		}

		if (previewPointers.size < 2) {
			previewPinchStartDistance = 0;
			previewPinchStartScale = previewScale;
		}

		if (previewPointers.size === 1) {
			const [point] = [...previewPointers.values()];
			previewDragStartX = point.x;
			previewDragStartY = point.y;
			previewDragOriginX = previewOffsetX;
			previewDragOriginY = previewOffsetY;
			previewIsDragging = previewScale > PREVIEW_MIN_SCALE;
			return;
		}

		if (!previewPointers.size && previewScale <= PREVIEW_MIN_SCALE) {
			previewIsDragging = false;
		}
	};

	const handlePreviewWheel = (event: WheelEvent) => {
		if (!previewAttachment) return;
		event.preventDefault();
		const nextScale = clampPreviewScale(previewScale - event.deltaY * 0.002);
		applyPreviewTransform(nextScale);
	};

	const togglePreviewZoom = () => {
		if (!previewAttachment) return;

		if (previewScale > PREVIEW_MIN_SCALE) {
			resetPreviewTransform();
			return;
		}

		applyPreviewTransform(2);
	};

	const attachmentLabel = (attachment: ChatAttachment) =>
		attachment.kind === 'image' ? 'Image attachment' : 'File attachment';

	const attachmentExcerpt = (attachment: ChatAttachment, maxLength = 84) => {
		if (attachment.kind !== 'text') {
			return 'Preview ready';
		}

		const compactContent = attachment.content.replace(/\s+/g, ' ').trim();
		return compactContent ? summarize(compactContent, maxLength) : 'Text attachment';
	};

	const uniqueCitations = (message: ChatMessage) => {
		const map = new Map<string, { title?: string; url?: string }>();
		for (const annotation of message.annotations || []) {
			if (annotation.url) {
				map.set(annotation.url, {
					title: annotation.title,
					url: annotation.url
				});
			}
		}
		return [...map.values()];
	};

	const summarize = (value = '', maxLength = 92) =>
		value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;

	const resizeComposer = (node: HTMLTextAreaElement) => {
		node.style.height = 'auto';
		if (!node.value.trim()) {
			node.style.height = `${COMPOSER_MIN_HEIGHT}px`;
			node.style.overflowY = 'hidden';
			return;
		}
		const nextHeight = Math.min(
			COMPOSER_MAX_HEIGHT,
			Math.max(COMPOSER_MIN_HEIGHT, node.scrollHeight)
		);
		node.style.height = `${nextHeight}px`;
		node.style.overflowY = node.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
	};

	const autosizeComposer = (node: HTMLTextAreaElement, _draft: string) => {
		const syncSize = () => {
			tick().then(() => resizeComposer(node));
		};

		syncSize();

		return {
			update(_nextDraft: string) {
				syncSize();
			}
		};
	};

	const scrollHistoryToEnd = async (behavior: ScrollBehavior = 'smooth') => {
		await tick();
		if (!historyViewport) return;

		historyViewport.scrollTo({
			top: historyViewport.scrollHeight,
			behavior
		});
	};

	afterUpdate(() => {
		const historySignature = history.map((message) => message.id).join(':');
		const historyChanged = historySignature !== previousHistorySignature;
		const becameActive = active && !previousActive;

		if (active && (historyChanged || becameActive)) {
			const behavior = historyChanged && previousHistorySignature ? 'smooth' : 'auto';
			void scrollHistoryToEnd(behavior);
		}

		previousHistorySignature = historySignature;
		previousActive = active;
	});
</script>

<svelte:window
	on:keydown={(event) => {
		if (event.key === 'Escape' && previewAttachment) {
			event.preventDefault();
			closeAttachmentPreview();
		}
	}}
/>

<section
	class:hidden={!active}
	class={`absolute inset-0 flex flex-col overflow-hidden ${
		isFramelessChrome
			? isMobileChrome
				? 'bg-app-bg'
				: 'bg-app-surface'
			: 'rounded-[1.25rem] border border-app-border bg-app-surface'
	}`}
>
	<header
		class={`flex items-center justify-end gap-3 border-b border-app-border ${
			isMobileChrome ? 'px-3 py-2' : 'px-4 py-3'
		}`}
	>
		<div class={`flex items-center overflow-x-auto ${isMobileChrome ? 'gap-1.5' : 'gap-2'}`}>
			<div
				class={`flex rounded-full border border-app-border bg-app-element text-xs ${
					isMobileChrome ? 'p-0.5' : 'p-1'
				}`}
			>
				<button
					type="button"
					class={`rounded-full font-semibold transition ${
						isMobileChrome ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5'
					} ${chatMode === 'auto' ? 'bg-app-primary text-white' : 'text-app-subtext'}`}
					on:click={() => onChatModeChange('auto')}
				>
					Auto
				</button>
				<button
					type="button"
					class={`rounded-full font-semibold transition ${
						isMobileChrome ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5'
					} ${chatMode === 'chat' ? 'bg-app-accent text-white' : 'text-app-subtext'}`}
					on:click={() => onChatModeChange('chat')}
				>
					Chat
				</button>
				<button
					type="button"
					class={`rounded-full font-semibold transition ${
						isMobileChrome ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5'
					} ${chatMode === 'edit' ? 'bg-app-primary text-white' : 'text-app-subtext'}`}
					on:click={() => onChatModeChange('edit')}
				>
					Edit
				</button>
			</div>

			<select
				class={`rounded-full border border-app-border bg-app-element text-app-text outline-none ${
					isMobileChrome ? 'px-2.5 py-1.5 text-[12px]' : 'px-3 py-2 text-sm'
				}`}
				value={modelPreset}
				on:change={(event) =>
					onModelPresetChange((event.currentTarget as HTMLSelectElement).value as ModelPreset)}
			>
				<option value="fast">{MODEL_PRESET_LABELS.fast}</option>
				<option value="smart">{MODEL_PRESET_LABELS.smart}</option>
			</select>

			{#if isSidebar && onCollapseSidebar}
				<button
					type="button"
					class={`rounded-full border border-app-border bg-app-element text-app-subtext transition hover:border-app-primary/35 hover:text-app-text ${
						isMobileChrome ? 'p-1.5' : 'p-2'
					}`}
					on:click={onCollapseSidebar}
					title="Collapse AI sidebar"
					aria-label="Collapse AI sidebar"
				>
					<X size={16} />
				</button>
			{/if}

			<button
				type="button"
				class={`rounded-full border border-app-border bg-app-element text-app-subtext transition hover:text-rose-300 ${
					isMobileChrome ? 'p-1.5' : 'p-2'
				}`}
				on:click={onClearHistory}
				title="Clear history"
			>
				<Trash2 size={16} />
			</button>
		</div>
	</header>

	<div
		bind:this={historyViewport}
		class={`min-h-0 flex-1 overflow-y-auto ${isMobileChrome ? 'px-3 py-3' : 'px-4 py-4'}`}
	>
		{#if !history.length}
			<div class="flex h-full flex-col items-center justify-center text-center text-app-subtext">
				<BrandMark size={isMobileChrome ? 52 : 60} className="mb-3" alt="" />
				<p
					class={`font-display tracking-[0.18em] text-app-text ${isMobileChrome ? 'text-xl' : 'text-2xl'}`}
				>
					KAINBU AI
				</p>
				<p
					class={`mt-2 uppercase ${isMobileChrome ? 'text-[10px] tracking-[0.24em]' : 'text-[11px] tracking-[0.32em]'}`}
				>
					Awaiting instructions
				</p>
			</div>
		{/if}

		<div class={`${isMobileChrome ? 'space-y-3' : 'space-y-4'}`}>
			{#each history as message (message.id)}
				<div class={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
					{#if message.toolActions?.length}
						<div class="mb-2 flex flex-wrap gap-1.5">
							{#each message.toolActions as action}
								<span
									class="rounded-full border border-app-border bg-app-element/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-app-primary"
								>
									{action}
								</span>
							{/each}
						</div>
					{/if}

					<div
						class={`max-w-[96%] border shadow-sm ${
							isMobileChrome ? 'rounded-[1rem] px-3 py-2.5' : 'rounded-[1.2rem] px-3.5 py-3'
						} ${
							message.role === 'user'
								? 'rounded-tr-md border-app-primary/25 bg-app-primary/10 text-app-text'
								: 'rounded-tl-md border-app-border bg-app-bg/70 text-app-text'
						}`}
					>
						{#if message.taskCards?.length}
							<div class="mb-3 flex gap-2 overflow-x-auto pb-1">
								{#each message.taskCards as taskCard (taskCard.id)}
									<div
										class="w-[14rem] shrink-0 rounded-[1rem] border border-app-border bg-app-surface/85 px-3 py-2.5"
									>
										<div class="flex items-center justify-between gap-2">
											<p
												class="truncate text-xs font-semibold uppercase tracking-[0.2em] text-app-subtext"
											>
												{taskCard.columnTitle}
											</p>
											{#if taskCard.checked}
												<span
													class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200"
												>
													Done
												</span>
											{/if}
										</div>
										<p class="mt-2 text-sm font-semibold text-app-text">{taskCard.title}</p>
										{#if taskCard.description}
											<p class="mt-1 text-xs leading-relaxed text-app-subtext">
												{summarize(taskCard.description)}
											</p>
										{/if}
										{#if taskCard.tags.length}
											<div class="mt-2 flex flex-wrap gap-1.5">
												{#each taskCard.tags.slice(0, 3) as tag (tag.id)}
													<span
														class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${getTagToneClasses(tag.color)}`}
													>
														{tag.label}
													</span>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if message.attachments?.length}
							<div class="mb-3 space-y-2">
								{#each message.attachments as attachment (attachment.id)}
									{#if attachment.kind === 'image'}
										<button
											type="button"
											class="flex w-full items-center gap-3 rounded-[1rem] border border-app-border bg-app-surface/85 px-3 py-2.5 text-left transition hover:border-app-primary/35 hover:bg-app-surface"
											on:click={() => openAttachmentPreview(attachment)}
											aria-label={`Open image preview for ${attachment.name}`}
										>
											<img
												src={attachment.content}
												alt={attachment.name}
												class="h-14 w-14 shrink-0 rounded-2xl border border-app-border object-cover"
											/>
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-semibold text-app-text">
													{attachment.name}
												</p>
												<p
													class="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext"
												>
													{attachmentLabel(attachment)}
												</p>
											</div>
											<span
												class="rounded-full border border-app-primary/20 bg-app-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-primary"
											>
												Preview
											</span>
										</button>
									{:else}
										<div
											class="flex items-center gap-3 rounded-[1rem] border border-app-border bg-app-surface/85 px-3 py-2.5"
										>
											<div
												class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-element text-app-subtext"
											>
												<Paperclip size={16} />
											</div>
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-semibold text-app-text">
													{attachment.name}
												</p>
												<p
													class="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext"
												>
													{attachmentLabel(attachment)}
												</p>
											</div>
										</div>
									{/if}
								{/each}
							</div>
						{/if}

						{#if message.role === 'assistant'}
							<RichText
								value={message.text}
								className={isMobileChrome ? 'kainbu-prose text-[13px]' : 'kainbu-prose'}
							/>
						{:else}
							<p
								class={`whitespace-pre-wrap leading-relaxed ${isMobileChrome ? 'text-[13px]' : 'text-sm'}`}
							>
								{message.text}
							</p>
						{/if}

						{#if message.metadata}
							<div
								class={`mt-3 flex flex-wrap items-center gap-2 text-app-subtext ${
									isMobileChrome ? 'text-[10px]' : 'text-[11px]'
								}`}
							>
								<span class="inline-flex items-center gap-1">
									<Info size={12} />
									{message.metadata.model}
								</span>
								<span>·</span>
								<span>{(message.metadata.latencyMs / 1000).toFixed(2)}s</span>
								{#if message.metadata.mode}
									<span>·</span>
									<span class="uppercase">{message.metadata.mode}</span>
								{/if}
							</div>
						{/if}

						{#if uniqueCitations(message).length}
							<div class="mt-3 flex flex-wrap gap-2">
								{#each uniqueCitations(message) as citation}
									<a
										href={citation.url}
										target="_blank"
										rel="noreferrer"
										class="rounded-full border border-app-accent/25 bg-app-accent/10 px-3 py-1 text-[11px] font-semibold text-app-accent transition hover:bg-app-accent/20"
									>
										{citation.title || citation.url}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}

			{#if isProcessing}
				<div
					class={`flex items-center gap-3 rounded-full border border-app-border bg-app-bg/80 text-app-subtext ${
						isMobileChrome ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-sm'
					}`}
				>
					<LoaderCircle size={16} class="animate-spin text-app-primary" />
					Streaming harmony
				</div>
			{/if}

			{#if pendingProposal && pendingProposal.proposal.kind !== 'none'}
				<div class="rounded-[1.25rem] border border-app-primary/25 bg-app-primary/10 p-4">
					<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-app-subtext">
						Sync proposal
					</p>
					<h3 class="mt-2 text-lg font-semibold text-app-text">
						{pendingProposal.proposal.summary || 'Review AI changes'}
					</h3>
					<p class="mt-2 text-sm text-app-subtext">
						{#if pendingProposal.stale}
							This proposal is now stale because the local workspace changed after it was generated.
						{:else if pendingProposal.proposal.kind === 'kanban'}
							Board changes are ready to review and commit.
						{:else}
							Scratchpad changes are ready to review and commit.
						{/if}
					</p>
					<div class="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.22em]">
						<span
							class="rounded-full border border-app-border bg-app-element/70 px-3 py-1 text-app-subtext"
						>
							{pendingProposal.target}
						</span>
						{#if proposalPreviewActive}
							<span
								class="rounded-full border border-app-accent/25 bg-app-accent/10 px-3 py-1 text-app-accent"
							>
								Preview Open
							</span>
						{/if}
						{#if pendingProposal.stale}
							<span
								class="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200"
							>
								Needs Regeneration
							</span>
						{/if}
					</div>
					<div class="mt-4 flex flex-wrap gap-3">
						{#if onReviewProposal}
							<button
								type="button"
								class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-app-border bg-app-element px-4 py-2.5 text-sm font-semibold text-app-text"
								on:click={onReviewProposal}
							>
								<Info size={16} />
								Review
							</button>
						{/if}
						<button
							type="button"
							disabled={pendingProposal.stale}
							class={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${
								pendingProposal.stale ? 'cursor-not-allowed bg-app-primary/45' : 'bg-app-primary'
							}`}
							on:click={onAcceptProposal}
						>
							<Check size={16} />
							Commit
						</button>
						<button
							type="button"
							class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-app-border bg-app-element px-4 py-2.5 text-sm font-semibold text-app-text"
							on:click={onRejectProposal}
						>
							<XCircle size={16} />
							Discard
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div
		class={`border-t border-app-border ${
			isMobileChrome ? 'bg-app-surface/96 px-0 py-0' : 'px-4 py-3'
		}`}
	>
		<form
			class={isMobileChrome
				? 'space-y-2'
				: 'relative rounded-[1.2rem] border border-app-border bg-app-bg px-3 pb-3 pt-3'}
			on:submit|preventDefault={submitComposer}
		>
			{#if queuedTaskCards.length}
				<div
					class={`${isMobileChrome ? 'flex gap-2 overflow-x-auto px-3 pt-2 pb-1' : 'mb-3 flex gap-2 overflow-x-auto pb-1'}`}
				>
					{#each queuedTaskCards as taskCard (taskCard.id)}
						<div
							class={`relative shrink-0 rounded-[1rem] border border-app-border bg-app-surface/90 ${
								isMobileChrome ? 'w-[12.5rem] px-2.5 py-2' : 'w-[13.5rem] px-3 py-2.5'
							}`}
						>
							<div class="flex items-center justify-between gap-2">
								<p
									class="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext"
								>
									{taskCard.columnTitle}
								</p>
								<button
									type="button"
									class="rounded-full bg-app-element p-1 text-app-subtext transition hover:text-rose-300"
									on:click={() => onRemoveTaskCard(taskCard.id)}
								>
									<X size={11} />
								</button>
							</div>
							<p class="mt-2 text-sm font-semibold text-app-text">{taskCard.title}</p>
							{#if taskCard.description}
								<p class="mt-1 text-xs leading-relaxed text-app-subtext">
									{summarize(taskCard.description, 84)}
								</p>
							{/if}
							{#if taskCard.tags.length}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each taskCard.tags.slice(0, 3) as tag (tag.id)}
										<span
											class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${getTagToneClasses(tag.color)}`}
										>
											{tag.label}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if queuedAttachments.length}
				<div class={`${isMobileChrome ? 'space-y-2 px-3 pb-1' : 'mb-3 space-y-2'}`}>
					{#each queuedAttachments as attachment (attachment.id)}
						<div
							class="relative flex items-center gap-3 rounded-[1rem] border border-app-border bg-app-surface/90 px-3 py-2.5 pr-10"
						>
							{#if attachment.kind === 'image'}
								<button
									type="button"
									class="flex min-w-0 flex-1 items-center gap-3 text-left"
									on:click={() => openAttachmentPreview(attachment)}
									aria-label={`Open image preview for ${attachment.name}`}
								>
									<img
										src={attachment.content}
										alt={attachment.name}
										class="h-14 w-14 shrink-0 rounded-2xl border border-app-border object-cover"
									/>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-app-text">{attachment.name}</p>
										<p
											class="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-subtext"
										>
											{attachmentLabel(attachment)}
										</p>
										<p class="mt-1 text-xs leading-relaxed text-app-subtext">
											{attachmentExcerpt(attachment, isMobileChrome ? 56 : 92)}
										</p>
									</div>
								</button>
							{:else}
								<div
									class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-element text-app-subtext"
								>
									<Paperclip size={16} />
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-app-text">{attachment.name}</p>
									<p
										class="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-subtext"
									>
										{attachmentLabel(attachment)}
									</p>
									<p class="mt-1 text-xs leading-relaxed text-app-subtext">
										{attachmentExcerpt(attachment, isMobileChrome ? 56 : 92)}
									</p>
								</div>
							{/if}
							<button
								type="button"
								class="absolute right-2 top-2 z-10 rounded-full bg-rose-500 p-1 text-white shadow-lg"
								on:click={() => onRemoveAttachment(attachment.id)}
							>
								<X size={12} />
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<div class={`flex items-end gap-2 ${isMobileChrome ? 'px-3 py-2' : ''}`}>
				<textarea
					use:autosizeComposer={draft}
					rows={1}
					class={`min-h-0 flex-1 resize-none bg-transparent text-app-text outline-none transition-[height] duration-200 ease-out placeholder:text-app-subtext/50 ${
						isMobileChrome
							? 'px-0 py-1.5 text-[13px] leading-[1.45]'
							: 'px-2.5 py-2 text-sm leading-[1.55]'
					}`}
					placeholder={isProcessing
						? 'Keep typing while the current reply finishes…'
						: chatMode === 'chat'
							? 'Ask a question…'
							: 'Channel your intent…'}
					enterkeyhint="send"
					bind:value={draft}
					on:input={() => onDraftChange(draft)}
					on:change={() => onDraftChange(draft)}
					on:keydown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault();
							submitComposer();
						}
					}}
				></textarea>

				<div class={`flex shrink-0 items-center gap-1.5 ${isMobileChrome ? 'pb-0.5' : 'pb-1'}`}>
					<label
						class="relative rounded-full p-2 text-app-subtext transition hover:bg-app-element hover:text-app-primary focus-within:bg-app-element focus-within:text-app-primary"
						title="Add attachment"
						aria-label="Add attachment"
					>
						<Paperclip size={18} />
						<input
							bind:this={fileInput}
							type="file"
							multiple
							aria-label="Add attachment"
							class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							accept="image/*,text/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html"
							on:change={(event) => handleFiles((event.currentTarget as HTMLInputElement).files)}
						/>
					</label>

					<button
						type="submit"
						aria-disabled={!canSendMessage()}
						class={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-app-primary text-white transition ${
							canSendMessage()
								? 'hover:-translate-y-0.5 hover:bg-app-primary-hover'
								: 'cursor-not-allowed opacity-50'
						}`}
						title="Send message"
					>
						{#if isProcessing}
							<LoaderCircle size={16} class="animate-spin" />
						{:else}
							<Send size={16} />
						{/if}
					</button>
				</div>
			</div>
		</form>
	</div>
</section>

{#if previewAttachment}
	<div class="fixed inset-0 z-[90] flex bg-black/82 backdrop-blur-xl">
		<button
			type="button"
			class="absolute inset-0"
			aria-label="Close image preview"
			on:click={closeAttachmentPreview}
		></button>

		<div
			role="dialog"
			aria-modal="true"
			aria-label="Image preview"
			class={`relative z-10 flex h-full w-full flex-col ${
				isMobileChrome
					? 'px-3 pt-[max(0.9rem,var(--safe-top))] pb-[max(1rem,var(--safe-bottom))]'
					: 'p-5'
			}`}
		>
			<div
				class="mb-3 flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-app-surface/92 px-4 py-3 shadow-kainbu-xl backdrop-blur-xl"
			>
				<div class="min-w-0">
					<p class="text-[10px] font-bold uppercase tracking-[0.28em] text-app-subtext">
						Image Preview
					</p>
					<p class="mt-1 truncate text-sm font-semibold text-app-text">
						{previewAttachment.name}
					</p>
					<p class="mt-1 text-[11px] uppercase tracking-[0.18em] text-app-subtext">
						Pinch or scroll to zoom
					</p>
				</div>
				<button
					type="button"
					class="rounded-full border border-app-border bg-app-element p-2 text-app-subtext transition hover:border-app-primary/35 hover:text-app-text"
					on:click={closeAttachmentPreview}
					aria-label="Close image preview"
				>
					<X size={18} />
				</button>
			</div>

			<div
				bind:this={previewViewport}
				role="button"
				tabindex="0"
				aria-label={`Zoom image preview for ${previewAttachment.name}`}
				class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[1.6rem] border border-white/10 bg-app-bg/85 p-3 shadow-kainbu-xl"
				style="touch-action: none;"
				on:pointerdown={handlePreviewPointerDown}
				on:pointermove={handlePreviewPointerMove}
				on:pointerup={handlePreviewPointerEnd}
				on:pointercancel={handlePreviewPointerEnd}
				on:pointerleave={handlePreviewPointerEnd}
				on:wheel={handlePreviewWheel}
				on:dblclick={togglePreviewZoom}
				on:keydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						togglePreviewZoom();
					}
				}}
			>
				<img
					src={previewAttachment.content}
					alt={previewAttachment.name}
					draggable="false"
					class={`max-h-full max-w-full rounded-[1.15rem] object-contain shadow-[0_24px_60px_-28px_rgba(0,0,0,0.78)] transition-transform duration-150 ease-out ${
						previewScale > PREVIEW_MIN_SCALE
							? previewIsDragging
								? 'cursor-grabbing'
								: 'cursor-grab'
							: 'cursor-zoom-in'
					}`}
					style={`transform: translate3d(${previewOffsetX}px, ${previewOffsetY}px, 0) scale(${previewScale}); transform-origin: center center;`}
				/>
			</div>
		</div>
	</div>
{/if}
