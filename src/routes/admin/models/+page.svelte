<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchAdminModelSettings,
		updateAdminModelSettings,
		type AdminModelCatalog
	} from '$lib/kainbu/adminApi';
	import {
		AI_MODEL_PROVIDERS,
		AI_MODEL_PROVIDER_LABELS,
		ALL_THINKING_LEVELS,
		newCatalogEntry,
		type AiModelCatalogEntry
	} from '$lib/kainbu/aiModelCatalog';
	import type { AiModelProvider, AiThinkingLevel } from '$lib/kainbu/types';
	import { thinkingLevelLabel } from '$lib/kainbu/models';

	let loading = true;
	let saving = false;
	let error = '';
	let success = '';
	let catalogSource: 'database' | 'defaults' = 'defaults';
	let catalog: AdminModelCatalog | null = null;

	const load = async () => {
		loading = true;
		error = '';
		try {
			const result = await fetchAdminModelSettings();
			catalog = structuredClone(result.catalog);
			catalogSource = result.source;
			if (!result.persisted) {
				error =
					'No saved model catalog in the database yet. Saving will create one after PocketBase migrations are applied.';
			}
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load models';
		} finally {
			loading = false;
		}
	};

	onMount(load);

	const addModel = () => {
		if (!catalog) return;
		catalog = {
			...catalog,
			models: [...catalog.models, newCatalogEntry(catalog)]
		};
	};

	const removeModel = (index: number) => {
		if (!catalog) return;
		const next = catalog.models.filter((_, entryIndex) => entryIndex !== index);
		const defaultModelId = next.some((entry) => entry.id === catalog?.defaultModelId)
			? catalog.defaultModelId
			: next.find((entry) => entry.enabled)?.id || next[0]?.id || '';
		catalog = { defaultModelId, models: next.map((entry, position) => ({ ...entry, position })) };
	};

	const moveModel = (index: number, direction: -1 | 1) => {
		if (!catalog) return;
		const target = index + direction;
		if (target < 0 || target >= catalog.models.length) return;
		const models = [...catalog.models];
		[models[index], models[target]] = [models[target], models[index]];
		catalog = {
			...catalog,
			models: models.map((entry, position) => ({ ...entry, position }))
		};
	};

	const toggleThinking = (entry: AiModelCatalogEntry, level: AiThinkingLevel) => {
		if (!catalog) return;
		const has = entry.thinkingLevels.includes(level);
		let levels = has
			? entry.thinkingLevels.filter((value) => value !== level)
			: [...entry.thinkingLevels, level];
		if (!levels.length) levels = ['none'];
		let defaultThinkingLevel = entry.defaultThinkingLevel;
		if (!levels.includes(defaultThinkingLevel)) {
			defaultThinkingLevel = levels[0] || 'none';
		}
		updateEntry(entry, { thinkingLevels: levels, defaultThinkingLevel });
	};

	const updateEntry = (entry: AiModelCatalogEntry, patch: Partial<AiModelCatalogEntry>) => {
		if (!catalog) return;
		catalog = {
			...catalog,
			models: catalog.models.map((model) =>
				model === entry ? { ...model, ...patch } : model
			)
		};
	};

	const save = async () => {
		if (!catalog) return;
		error = '';
		success = '';
		saving = true;
		try {
			const result = await updateAdminModelSettings(catalog);
			catalog = structuredClone(result.catalog);
			catalogSource = 'database';
			error = '';
			success = 'Models saved.';
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to save models';
		} finally {
			saving = false;
		}
	};
