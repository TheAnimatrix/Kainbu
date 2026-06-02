<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchAdminAiSettings,
		updateAdminAiSettings,
		type AdminAiKeyStatus
	} from '$lib/kainbu/adminApi';

	type ProviderKey = 'openrouter' | 'vercel';

	type ProviderMeta = {
		key: ProviderKey;
		label: string;
		blurb: string;
		placeholder: string;
	};

	const PROVIDERS: ProviderMeta[] = [
		{
			key: 'openrouter',
			label: 'OpenRouter',
			blurb: 'Used for models whose provider is set to OpenRouter, and for utility calls (title generation).',
			placeholder: 'sk-or-...'
		},
		{
			key: 'vercel',
			label: 'Vercel AI Gateway',
			blurb: 'Used for models whose provider is set to Vercel AI Gateway in the Models tab.',
			placeholder: 'vck_...'
		}
	];

	const emptyStatus: AdminAiKeyStatus = { configured: false, source: 'none', keyHint: '' };

	let loading = true;
	let saving = false;
	let error = '';
	let success = '';
	let status: Record<ProviderKey, AdminAiKeyStatus> = {
		openrouter: { ...emptyStatus },
		vercel: { ...emptyStatus }
	};
	let drafts: Record<ProviderKey, string> = { openrouter: '', vercel: '' };

	const applySettings = (providers: {
		openrouter: AdminAiKeyStatus;
		vercel: AdminAiKeyStatus;
	}) => {
		status = {
			openrouter: providers.openrouter,
			vercel: providers.vercel
		};
	};

	onMount(async () => {
		try {
			const settings = await fetchAdminAiSettings();
			applySettings(settings.providers);
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load AI settings';
		} finally {
			loading = false;
		}
	});

	const save = async () => {
		error = '';
		success = '';
		const openrouterApiKey = drafts.openrouter.trim();
		const aiGatewayApiKey = drafts.vercel.trim();
		if (!openrouterApiKey && !aiGatewayApiKey) {
			error = 'Enter at least one API key before saving.';
			return;
		}

		saving = true;
		try {
			const result = await updateAdminAiSettings({
				...(openrouterApiKey ? { openrouterApiKey } : {}),
				...(aiGatewayApiKey ? { aiGatewayApiKey } : {})
			});
			applySettings(result.providers);
			drafts = { openrouter: '', vercel: '' };
			success = 'API keys saved.';
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to save API keys';
		} finally {
			saving = false;
		}
	};
</script>

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
		<div class="px-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
			<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">AI keys</h1>
			<p class="mt-1 text-sm text-app-subtext">
				Stored server-side per provider. The matching environment variable is used when no database
				key is set. Each model selects its provider in the Models tab.
			</p>
		</div>

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading…</p>
		{:else}
			<div class="flex flex-col gap-3">
				{#each PROVIDERS as provider (provider.key)}
					<div class="flex flex-col gap-3 border border-app-border/40 bg-app-surface/40 px-3 py-3">
						<div>
							<p class="text-sm font-medium text-app-text">{provider.label}</p>
							<p class="mt-0.5 text-xs text-app-subtext">{provider.blurb}</p>
						</div>
						<p class="text-sm text-app-text">
							Status:
							<span class="font-medium"
								>{status[provider.key].configured ? 'Configured' : 'Not configured'}</span
							>
							<span class="text-app-subtext">({status[provider.key].source})</span>
						</p>
						{#if status[provider.key].keyHint}
							<p class="text-xs text-app-subtext">Current key hint: {status[provider.key].keyHint}</p>
						{/if}

						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium uppercase tracking-wide text-app-subtext">
								New {provider.label} API key
							</span>
							<input
								type="password"
								bind:value={drafts[provider.key]}
								autocomplete="off"
								placeholder={provider.placeholder}
								class="rounded-md border border-app-border/60 bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-primary/60"
							/>
						</label>
					</div>
				{/each}

				<div class="flex flex-wrap items-center gap-3 px-1">
					<button
						type="button"
						class="rounded-md bg-app-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-app-primary-hover disabled:opacity-50"
						disabled={saving}
						on:click={save}
					>
						{saving ? 'Saving…' : 'Save keys'}
					</button>
					{#if error}
						<p class="text-sm text-red-400">{error}</p>
					{/if}
					{#if success}
						<p class="text-sm text-emerald-400">{success}</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>
