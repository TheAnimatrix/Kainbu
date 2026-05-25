<script lang="ts">
	import { onMount } from 'svelte';
	import AdminStatRow from '$lib/components/admin/AdminStatRow.svelte';
	import {
		fetchAdminAiSettings,
		fetchAdminUsageSummary,
		fetchAdminUsers,
		type AdminUsageSummary
	} from '$lib/kainbu/adminApi';

	let loading = true;
	let error = '';
	let usage: AdminUsageSummary | null = null;
	let userCount = 0;
	let aiConfigured = false;
	let aiSource = 'none';

	const formatTokens = (value: number) => value.toLocaleString();

	onMount(async () => {
		try {
			const [usageSummary, users, ai] = await Promise.all([
				fetchAdminUsageSummary(30),
				fetchAdminUsers(1),
				fetchAdminAiSettings()
			]);
			usage = usageSummary;
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
				<AdminStatRow
					label="AI requests (30d)"
					value={usage?.requestCount ?? 0}
				/>
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
		{/if}
	</div>
</section>