</script>

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-4xl flex-col gap-4">
		<div class="flex flex-wrap items-end justify-between gap-3 px-1">
			<div>
				<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
				<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">Models</h1>
				<p class="mt-1 text-sm text-app-subtext">
					Workspace model list and allowed thinking levels per model.
				</p>
			</div>
			<div class="flex gap-2">
				<button
					type="button"
					class="rounded-md border border-app-border/50 px-3 py-1.5 text-sm text-app-subtext transition hover:bg-app-element hover:text-app-text"
					on:click={addModel}
					disabled={loading || saving || !catalog}
				>
					Add model
				</button>
				<button
					type="button"
					class="rounded-md bg-app-primary px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
					on:click={save}
					disabled={loading || saving || !catalog}
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>

		{#if catalogSource === 'defaults' && !loading}
			<p class="px-1 text-sm text-amber-400">
				Showing built-in defaults — changes will not stick until PocketBase has the
				<code class="text-xs">ai_models_json</code> field (restart/rebuild pocketbase after deploy).
			</p>
		{/if}
		{#if error}
			<p class="px-1 text-sm text-red-400">{error}</p>
		{/if}
		{#if success}
			<p class="px-1 text-sm text-emerald-400">{success}</p>
		{/if}

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading…</p>
		{:else if catalog}
			<div class="overflow-hidden rounded-lg border border-app-border/40">
				<div class="divide-y divide-app-border/30">
					{#each catalog.models as entry, index (entry.position)}
						<div class="flex flex-col gap-3 px-3 py-3 sm:px-4">
							<div class="flex flex-wrap items-center gap-2">
								<label class="flex items-center gap-1.5 text-xs text-app-subtext">
									<input
										type="checkbox"
										checked={entry.enabled}
										on:change={(event) =>
											updateEntry(entry, {
												enabled: (event.currentTarget as HTMLInputElement).checked
											})}
									/>
									Enabled
								</label>
								<label class="flex items-center gap-1.5 text-xs text-app-subtext">
									<input
										type="radio"
										name="default-model"
										checked={catalog.defaultModelId === entry.id}
										disabled={!entry.id || !entry.enabled}
										on:change={() => {
											if (!catalog || !entry.id || !entry.enabled) return;
											catalog = { ...catalog, defaultModelId: entry.id };
										}}
									/>
									Default
								</label>
								<div class="ml-auto flex gap-1">
									<button
										type="button"
										class="rounded px-2 py-1 text-xs text-app-subtext hover:bg-app-element"
										disabled={index === 0}
										on:click={() => moveModel(index, -1)}
									>
										↑
									</button>
									<button
										type="button"
										class="rounded px-2 py-1 text-xs text-app-subtext hover:bg-app-element"
										disabled={index === catalog.models.length - 1}
										on:click={() => moveModel(index, 1)}
									>
										↓
									</button>
									<button
										type="button"
										class="rounded px-2 py-1 text-xs text-red-400 hover:bg-app-element"
										on:click={() => removeModel(index)}
									>
										Remove
									</button>
								</div>
							</div>

							<div class="grid gap-2 sm:grid-cols-3">
								<label class="flex flex-col gap-1 text-xs text-app-subtext">
									Display id
									<input
										class="rounded-md border border-app-border/40 bg-app-bg px-2 py-1.5 text-sm text-app-text"
										value={entry.id}
										on:input={(event) =>
											updateEntry(entry, {
												id: (event.currentTarget as HTMLInputElement).value
											})}
									/>
								</label>
								<label class="flex flex-col gap-1 text-xs text-app-subtext">
									Provider
									<select
										class="rounded-md border border-app-border/40 bg-app-bg px-2 py-1.5 text-sm text-app-text"
										value={entry.provider}
										on:change={(event) =>
											updateEntry(entry, {
												provider: (event.currentTarget as HTMLSelectElement).value as AiModelProvider
											})}
									>
										{#each AI_MODEL_PROVIDERS as provider}
											<option value={provider}>{AI_MODEL_PROVIDER_LABELS[provider]}</option>
										{/each}
									</select>
								</label>
								<label class="flex flex-col gap-1 text-xs text-app-subtext">
									Model id
									<input
										class="rounded-md border border-app-border/40 bg-app-bg px-2 py-1.5 text-sm text-app-text"
										value={entry.openrouterModel}
										placeholder={entry.provider === 'vercel'
											? 'anthropic/claude-sonnet-4.6'
											: 'google/gemini-3-flash-preview'}
										on:input={(event) =>
											updateEntry(entry, {
												openrouterModel: (event.currentTarget as HTMLInputElement).value
											})}
									/>
								</label>
							</div>

							<div>
								<p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-app-subtext">
									Thinking levels
								</p>
								<div class="flex flex-wrap gap-2">
									{#each ALL_THINKING_LEVELS as level}
										<label
											class="inline-flex items-center gap-1.5 rounded-md border border-app-border/40 px-2 py-1 text-xs {entry.thinkingLevels.includes(
												level
											)
												? 'bg-app-element text-app-text'
												: 'text-app-subtext'}"
										>
											<input
												type="checkbox"
												checked={entry.thinkingLevels.includes(level)}
												on:change={() => toggleThinking(entry, level)}
											/>
											{thinkingLevelLabel(level)}
										</label>
									{/each}
								</div>
							</div>

							{#if entry.thinkingLevels.length > 0}
								<label class="flex flex-col gap-1 text-xs text-app-subtext sm:max-w-xs">
									Default thinking
									<select
										class="rounded-md border border-app-border/40 bg-app-bg px-2 py-1.5 text-sm text-app-text"
										value={entry.defaultThinkingLevel}
										on:change={(event) =>
											updateEntry(entry, {
												defaultThinkingLevel: (event.currentTarget as HTMLSelectElement)
													.value as AiThinkingLevel
											})}
									>
										{#each entry.thinkingLevels as level}
											<option value={level}>{thinkingLevelLabel(level)}</option>
										{/each}
									</select>
								</label>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>
