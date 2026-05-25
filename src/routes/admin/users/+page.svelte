<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchAdminUsers, patchAdminUser, type AdminUserRow } from '$lib/kainbu/adminApi';
	import {
		compareNumbers,
		compareStrings,
		parsePbDateMs,
		sortDirSymbol,
		toggleSort,
		type SortDir
	} from '$lib/components/admin/tableSort';

	type UserSortKey = 'email' | 'username' | 'admin' | 'disabled' | 'created';

	let loading = true;
	let savingId = '';
	let error = '';
	let users: AdminUserRow[] = [];
	let sortKey: UserSortKey = 'email';
	let sortDir: SortDir = 'asc';

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

	const setSort = (key: UserSortKey) => {
		const next = toggleSort(key, sortKey, sortDir);
		sortKey = next.key;
		sortDir = next.dir;
	};

	const compareUsers = (left: AdminUserRow, right: AdminUserRow) => {
		let cmp = 0;
		switch (sortKey) {
			case 'email':
				cmp = compareStrings(left.email || '', right.email || '');
				break;
			case 'username':
				cmp = compareStrings(left.username || '', right.username || '');
				break;
			case 'admin':
				cmp = compareNumbers(Number(left.is_admin), Number(right.is_admin));
				break;
			case 'disabled':
				cmp = compareNumbers(Number(left.disabled), Number(right.disabled));
				break;
			case 'created':
				cmp = compareNumbers(parsePbDateMs(left.created), parsePbDateMs(right.created));
				break;
		}
		return sortDir === 'asc' ? cmp : -cmp;
	};

	$: sortedUsers = [...users].sort(compareUsers);

	const headerClass = (key: UserSortKey) =>
		`inline-flex items-center gap-1 font-medium uppercase tracking-wide transition-colors hover:text-app-text ${
			sortKey === key ? 'text-app-text' : ''
		}`;

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

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
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
							<th class="px-3 py-2">
								<button type="button" class={headerClass('email')} on:click={() => setSort('email')}>
									Email
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'email', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button
									type="button"
									class={headerClass('username')}
									on:click={() => setSort('username')}
								>
									Username
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'username', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button type="button" class={headerClass('admin')} on:click={() => setSort('admin')}>
									Admin
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'admin', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button
									type="button"
									class={headerClass('disabled')}
									on:click={() => setSort('disabled')}
								>
									Disabled
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'disabled', sortDir)}</span>
								</button>
							</th>
							<th class="px-3 py-2">
								<button
									type="button"
									class={headerClass('created')}
									on:click={() => setSort('created')}
								>
									Created
									<span class="text-app-primary">{sortDirSymbol(sortKey === 'created', sortDir)}</span>
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedUsers as user (user.id)}
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
