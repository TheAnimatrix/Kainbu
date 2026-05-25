<script lang="ts">
	import { onMount } from 'svelte';
	import AdminStatRow from '$lib/components/admin/AdminStatRow.svelte';
	import {
		fetchAdminUsageByUser,
		fetchAdminUsageSummary,
		type AdminUsageByUserRow,
		type AdminUsageSummary
	} from '$lib/kainbu/adminApi';

	let loading = true;
	let error = '';
	let summary: AdminUsageSummary | null = null;
	let users: AdminUsageByUserRow[] = [];

	const formatTokens = (value: number) => value.toLocaleString();

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

<section class="h-full overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
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
							<th class="px-3 py-2 font-medium">User</th>
							<th class="px-3 py-2 font-medium">Requests</th>
							<th class="px-3 py-2 font-medium">Tokens</th>
							<th class="px-3 py-2 font-medium">Cost</th>
							<th class="px-3 py-2 font-medium">Last activity</th>
						</tr>
					</thead>
					<tbody>
						{#if users.length === 0}
							<tr>
								<td colspan="5" class="px-3 py-4 text-app-subtext">No usage recorded yet.</td>
							</tr>
						{:else}
							{#each users as row}
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
