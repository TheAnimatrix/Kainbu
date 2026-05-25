<script lang="ts">
	import { onMount } from 'svelte';
	import AdminStatRow from '$lib/components/admin/AdminStatRow.svelte';
	import {
		compareNumbers,
		compareStrings,
		sortDirSymbol,
		toggleSort,
		type SortDir
	} from '$lib/components/admin/tableSort';
	import {
		fetchAdminAiSettings,
		fetchAdminUsageByModel,
		fetchAdminUsageSummary,
		fetchAdminUsers,
		type AdminUsageByModelRow,
		type AdminUsageSummary
	} from '$lib/kainbu/adminApi';

	type ModelSortKey = 'model' | 'requests' | 'cost' | 'tokens';

	let loading = true;
	let error = '';
	let usage: AdminUsageSummary | null = null;
	let byModel: AdminUsageByModelRow[] = [];
	let userCount = 0;
	let aiConfigured = false;
	let aiSource = 'none';
	let sortKey: ModelSortKey = 'cost';
	let sortDir: SortDir = 'desc';

	const formatTokens = (value: number) => value.toLocaleString();

	const setSort = (key: ModelSortKey) => {
		const next = toggleSort(key, sortKey, sortDir);
		sortKey = next.key;
		sortDir = next.dir;
	};

	const compareModels = (left: AdminUsageByModelRow, right: AdminUsageByModelRow) => {
		let cmp = 0;
		switch (sortKey) {
			case 'model':
				cmp = compareStrings(left.model, right.model);
				break;
			case 'requests':
				cmp = compareNumbers(left.requestCount, right.requestCount);
				break;
			case 'cost':
				cmp = compareNumbers(left.costUsd, right.costUsd);
				break;
			case 'tokens':
				cmp = compareNumbers(
					left.promptTokens + left.completionTokens,
					right.promptTokens + right.completionTokens
				);
				break;
		}
		return sortDir === 'asc' ? cmp : -cmp;
	};

	$: sortedByModel = [...byModel].sort(compareModels);

	const headerClass = (key: ModelSortKey) =>
		`inline-flex items-center gap-1 font-medium uppercase tracking-wide transition-colors hover:text-app-text ${
			sortKey === key ? 'text-app-text' : ''
		}`;

	onMount(async () => {
		try {
			const [usageSummary, modelUsage, users, ai] = await Promise.all([
				fetchAdminUsageSummary(30),
				fetchAdminUsageByModel(30),
				fetchAdminUsers(1),
				fetchAdminAiSettings()
			]);
			usage = usageSummary;
			byModel = modelUsage.models;
			userCount = users.totalItems;
			aiConfigured = ai.configured;
			aiSource = ai.source;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load overview';
		} finally {
			loading = false;
		}
	});
</script>

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-5xl flex-col gap-4">
		<div class="px-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
			<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">Overview</h1>
		</div>

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading…</p>
		{:else if error}
			<p class="px-1 text-sm text-red-400">{error}</p>
		{:else}
			<div class="flex flex-wrap gap-2">
				<AdminStatRow label="Users" value={userCount} />
				<AdminStatRow label="AI requests (30d)" value={usage?.requestCount ?? 0} />
				<AdminStatRow
					label="Prompt tokens (30d)"
					value={formatTokens(usage?.promptTokens ?? 0)}
				/>
				<AdminStatRow
					label="Completion tokens (30d)"
					value={formatTokens(usage?.completionTokens ?? 0)}
				/>
				<AdminStatRow
					label="Est. cost (30d)"
					value={usage?.costUsd != null ? `$${usage.costUsd.toFixed(4)}` : '—'}
					hint={usage?.costUsd != null
						? `${usage.costEventsWithValue} events with cost`
						: 'Cost not reported by provider'}
				/>
				<AdminStatRow
					label="OpenRouter key"
					value={aiConfigured ? 'Configured' : 'Missing'}
					hint={aiSource}
				/>
			</div>

			<div class="overflow-hidden rounded-lg border border-app-border/40">
				<div class="border-b border-app-border/30 px-3 py-2 sm:px-4">
					<h2 class="text-sm font-semibold text-app-text">Cost by model (30d)</h2>
				</div>
				{#if sortedByModel.length === 0}
					<p class="px-3 py-4 text-sm text-app-subtext sm:px-4">No usage recorded yet.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full min-w-[32rem] text-left text-sm">
							<thead class="border-b border-app-border/30 text-xs text-app-subtext">
								<tr>
									<th class="px-3 py-2 font-normal sm:px-4">
										<button type="button" class={headerClass('model')} on:click={() => setSort('model')}>
											Model
											<span class="text-app-primary">{sortDirSymbol(sortKey === 'model', sortDir)}</span>
										</button>
									</th>
									<th class="px-3 py-2 font-normal sm:px-4">
										<button
											type="button"
											class={headerClass('requests')}
											on:click={() => setSort('requests')}
										>
											Requests
											<span class="text-app-primary">{sortDirSymbol(sortKey === 'requests', sortDir)}</span>
										</button>
									</th>
									<th class="px-3 py-2 font-normal sm:px-4">
										<button type="button" class={headerClass('tokens')} on:click={() => setSort('tokens')}>
											Tokens
											<span class="text-app-primary">{sortDirSymbol(sortKey === 'tokens', sortDir)}</span>
										</button>
									</th>
									<th class="px-3 py-2 font-normal sm:px-4">
										<button type="button" class={headerClass('cost')} on:click={() => setSort('cost')}>
											Cost
											<span class="text-app-primary">{sortDirSymbol(sortKey === 'cost', sortDir)}</span>
										</button>
									</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-app-border/20">
								{#each sortedByModel as row}
									<tr class="text-app-text">
										<td class="px-3 py-2 sm:px-4">{row.model}</td>
										<td class="px-3 py-2 tabular-nums text-app-subtext sm:px-4">
											{row.requestCount}
										</td>
										<td class="px-3 py-2 tabular-nums text-app-subtext sm:px-4">
											{formatTokens(row.promptTokens + row.completionTokens)}
										</td>
										<td class="px-3 py-2 tabular-nums sm:px-4">
											{row.costEventsWithValue > 0 ? `$${row.costUsd.toFixed(4)}` : '—'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</section>
