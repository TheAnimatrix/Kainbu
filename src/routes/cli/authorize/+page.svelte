<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import AuthView from '$lib/components/AuthView.svelte';
	import { supabase, isSupabaseConfigured } from '$lib/supabaseClient';
	import { getWorkspaceApiAccessToken, resolveWorkspaceApiUrl } from '$lib/kainbu/api';
	import { BRAND_NAME } from '$lib/kainbu/constants';

	let loading = false;
	let authLoading = false;
	let infoMessage = '';
	let errorMessage = '';
	let sessionEmail = '';
	let userCode = '';
	let approved = false;
	let approving = false;

	const formatCode = (raw: string) => {
		const compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
		if (compact.length <= 4) return compact;
		return `${compact.slice(0, 4)}-${compact.slice(4)}`;
	};

	const refreshSession = async () => {
		loading = true;
		const {
			data: { session }
		} = await supabase.auth.getSession();
		sessionEmail = session?.user?.email || '';
		loading = false;
	};

	onMount(() => {
		const code = $page.url.searchParams.get('code');
		if (code) userCode = formatCode(code);
		void refreshSession();
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange(() => {
			void refreshSession();
		});
		return () => subscription.unsubscribe();
	});

	const handleAuthSubmit = async (event: CustomEvent<{ email: string; password: string; isSignUp: boolean }>) => {
		authLoading = true;
		errorMessage = '';
		infoMessage = '';
		const { email, password, isSignUp } = event.detail;

		if (isSignUp) {
			const { error } = await supabase.auth.signUp({
				email,
				password,
				options: { emailRedirectTo: window.location.href }
			});
			if (error) {
				errorMessage = error.message;
			} else {
				infoMessage = 'Check your email to confirm your account, then authorize the CLI.';
			}
		} else {
			const { error } = await supabase.auth.signInWithPassword({ email, password });
			if (error) errorMessage = error.message;
		}

		authLoading = false;
		await refreshSession();
	};

	const approveCli = async () => {
		if (!userCode.trim()) {
			errorMessage = 'Enter the code shown in your terminal.';
			return;
		}

		approving = true;
		errorMessage = '';
		infoMessage = '';

		try {
			const token = await getWorkspaceApiAccessToken();
			const response = await fetch(resolveWorkspaceApiUrl('/api/cli/device/approve'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ userCode: formatCode(userCode) })
			});

			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) {
				throw new Error(payload.error || 'Unable to authorize CLI.');
			}

			approved = true;
			infoMessage = 'CLI authorized. You can return to your terminal.';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to authorize CLI.';
		} finally {
			approving = false;
		}
	};
</script>

<svelte:head>
	<title>{BRAND_NAME} CLI authorization</title>
</svelte:head>

<div class="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-4 px-4 py-8 text-app-text">
	{#if !isSupabaseConfigured}
		<p class="rounded-lg border border-app-border bg-app-surface p-4 text-sm">Supabase is not configured.</p>
	{:else if loading}
		<p class="text-sm text-app-subtext">Loading session…</p>
	{:else if !sessionEmail}
		<AuthView
			loading={authLoading}
			configured={isSupabaseConfigured}
			{infoMessage}
			{errorMessage}
			on:submit={handleAuthSubmit}
		/>
	{:else}
		<section class="rounded-xl border border-app-border bg-app-surface p-5 shadow-kainbu-lg">
			<h1 class="font-display text-xl font-bold">Authorize CLI</h1>
			<p class="mt-2 text-sm text-app-subtext">
				Signed in as <span class="text-app-text">{sessionEmail}</span>
			</p>

			<label class="mt-4 block text-sm font-medium" for="cli-code">Device code</label>
			<input
				id="cli-code"
				class="mt-1 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 font-mono text-lg tracking-widest"
				bind:value={userCode}
				placeholder="ABCD-1234"
				autocomplete="one-time-code"
			/>

			{#if errorMessage}
				<p class="mt-3 text-sm text-red-400">{errorMessage}</p>
			{/if}
			{#if infoMessage}
				<p class="mt-3 text-sm text-app-subtext">{infoMessage}</p>
			{/if}

			<button
				class="mt-4 w-full rounded-lg bg-app-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				disabled={approving || approved}
				on:click={approveCli}
			>
				{approved ? 'Authorized' : approving ? 'Authorizing…' : 'Authorize CLI'}
			</button>
		</section>
	{/if}
</div>
