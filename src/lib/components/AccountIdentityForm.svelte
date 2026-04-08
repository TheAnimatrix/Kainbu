<script lang="ts">
	import { AtSign, LoaderCircle, LogOut, Pencil } from 'lucide-svelte';
	import type { UsernameAvailabilityState } from '$lib/kainbu/types';

	export let heading = 'Account';
	export let description = '';
	export let email: string | null = null;
	export let currentUsername: string | null = null;
	export let usernameDraft = '';
	export let availability: UsernameAvailabilityState = 'idle';
	export let feedback = '';
	export let saving = false;
	export let submitLabel = 'Save username';
	export let showSignOut = false;
	export let onDraftChange: (value: string) => void;
	export let onSubmit: () => void | Promise<void>;
	export let onSignOut: (() => void | Promise<void>) | null = null;

	let editing = false;

	const getFeedbackClasses = (state: UsernameAvailabilityState) => {
		if (state === 'available') return 'text-emerald-400';
		if (state === 'taken' || state === 'invalid') return 'text-rose-400';
		if (state === 'checking') return 'text-app-primary';
		return 'text-app-subtext';
	};

	$: hasUsername = Boolean(currentUsername?.trim());
	$: normalizedDraft = usernameDraft.trim().toLowerCase();
	$: normalizedCurrent = (currentUsername || '').trim().toLowerCase();
	$: canSubmit =
		!saving && availability === 'available' && normalizedDraft.length > 0 && normalizedDraft !== normalizedCurrent;
</script>

<form class="space-y-3.5" on:submit|preventDefault={() => void onSubmit()}>
	<div>
		<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-primary">{heading}</p>
		{#if description}
			<p class="mt-1 text-sm text-app-subtext">{description}</p>
		{/if}
	</div>

	{#if hasUsername && !editing}
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext/60">Username</p>
				<p class="mt-0.5 text-sm font-medium text-app-text">@{currentUsername}</p>
			</div>
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-app-subtext/50 transition hover:text-app-text"
				on:click={() => (editing = true)}
			>
				<Pencil size={11} />
				Change
			</button>
		</div>
	{:else}
		<div class="flex gap-2">
			<label class="min-w-0 flex-1">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-app-subtext">
					Username
				</span>
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-app-subtext/60">
						<AtSign size={14} />
					</div>
					<input
						value={usernameDraft}
						type="text"
						autocomplete="username"
						spellcheck="false"
						placeholder="your_name"
						class="w-full rounded-lg border border-app-border/60 bg-app-bg px-9 py-2 text-sm text-app-text outline-none transition focus:border-app-primary/40"
						on:input={(event) => onDraftChange((event.currentTarget as HTMLInputElement).value)}
					/>
				</div>
			</label>

			<div class="flex items-end gap-1.5">
				<button
					type="submit"
					disabled={!canSubmit}
					class="rounded-lg bg-app-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
				>
					{#if saving}
						<LoaderCircle size={15} class="animate-spin" />
					{:else}
						<span>{submitLabel}</span>
					{/if}
				</button>
				{#if hasUsername}
					<button
						type="button"
						class="rounded-lg border border-app-border/40 px-3 py-2 text-sm text-app-subtext transition hover:text-app-text"
						on:click={() => {
							editing = false;
							onDraftChange(currentUsername || '');
						}}
					>
						Cancel
					</button>
				{/if}
			</div>
		</div>

		{#if feedback}
			<p class={`text-xs font-medium ${getFeedbackClasses(availability)}`}>
				{feedback}
			</p>
		{:else if !hasUsername}
			<p class="text-xs text-app-subtext">
				Use 3-32 lowercase letters, numbers, or underscores.
			</p>
		{/if}
	{/if}

	<div class="flex gap-3 text-xs">
		<div class="min-w-0 flex-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext/60">Email</p>
			<p class="mt-0.5 truncate font-medium text-app-text">{email || 'No email available'}</p>
		</div>
	</div>

	{#if showSignOut && onSignOut}
		<div class="flex justify-end pt-1">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 text-xs text-app-subtext/60 transition hover:text-rose-400"
				on:click={() => void onSignOut?.()}
			>
				<LogOut size={13} />
				Sign Out
			</button>
		</div>
	{/if}
</form>
