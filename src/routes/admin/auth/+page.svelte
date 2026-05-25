<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchAdminAuthEmailSettings,
		updateAdminAuthEmailSettings,
		type AdminAuthEmailSettings
	} from '$lib/kainbu/adminApi';

	let loading = true;
	let saving = false;
	let error = '';
	let message = '';
	let form: AdminAuthEmailSettings = {
		signupsEnabled: true,
		emailConfigured: false,
		emailVerificationEnabled: false,
		mailProvider: 'off',
		resendKeyHint: '',
		appUrl: '',
		fromName: 'Kainbu',
		fromEmail: '',
		smtp: {
			host: '',
			port: 587,
			username: '',
			passwordHint: '',
			tls: false,
			authMethod: 'PLAIN'
		}
	};
	let resendApiKey = '';
	let smtpPassword = '';

	const load = async () => {
		loading = true;
		error = '';
		try {
			form = await fetchAdminAuthEmailSettings();
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load auth settings';
		} finally {
			loading = false;
		}
	};

	onMount(load);

	const save = async () => {
		saving = true;
		error = '';
		message = '';
		try {
			const saved = await updateAdminAuthEmailSettings({
				signupsEnabled: form.signupsEnabled,
				mailProvider: form.mailProvider,
				appUrl: form.appUrl,
				fromName: form.fromName,
				fromEmail: form.fromEmail,
				resendApiKey,
				smtp: {
					...form.smtp,
					password: smtpPassword
				}
			});
			resendApiKey = '';
			smtpPassword = '';
			form = {
				signupsEnabled: saved.signupsEnabled,
				emailConfigured: saved.emailConfigured,
				emailVerificationEnabled: saved.emailVerificationEnabled,
				mailProvider: saved.mailProvider,
				resendKeyHint: saved.resendKeyHint,
				appUrl: saved.appUrl,
				fromName: saved.fromName,
				fromEmail: saved.fromEmail,
				smtp: saved.smtp
			};
			message = saved.emailVerificationEnabled
				? 'Auth and email settings saved. Email verification is ON.'
				: 'Auth and email settings saved.';
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Unable to save settings';
		} finally {
			saving = false;
		}
	};
</script>

<section class="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
	<div class="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
		<div class="px-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
			<h1 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">Auth & email</h1>
		</div>

		{#if error}
			<p class="px-1 text-sm text-red-400">{error}</p>
		{/if}
		{#if message}
			<p class="px-1 text-sm text-emerald-300">{message}</p>
		{/if}

		{#if loading}
			<p class="px-1 text-sm text-app-subtext">Loading...</p>
		{:else}
			<form class="space-y-5" on:submit|preventDefault={save}>
				<label class="flex items-center justify-between gap-4 border border-app-border/40 px-3 py-2.5">
					<span>
						<span class="block text-sm font-medium text-app-text">Allow public signups</span>
						<span class="block text-xs text-app-subtext">Admins can still create users manually.</span>
					</span>
					<input type="checkbox" bind:checked={form.signupsEnabled} />
				</label>

				<div class="border border-app-border/40 p-3">
					<p class="text-sm font-semibold text-app-text">Email provider</p>
					<div class="mt-3 grid gap-2 sm:grid-cols-3">
						{#each ['off', 'smtp', 'resend'] as provider}
							<label class="flex items-center gap-2 rounded-md border border-app-border/50 px-3 py-2 text-sm">
								<input
									type="radio"
									name="provider"
									value={provider}
									bind:group={form.mailProvider}
								/>
								<span class="capitalize">{provider}</span>
							</label>
						{/each}
					</div>
					<p class="mt-2 text-xs text-app-subtext">
						Email verification is {form.emailVerificationEnabled ? 'ON' : 'OFF'}.
					</p>
				</div>

				{#if form.mailProvider !== 'off'}
					<div class="grid gap-3 sm:grid-cols-2">
						<input
							bind:value={form.appUrl}
							placeholder="App URL, e.g. https://kainbu.app"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<input
							bind:value={form.fromEmail}
							type="email"
							placeholder="Sender email"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<input
							bind:value={form.fromName}
							placeholder="Sender name"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
					</div>
				{/if}

				{#if form.mailProvider === 'resend'}
					<input
						bind:value={resendApiKey}
						type="password"
						placeholder={form.resendKeyHint ? `Resend API key (${form.resendKeyHint})` : 'Resend API key'}
						class="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
					/>
				{:else if form.mailProvider === 'smtp'}
					<div class="grid gap-3 sm:grid-cols-2">
						<input
							bind:value={form.smtp.host}
							placeholder="SMTP host"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<input
							bind:value={form.smtp.port}
							type="number"
							placeholder="Port"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<input
							bind:value={form.smtp.username}
							placeholder="Username"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<input
							bind:value={smtpPassword}
							type="password"
							placeholder={form.smtp.passwordHint ? 'Password configured' : 'Password'}
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<label class="flex items-center gap-2 text-sm text-app-subtext">
							<input type="checkbox" bind:checked={form.smtp.tls} />
							Force TLS
						</label>
						<select
							bind:value={form.smtp.authMethod}
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						>
							<option value="PLAIN">PLAIN</option>
							<option value="LOGIN">LOGIN</option>
						</select>
					</div>
				{/if}

				<button
					type="submit"
					disabled={saving}
					class="rounded-md bg-app-primary px-4 py-2 text-sm font-semibold text-white hover:bg-app-primary-hover disabled:opacity-60"
				>
					{saving ? 'Saving...' : 'Save settings'}
				</button>
			</form>
		{/if}
	</div>
</section>
