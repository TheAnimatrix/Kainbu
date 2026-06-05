<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import AuthView from '$lib/components/AuthView.svelte';
	import { pocketbase, isPocketBaseConfigured } from '$lib/pocketbaseClient';
	import { formatPocketBaseError } from '$lib/pocketbaseErrors';
	import { getWorkspaceApiAccessToken, resolveWorkspaceApiUrl } from '$lib/kainbu/api';
	import { fetchAuthSettings, signupWithAuthSettings } from '$lib/kainbu/adminApi';
	import { BRAND_NAME } from '$lib/kainbu/constants';

	let loading = false;
	let authLoading = false;
	let infoMessage = '';
	let errorMessage = '';
	let sessionEmail = '';
	let userCode = '';
	let approved = false;
	let approving = false;
	let signupsEnabled = true;
	let emailConfigured = false;
	let emailVerificationEnabled = false;
	let showResendVerification = false;

	const formatCode = (raw: string) => {
		const compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
		if (compact.length <= 4) return compact;
		return `${compact.slice(0, 4)}-${compact.slice(4)}`;
	};

	const refreshSession = async () => {
		loading = true;
		sessionEmail = pocketbase.authStore.model?.email || '';
		loading = false;
	};

	onMount(() => {
		const code = $page.url.searchParams.get('code');
		if (code) userCode = formatCode(code);
		void fetchAuthSettings()
			.then((settings) => {
				signupsEnabled = settings.signupsEnabled;
				emailConfigured = settings.emailConfigured;
				emailVerificationEnabled = settings.emailVerificationEnabled;
			})
			.catch(() => {});
		void refreshSession();
		const unsubscribe = pocketbase.authStore.onChange(() => {
			void refreshSession();
		});
		return () => unsubscribe();
	});

	const rejectUnverifiedSession = (email: string) => {
		if (!emailVerificationEnabled || pocketbase.authStore.record?.verified !== false) {
			return false;
		}
		pocketbase.authStore.clear();
		errorMessage =
			'Verify your email before signing in. Check your inbox for the verification link.';
		showResendVerification = true;
		return true;
	};

	const handleResendVerificationRequest = async (
		event: CustomEvent<{ email: string }>
	) => {
		const normalizedEmail = event.detail.email.trim().toLowerCase();
		errorMessage = '';
		infoMessage = '';
		if (!normalizedEmail) {
			errorMessage = 'Enter your email before requesting a verification link.';
			return;
		}
		authLoading = true;
		try {
			await pocketbase.collection('users').requestVerification(normalizedEmail);
			showResendVerification = false;
			infoMessage = 'Verification email sent if that account is unverified.';
		} catch (error) {
			errorMessage = formatPocketBaseError(error, 'Unable to send verification email.');
		} finally {
			authLoading = false;
		}
	};

	const handleAuthSubmit = async (event: CustomEvent<{ email: string; password: string; isSignUp: boolean }>) => {
		authLoading = true;
		errorMessage = '';
		infoMessage = '';
		showResendVerification = false;
		const { email, password, isSignUp } = event.detail;

		try {
			if (isSignUp) {
				const result = await signupWithAuthSettings(email, password);
				if (result.requiresVerification) {
					infoMessage =
						'Account created. Check your email before signing in to authorize the CLI.';
					showResendVerification = true;
				} else {
					await pocketbase.collection('users').authWithPassword(email, password);
					if (rejectUnverifiedSession(email)) return;
					infoMessage = 'Account created. You can authorize the CLI below.';
				}
			} else {
				await pocketbase.collection('users').authWithPassword(email, password);
				if (rejectUnverifiedSession(email)) return;
			}
		} catch (error) {
			errorMessage = formatPocketBaseError(error, 'Unable to authenticate.');
		}

		authLoading = false;
		await refreshSession();
	};

	const handlePasswordResetRequest = async (
		event: CustomEvent<{ email: string }>
	) => {
		const email = event.detail.email.trim().toLowerCase();
		if (!email) {
			errorMessage = 'Enter your email before requesting a reset link.';
			return;
		}

		authLoading = true;
		errorMessage = '';
		infoMessage = '';
		try {
			await pocketbase.collection('users').requestPasswordReset(email);
			infoMessage = 'Password reset email sent if that account exists.';
		} catch (error) {
			errorMessage = formatPocketBaseError(error, 'Unable to send password reset email.');
		} finally {
			authLoading = false;
		}
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
	{#if !isPocketBaseConfigured}
		<p class="rounded-lg border border-app-border bg-app-surface p-4 text-sm">PocketBase is not configured.</p>
	{:else if loading}
		<p class="text-sm text-app-subtext">Loading session…</p>
	{:else if !sessionEmail}
		<AuthView
			loading={authLoading}
			configured={isPocketBaseConfigured}
			{signupsEnabled}
			{emailConfigured}
			{showResendVerification}
			{infoMessage}
			{errorMessage}
			on:submit={handleAuthSubmit}
			on:resetPassword={handlePasswordResetRequest}
			on:resendVerification={handleResendVerificationRequest}
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
