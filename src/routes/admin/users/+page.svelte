<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchAdminUsers, patchAdminUser, type AdminUserRow } from '$lib/kainbu/adminApi';

	let loading = true;
	let savingId = '';
	let error = '';
	let users: AdminUserRow[] = [];

	const loadUsers = async () => {
		loading = true;
		error = '';
		try {
			const result = await fetchAdminUsers(1);
			users = result.items;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load users';
		} finally {
			loading = false;
		}
	};

	onMount(loadUsers);

	const toggleAdmin = async (user: AdminUserRow) => {
		if (user.on_allowlist && user.is_admin) {
			error = 'Cannot demote an email on KAINBU_ADMIN_EMAILS.';
			return;
		}
		savingId = user.id;
		error = '';
		try {
			await patchAdminUser(user.id, { is_admin: !user.is_admin });
			await loadUsers();
		} catch (patchError) {
			error = patchError instanceof Error ? patchError.message : 'Update failed';
		} finally {
			savingId = '';
		}
	};

	const toggleDisabled = async (user: AdminUserRow) => {
		savingId = user.id;
		error = '';
		try {
			await patchAdminUser(user.id, { disabled: !user.disabled });
			await loadUsers();
		} catch (patchError) {
			error = patchError instanceof Error ? patchError.message : 'Update failed';
		} finally {
			savingId = '';
		}
	};
</script>

<section class="h-full overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-5xl flex-col gap-4">
		<div class="px-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
			<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">Users</h1>
		</div>

		{#if error}
			<p class="px-1 text-sm text-red-400">{error}</p>
		{/if}

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading…</p>
		{:else}
			<div class="overflow-x-auto border border-app-border/40">
				<table class="w-full min-w-[40rem] text-left text-sm">
					<thead class="border-b border-app-border/40 bg-app-surface/60 text-xs uppercase tracking-wide text-app-subtext">
						<tr>
							<th class="px-3 py-2 font-medium">Email</th>
							<th class="px-3 py-2 font-medium">Username</th>
							<th class="px-3 py-2 font-medium">Admin</th>
							<th class="px-3 py-2 font-medium">Disabled</th>
							<th class="px-3 py-2 font-medium">Created</th>
						</tr>
					</thead>
					<tbody>
						{#each users as user}
							<tr class="border-t border-app-border/30">
								<td class="px-3 py-2">
									<div class="text-app-text">{user.email}</div>
									{#if user.on_allowlist}
										<div class="text-[10px] uppercase tracking-wide text-app-primary">
											allowlist
										</div>
									{/if}
								</td>
								<td class="px-3 py-2 text-app-subtext">{user.username || '—'}</td>
								<td class="px-3 py-2">
									<button
										type="button"
										class="rounded border border-app-border/50 px-2 py-0.5 text-xs disabled:opacity-50"
										disabled={savingId === user.id || (user.on_allowlist && user.is_admin)}
										on:click={() => toggleAdmin(user)}
									>
										{user.is_admin ? 'Yes' : 'No'}
									</button>
								</td>
								<td class="px-3 py-2">
									<button
										type="button"
										class="rounded border border-app-border/50 px-2 py-0.5 text-xs disabled:opacity-50"
										disabled={savingId === user.id}
										on:click={() => toggleDisabled(user)}
									>
										{user.disabled ? 'Yes' : 'No'}
									</button>
								</td>
								<td class="px-3 py-2 text-xs text-app-subtext">
									{user.created ? new Date(user.created).toLocaleDateString() : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>
