<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchAdminAiSettings, updateAdminAiSettings } from '$lib/kainbu/adminApi';

	let loading = true;
	let saving = false;
	let error = '';
	let success = '';
	let configured = false;
	let source = 'none';
	let keyHint = '';
	let apiKeyDraft = '';

	onMount(async () => {
		try {
			const settings = await fetchAdminAiSettings();
			configured = settings.configured;
			source = settings.source;
			keyHint = settings.keyHint;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load AI settings';
		} finally {
			loading = false;
		}
	});

	const saveKey = async () => {
		error = '';
		success = '';
		const trimmed = apiKeyDraft.trim();
		if (!trimmed) {
			error = 'Enter an API key before saving.';
			return;
		}

		saving = true;
		try {
			const result = await updateAdminAiSettings(trimmed);
			configured = result.configured;
			keyHint = result.keyHint;
			source = 'database';
			apiKeyDraft = '';
			success = 'API key saved.';
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to save API key';
		} finally {
			saving = false;
		}
	};
</script>

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
		<div class="px-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
			<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">AI key</h1>
			<p class="mt-1 text-sm text-app-subtext">
				Stored server-side. Environment variable is used when no database key is set.
			</p>
		</div>

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading…</p>
		{:else}
			<div class="flex flex-col gap-3 border border-app-border/40 bg-app-surface/40 px-3 py-3">
				<p class="text-sm text-app-text">
					Status:
					<span class="font-medium">{configured ? 'Configured' : 'Not configured'}</span>
					<span class="text-app-subtext">({source})</span>
				</p>
				{#if keyHint}
					<p class="text-xs text-app-subtext">Current key hint: {keyHint}</p>
				{/if}

				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium uppercase tracking-wide text-app-subtext"
						>New OpenRouter API key</span
					>
					<input
						type="password"
						bind:value={apiKeyDraft}
						autocomplete="off"
						placeholder="sk-or-..."
						class="rounded-md border border-app-border/60 bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-primary/60"
					/>
				</label>

				<button
					type="button"
					class="self-start rounded-md bg-app-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-app-primary-hover disabled:opacity-50"
					disabled={saving}
					on:click={saveKey}
				>
					{saving ? 'Saving…' : 'Save key'}
				</button>

				{#if error}
					<p class="text-sm text-red-400">{error}</p>
				{/if}
				{#if success}
					<p class="text-sm text-emerald-400">{success}</p>
				{/if}
			</div>
		{/if}
	</div>
</section>
