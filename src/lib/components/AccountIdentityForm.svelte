<script lang="ts">
	import { AtSign, LoaderCircle, LogOut, Pencil } from '$lib/icons';
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
	export let embedded = false;

	let editing = false;

	const labelClass = embedded
		? 'kainbu-settings-field-label'
		: 'text-[10px] font-semibold uppercase tracking-[0.18em] text-app-subtext/60';
	const headingClass = embedded
		? 'kainbu-settings-field-label kainbu-settings-field-label--heading'
		: 'text-[10px] font-semibold uppercase tracking-[0.2em] text-app-primary';
	const inputClass = embedded
		? 'kainbu-settings-input w-full px-9 py-2 text-sm'
		: 'w-full rounded-lg border border-app-border/60 bg-app-bg px-9 py-2 text-sm text-app-text outline-none transition focus:border-app-primary/40';
	const submitBtnClass = embedded
		? 'kainbu-btn kainbu-btn--primary px-4 py-2 text-sm'
		: 'kainbu-btn kainbu-btn--primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40';
	const cancelBtnClass = embedded
		? 'kainbu-btn kainbu-btn--ghost px-3 py-2 text-sm'
		: 'kainbu-btn kainbu-btn--ghost px-3 py-2 text-sm';
	const changeBtnClass = embedded
		? 'kainbu-btn kainbu-btn--ghost kainbu-btn--compact'
		: 'kainbu-btn kainbu-btn--ghost kainbu-btn--compact text-[11px] text-app-subtext/50';

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
	{#if !embedded}
		<div>
			<p class={headingClass}>{heading}</p>
			{#if description}
				<p class="mt-1 text-sm text-app-subtext">{description}</p>
			{/if}
		</div>
	{/if}

	{#if hasUsername && !editing}
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class={labelClass}>Username</p>
				<p class="mt-0.5 text-sm font-medium text-app-text">@{currentUsername}</p>
			</div>
			<button
				type="button"
				class="{changeBtnClass} inline-flex items-center gap-1"
				on:click={() => (editing = true)}
			>
				<Pencil size={11} />
				Change
			</button>
		</div>
	{:else}
		<div class="flex gap-2">
			<label class="min-w-0 flex-1">
				<span class="{labelClass} mb-1 block">Username</span>
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
						class={inputClass}
						on:input={(event) => onDraftChange((event.currentTarget as HTMLInputElement).value)}
					/>
				</div>
			</label>

			<div class="flex items-end gap-1.5">
				<button type="submit" disabled={!canSubmit} class="{submitBtnClass} disabled:cursor-not-allowed disabled:opacity-40">
					{#if saving}
						<LoaderCircle size={15} class="animate-spin" />
					{:else}
						<span>{submitLabel}</span>
					{/if}
				</button>
				{#if hasUsername}
					<button
						type="button"
						class={cancelBtnClass}
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
			<p class={labelClass}>Email</p>
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
