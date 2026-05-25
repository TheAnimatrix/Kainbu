<script lang="ts">
	import { onMount } from 'svelte';
	import AdminStatRow from '$lib/components/admin/AdminStatRow.svelte';
	import {
		compareNumbers,
		compareStrings,
		parsePbDateMs,
		sortDirSymbol,
		toggleSort,
		type SortDir
	} from '$lib/components/admin/tableSort';
	import {
		fetchAdminUsageByUser,
		fetchAdminUsageSummary,
		type AdminUsageByUserRow,
		type AdminUsageSummary
	} from '$lib/kainbu/adminApi';

	type UsageSortKey = 'user' | 'requests' | 'tokens' | 'cost' | 'lastActivity';

	let loading = true;
	let error = '';
	let summary: AdminUsageSummary | null = null;
	let users: AdminUsageByUserRow[] = [];
	let sortKey: UsageSortKey = 'requests';
	let sortDir: SortDir = 'desc';

	const formatTokens = (value: number) => value.toLocaleString();

	const setSort = (key: UsageSortKey) => {
		const next = toggleSort(key, sortKey, sortDir);
		sortKey = next.key;
		sortDir = next.dir;
	};

	const userLabel = (row: AdminUsageByUserRow) => row.email || row.username || row.userId;

	const compareUsageRows = (left: AdminUsageByUserRow, right: AdminUsageByUserRow) => {
		let cmp = 0;
		switch (sortKey) {
			case 'user':
				cmp = compareStrings(userLabel(left), userLabel(right));
				break;
			case 'requests':
				cmp = compareNumbers(left.requestCount, right.requestCount);
				break;
			case 'tokens':
				cmp = compareNumbers(
					left.promptTokens + left.completionTokens,
					right.promptTokens + right.completionTokens
				);
				break;
			case 'cost':
				cmp = compareNumbers(left.costUsd, right.costUsd);
				break;
			case 'lastActivity':
				cmp = compareNumbers(parsePbDateMs(left.lastActivity), parsePbDateMs(right.lastActivity));
				break;
		}
		return sortDir === 'asc' ? cmp : -cmp;
	};

	$: sortedUsers = [...users].sort(compareUsageRows);

	const headerClass = (key: UsageSortKey) =>
		`inline-flex items-center gap-1 font-medium uppercase tracking-wide transition-colors hover:text-app-text ${
			sortKey === key ? 'text-app-text' : ''
		}`;

	onMount(async () => {
		try {
			const [usageSummary, byUser] = await Promise.all([
				fetchAdminUsageSummary(30),
				fetchAdminUsageByUser(30)
			]);
			summary = usageSummary;
			users = byUser.users;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load usage';
		} finally {
			loading = false;
		}
	});
</script>

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-5xl flex-col gap-4">
		<div class="px-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
			<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">AI usage</h1>
			<p class="mt-1 text-sm text-app-subtext">Last 30 days</p>
		</div>

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading…</p>
		{:else if error}
			<p class="px-1 text-sm text-red-400">{error}</p>
		{:else if summary}
			<div class="flex flex-wrap gap-2">
				<AdminStatRow label="Requests" value={summary.requestCount} />
				<AdminStatRow label="Prompt tokens" value={formatTokens(summary.promptTokens)} />
				<AdminStatRow label="Completion tokens" value={formatTokens(summary.completionTokens)} />
				<AdminStatRow
					label="Est. cost"
					value={summary.costUsd != null ? `$${summary.costUsd.toFixed(4)}` : '—'}
				/>
			</div>

			<div class="overflow-x-auto border border-app-border/40">
				<table class="w-full min-w-[36rem] text-left text-sm">
					<thead class="border-b border-app-border/40 bg-app-surface/60 text-xs uppercase tracking-wide text-app-subtext">
						<tr>
							<th class="px-3 py-2">
								<button type="button" class={headerClass('user')} on:click={() => setSort('user')}>
									User
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'user', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button
									type="button"
									class={headerClass('requests')}
									on:click={() => setSort('requests')}
								>
									Requests
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'requests', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button type="button" class={headerClass('tokens')} on:click={() => setSort('tokens')}>
									Tokens
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'tokens', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button type="button" class={headerClass('cost')} on:click={() => setSort('cost')}>
									Cost
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'cost', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button
									type="button"
									class={headerClass('lastActivity')}
									on:click={() => setSort('lastActivity')}
								>
									Last activity
									<span class="text-app-primary">
										{sortDirSymbol(sortKey === 'lastActivity', sortDir)}
									</span>
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						{#if users.length === 0}
							<tr>
								<td colspan="5" class="px-3 py-4 text-app-subtext">No usage recorded yet.</td>
							</tr>
						{:else}
							{#each sortedUsers as row (row.userId)}
								<tr class="border-t border-app-border/30">
									<td class="px-3 py-2">
										<div class="font-medium text-app-text">{row.email || row.userId}</div>
										{#if row.username}
											<div class="text-xs text-app-subtext">@{row.username}</div>
										{/if}
									</td>
									<td class="px-3 py-2 tabular-nums">{row.requestCount}</td>
									<td class="px-3 py-2 tabular-nums text-app-subtext">
										{formatTokens(row.promptTokens + row.completionTokens)}
									</td>
									<td class="px-3 py-2 tabular-nums">
										{row.costEventsWithValue > 0 ? `$${row.costUsd.toFixed(4)}` : '—'}
									</td>
									<td class="px-3 py-2 text-xs text-app-subtext">
										{row.lastActivity ? new Date(row.lastActivity).toLocaleString() : '—'}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>
