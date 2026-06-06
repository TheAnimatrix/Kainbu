<script lang="ts">
	import { Check, Copy, Globe, Link2, Lock, X } from 'lucide-svelte';
	import { buildBoardShareUrl } from '$lib/kainbu/shareSlug';

	export let open = false;
	export let boardName = '';
	export let shareSlug: string | null = null;
	export let sharePublic = false;
	export let isOwner = false;
	export let saving = false;
	export let errorMessage = '';
	export let onClose: () => void;
	export let onSave: (sharePublic: boolean) => void | Promise<void>;
	export let onEnsureSlug: () => void | Promise<void>;

	let copied = false;
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;
	let draftPublic = sharePublic;
	let wasOpen = false;
	let ensuringSlug = false;
	let slugEnsureAttempted = false;

	$: shareUrl = shareSlug ? buildBoardShareUrl(shareSlug) : '';

	$: {
		if (open && !wasOpen) {
			draftPublic = sharePublic;
			slugEnsureAttempted = false;
		}
		if (!open && wasOpen) {
			slugEnsureAttempted = false;
		}
		wasOpen = open;
	}

	$: if (open && isOwner && !shareSlug && !slugEnsureAttempted && !ensuringSlug) {
		slugEnsureAttempted = true;
		ensuringSlug = true;
		void Promise.resolve(onEnsureSlug()).finally(() => {
			ensuringSlug = false;
		});
	}

	const close = () => {
		onClose();
	};

	const copyLink = async () => {
		if (!shareUrl || typeof navigator === 'undefined') return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
				copyTimeout = null;
			}, 1800);
		} catch (error) {
			console.error(error);
		}
	};

	const saveVisibility = async () => {
		if (!isOwner || saving) return;
		await onSave(draftPublic);
	};
</script>

{#if open}
	<div class="fixed inset-0 z-[130] bg-black/45 backdrop-blur-sm">
		<button type="button" class="absolute inset-0" aria-label="Close share settings" onclick={close}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Share board"
			class="absolute inset-x-0 bottom-0 z-10 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-app-border/60 bg-app-surface lg:inset-auto lg:left-1/2 lg:top-1/2 lg:max-h-[min(85vh,28rem)] lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-app-border/40 px-4 py-3">
				<div>
					<p class="text-sm font-semibold text-app-text">Share board</p>
					<p class="text-xs text-app-subtext">{boardName}</p>
				</div>
				<button
					type="button"
					class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-app-subtext transition hover:bg-app-element hover:text-app-text"
					aria-label="Close"
					onclick={close}
				>
					<X size={16} />
				</button>
			</div>

			<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
				{#if isOwner}
					<div class="space-y-2">
						<p class="text-xs font-semibold text-app-text">Visibility</p>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								class={`rounded-xl border px-3 py-2 text-left transition ${
									!draftPublic
										? 'border-app-primary/40 bg-app-primary/10 text-app-text'
										: 'border-app-border bg-app-bg text-app-subtext hover:text-app-text'
								}`}
								disabled={saving}
								onclick={() => {
									draftPublic = false;
									void saveVisibility();
								}}
							>
								<span class="inline-flex items-center gap-1.5 text-xs font-semibold">
									<Lock size={13} />
									Private
								</span>
								<span class="mt-1 block text-[11px] leading-snug opacity-80">
									Only invited members can open this link.
								</span>
							</button>
							<button
								type="button"
								class={`rounded-xl border px-3 py-2 text-left transition ${
									draftPublic
										? 'border-app-primary/40 bg-app-primary/10 text-app-text'
										: 'border-app-border bg-app-bg text-app-subtext hover:text-app-text'
								}`}
								disabled={saving}
								onclick={() => {
									draftPublic = true;
									void saveVisibility();
								}}
							>
								<span class="inline-flex items-center gap-1.5 text-xs font-semibold">
									<Globe size={13} />
									Public
								</span>
								<span class="mt-1 block text-[11px] leading-snug opacity-80">
									Anyone with the link can view this board.
								</span>
							</button>
						</div>
					</div>
				{:else}
					<p class="text-xs text-app-subtext">
						{sharePublic
							? 'This board is public. Anyone with the link can view it.'
							: 'This board is private. Only project members can open the link.'}
					</p>
				{/if}

				<div class="space-y-2">
					<p class="text-xs font-semibold text-app-text">Link</p>
					<div class="flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2">
						<Link2 size={14} class="shrink-0 text-app-subtext" />
						<input
							class="min-w-0 flex-1 bg-transparent text-xs text-app-text outline-none"
							readonly
							value={shareUrl ||
								(isOwner
									? ensuringSlug
										? 'Generating link…'
										: errorMessage
											? 'Could not generate link'
											: 'Generating link…'
									: 'Ask the project owner to open share settings first.')}
						/>
						{#if isOwner && !shareUrl && !ensuringSlug && errorMessage}
							<button
								type="button"
								class="shrink-0 text-[11px] font-semibold text-app-primary transition hover:opacity-80"
								onclick={() => {
									slugEnsureAttempted = false;
								}}
							>
								Retry
							</button>
						{/if}
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-lg border border-app-border px-2 py-1 text-[11px] font-semibold text-app-subtext transition hover:text-app-text disabled:opacity-50"
							disabled={!shareUrl}
							onclick={copyLink}
						>
							{#if copied}
								<Check size={12} />
								Copied
							{:else}
								<Copy size={12} />
								Copy
							{/if}
						</button>
					</div>
				</div>

				{#if errorMessage}
					<p class="text-xs text-red-400">{errorMessage}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
