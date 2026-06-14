<script lang="ts">
	import { onMount } from 'svelte';
	import { Copy, KeyRound, Trash2 } from '$lib/icons';
	import {
		createApiKey,
		fetchApiKeys,
		revokeApiKey,
		type ApiKeyRow
	} from '$lib/kainbu/apiKeysApi';

	let loading = true;
	let saving = false;
	let error = '';
	let keys: ApiKeyRow[] = [];
	let newName = '';
	let justCreated: { name: string; token: string; prefix: string } | null = null;
	let copied = false;

	const load = async () => {
		loading = true;
		error = '';
		try {
			keys = await fetchApiKeys();
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load API keys.';
		} finally {
			loading = false;
		}
	};

	onMount(load);

	const create = async () => {
		error = '';
		if (!newName.trim()) {
			error = 'Give the key a name so you can tell it apart later.';
			return;
		}
		saving = true;
		try {
			const created = await createApiKey(newName.trim());
			justCreated = { name: created.name, token: created.token, prefix: created.prefix };
			newName = '';
			copied = false;
			await load();
		} catch (createError) {
			error = createError instanceof Error ? createError.message : 'Failed to create API key.';
		} finally {
			saving = false;
		}
	};

	const revoke = async (key: ApiKeyRow) => {
		if (key.revoked_at) return;
		const confirmed =
			typeof window !== 'undefined'
				? window.confirm(`Revoke "${key.name}"? Anything using this key will stop working immediately.`)
				: true;
		if (!confirmed) return;
		error = '';
		try {
			await revokeApiKey(key.id);
			await load();
		} catch (revokeError) {
			error = revokeError instanceof Error ? revokeError.message : 'Failed to revoke API key.';
		}
	};

	const copy = async (value: string) => {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 1500);
		} catch {
			// ignore
		}
	};

	const formatDate = (value: string | null) => {
		if (!value) return '—';
		const ms = new Date(value).getTime();
		if (!Number.isFinite(ms)) return value;
		return new Date(ms).toLocaleString();
	};
</script>

<div class="kainbu-settings__stack">
	<form class="kainbu-settings-panel" on:submit|preventDefault={create}>
		<div class="kainbu-settings-panel__body">
			<h3 class="kainbu-settings-panel__title">Create an API key</h3>
			<p class="kainbu-settings-panel__desc">
				Use API keys to sign in from the Kainbu CLI on a self-hosted domain. The key is shown
				once — copy it before closing this panel.
			</p>
			<div class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
				<label class="block">
					<span class="kainbu-settings-field-label mb-1.5 block">Label</span>
					<input
						bind:value={newName}
						type="text"
						maxlength="64"
						placeholder="e.g. CI on my-laptop"
						class="kainbu-settings-input w-full px-3 py-2 text-sm"
					/>
				</label>
				<button
					type="submit"
					disabled={saving}
					class="kainbu-btn kainbu-btn--primary kainbu-btn--compact self-end disabled:cursor-not-allowed disabled:opacity-60"
				>
					{#if saving}
						<span class="kainbu-settings-spinner"></span>
					{:else}
						<KeyRound size={14} />
					{/if}
					{saving ? 'Creating…' : 'Create key'}
				</button>
			</div>
			{#if error}
				<p class="kainbu-settings-feedback kainbu-settings-feedback--error mt-3">{error}</p>
			{/if}
		</div>
	</form>

	{#if justCreated}
		<div class="kainbu-settings-panel kainbu-settings-panel--accent">
			<div class="kainbu-settings-panel__body">
				<h3 class="kainbu-settings-panel__title">Copy this key now</h3>
				<p class="kainbu-settings-panel__desc">
					This is the only time you'll see the full value of "{justCreated.name}". After this it
					disappears — you'll only be able to see the prefix ({justCreated.prefix}…).
				</p>
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<code
						class="kainbu-settings-input flex-1 overflow-x-auto whitespace-pre px-3 py-2 font-mono text-xs"
					>
						{justCreated.token}
					</code>
					<button
						type="button"
						class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
						on:click={() => copy(justCreated!.token)}
					>
						<Copy size={14} />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<p class="kainbu-settings-note mt-3">
					On the CLI: <code>kainbu login --server &lt;your-api-base&gt; --api-key &lt;this-key&gt;</code>
				</p>
				<div class="mt-3 flex justify-end">
					<button
						type="button"
						class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
						on:click={() => {
							justCreated = null;
						}}
					>
						I've saved it
					</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="kainbu-settings-panel">
		<div class="kainbu-settings-panel__body">
			<h3 class="kainbu-settings-panel__title">Existing keys</h3>
			<p class="kainbu-settings-panel__desc">
				{keys.length} {keys.length === 1 ? 'key' : 'keys'} on your account. Revoked keys stay
				listed for audit but can no longer be used.
			</p>
			<div class="mt-4 overflow-x-auto">
				{#if loading}
					<p class="kainbu-settings-note">Loading…</p>
				{:else if keys.length === 0}
					<p class="kainbu-settings-note">No keys yet — create one above.</p>
				{:else}
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr class="border-b border-app-border/40 text-left">
								<th class="py-2 pr-3 font-medium uppercase tracking-wide">Label</th>
								<th class="py-2 pr-3 font-medium uppercase tracking-wide">Prefix</th>
								<th class="py-2 pr-3 font-medium uppercase tracking-wide">Last used</th>
								<th class="py-2 pr-3 font-medium uppercase tracking-wide">Created</th>
								<th class="py-2 pr-3 font-medium uppercase tracking-wide">Status</th>
								<th class="py-2 pr-3 font-medium uppercase tracking-wide">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each keys as key (key.id)}
								<tr class="border-b border-app-border/20 align-top">
									<td class="py-2 pr-3">{key.name}</td>
									<td class="py-2 pr-3 font-mono text-xs">{key.hint}</td>
									<td class="py-2 pr-3 text-app-subtext">{formatDate(key.last_used_at)}</td>
									<td class="py-2 pr-3 text-app-subtext">{formatDate(key.created)}</td>
									<td class="py-2 pr-3">
										{#if key.revoked_at}
											<span class="kainbu-settings-feedback--error">revoked</span>
										{:else}
											<span class="kainbu-settings-feedback--success">active</span>
										{/if}
									</td>
									<td class="py-2 pr-3">
										{#if !key.revoked_at}
											<button
												type="button"
												class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact kainbu-btn--danger"
												on:click={() => void revoke(key)}
											>
												<Trash2 size={14} />
												Revoke
											</button>
										{:else}
											<span class="kainbu-settings-note">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	</div>
</div>
