<script lang="ts">
	import { LogIn, Mail, Lock, UserPlus } from '$lib/icons';
	import { BRAND_KATAKANA, BRAND_NAME } from '$lib/kainbu/constants';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { getVerificationResendCooldownRemaining } from '$lib/auth/verificationResend';
	import { createEventDispatcher, onDestroy } from 'svelte';
	import type { BackgroundTheme } from '$lib/kainbu/types';

	export let loading = false;
	export let configured = true;
	export let signupsEnabled = true;
	export let emailConfigured = false;
	export let showResendVerification = false;
	export let verificationEmail = '';
	export let infoMessage = '';
	export let errorMessage = '';
	export let theme: BackgroundTheme | undefined = undefined;
	export let backgroundImageUrl: string | null = null;
	// theme/backgroundImageUrl retained for API compatibility; login uses its own backdrop.
	void theme;
	void backgroundImageUrl;

	let email = '';
	let password = '';
	let isSignUp = false;
	let resendCooldownRemaining = 0;
	let cooldownTimer: ReturnType<typeof setInterval> | null = null;
	const emailInputId = 'auth-email';
	const passwordInputId = 'auth-password';

	const dispatch = createEventDispatcher<{
		submit: { email: string; password: string; isSignUp: boolean };
		resetPassword: { email: string };
		resendVerification: { email: string };
	}>();

	const resendTargetEmail = () => (verificationEmail || email).trim().toLowerCase();

	const syncResendCooldown = () => {
		resendCooldownRemaining = getVerificationResendCooldownRemaining(resendTargetEmail());
	};

	const ensureCooldownTicker = () => {
		syncResendCooldown();
		if (cooldownTimer) {
			clearInterval(cooldownTimer);
			cooldownTimer = null;
		}
		if (resendCooldownRemaining <= 0) return;
		cooldownTimer = setInterval(() => {
			syncResendCooldown();
			if (resendCooldownRemaining <= 0 && cooldownTimer) {
				clearInterval(cooldownTimer);
				cooldownTimer = null;
			}
		}, 1000);
	};

	const submit = () => {
		dispatch('submit', { email, password, isSignUp });
	};

	const requestPasswordReset = () => {
		dispatch('resetPassword', { email });
	};

	const requestVerificationResend = () => {
		dispatch('resendVerification', { email: resendTargetEmail() });
	};

	$: if (!signupsEnabled && isSignUp) {
		isSignUp = false;
	}

	$: showResendVerification, verificationEmail, email, loading, ensureCooldownTicker();

	onDestroy(() => {
		if (cooldownTimer) clearInterval(cooldownTimer);
	});
</script>

<div
	class="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-app-bg px-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] text-app-text"
>
	<div class="auth-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<div class="auth-backdrop__vignette absolute inset-0"></div>
	</div>

	<div
		class="auth-card relative z-10 w-full max-w-sm rounded-lg border border-app-border bg-app-surface/90 p-5 backdrop-blur-xl sm:p-6"
	>
		<div class="mb-5 flex items-center gap-3">
			<BrandMark size={40} alt={`${BRAND_NAME} icon`} />
			<div class="min-w-0 flex-1">
				<h1 class="font-display text-xl font-extrabold leading-tight tracking-tight">
					{BRAND_NAME}
				</h1>
				<div class="flex items-center gap-2 text-app-subtext">
					<span class="font-display text-[11px] font-bold tracking-[0.3em] text-app-primary">
						{BRAND_KATAKANA}
					</span>
					<span class="h-px flex-1 bg-app-border"></span>
				</div>
			</div>
		</div>

		{#if !configured}
			<div
				class="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
			>
				Add <code class="font-mono">VITE_POCKETBASE_URL</code> to enable auth.
			</div>
		{/if}

		{#if infoMessage}
			<div
				class="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
			>
				{infoMessage}
			</div>
		{/if}

		{#if errorMessage}
			<div
				class="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
			>
				{errorMessage}
			</div>
		{/if}

		<form class="space-y-3" on:submit|preventDefault={submit}>
			<div class="relative">
				<div
					class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-app-subtext"
				>
					<Mail size={16} />
				</div>
				<input
					id={emailInputId}
					bind:value={email}
					type="email"
					required
					placeholder="email@example.com"
					autocomplete="email"
					class="w-full rounded-lg border border-app-border bg-app-bg py-2.5 pl-10 pr-3 text-sm text-app-text outline-none transition focus:border-app-primary/60 focus:ring-2 focus:ring-app-primary/20"
				/>
			</div>

			<div class="relative">
				<div
					class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-app-subtext"
				>
					<Lock size={16} />
				</div>
				<input
					id={passwordInputId}
					bind:value={password}
					type="password"
					required
					minlength="8"
					placeholder="Password"
					autocomplete={isSignUp ? 'new-password' : 'current-password'}
					class="w-full rounded-lg border border-app-border bg-app-bg py-2.5 pl-10 pr-3 text-sm text-app-text outline-none transition focus:border-app-primary/60 focus:ring-2 focus:ring-app-primary/20"
				/>
			</div>

			<button
				type="submit"
				disabled={loading || !configured}
				class="kainbu-btn kainbu-btn--primary flex w-full disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if loading}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"
					></div>
				{:else if isSignUp}
					<UserPlus size={16} />
				{:else}
					<LogIn size={16} />
				{/if}
				{isSignUp ? 'Sign Up' : 'Sign In'}
			</button>
		</form>

		<div class="mt-4 flex flex-col items-center gap-2 text-center">
			{#if emailConfigured && showResendVerification}
				<button
					type="button"
					class="text-xs text-app-subtext transition hover:text-app-primary disabled:cursor-not-allowed disabled:opacity-60"
					disabled={loading || resendCooldownRemaining > 0 || !resendTargetEmail()}
					on:click={requestVerificationResend}
				>
					{#if resendCooldownRemaining > 0}
						Resend verification email in {resendCooldownRemaining}s
					{:else}
						Resend verification email
					{/if}
				</button>
			{/if}
			{#if emailConfigured && !isSignUp}
				<button
					type="button"
					class="text-xs text-app-subtext transition hover:text-app-primary"
					on:click={requestPasswordReset}
				>
					Forgot password?
				</button>
			{/if}
			<button
				type="button"
				class="text-xs text-app-subtext transition hover:text-app-primary"
				disabled={!signupsEnabled}
				on:click={() => {
					if (signupsEnabled) isSignUp = !isSignUp;
				}}
			>
				{#if signupsEnabled}
					{isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
				{:else}
					Signups are disabled. Sign in with an existing account.
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	.auth-card::before {
		content: '';
		position: absolute;
		inset: -1px;
		padding: 1px;
		border-radius: inherit;
		pointer-events: none;
		background:
			radial-gradient(
				ellipse 65% 95% at 100% 12%,
				rgba(255, 194, 139, 0.72),
				transparent 75%
			),
			radial-gradient(
				ellipse 55% 90% at 0% 68%,
				rgba(121, 163, 211, 0.34),
				transparent 78%
			);
		background-size: 125% 125%, 120% 125%;
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
		animation: auth-border-wind 9s ease-in-out infinite;
	}

	@keyframes auth-border-wind {
		0%,
		100% {
			background-position: 50% 48%, 50% 52%;
			opacity: 0.78;
		}
		22% {
			background-position: 55% 44%, 47% 56%;
			opacity: 1;
		}
		43% {
			background-position: 47% 53%, 54% 48%;
			opacity: 0.68;
		}
		68% {
			background-position: 53% 46%, 46% 54%;
			opacity: 0.94;
		}
		84% {
			background-position: 49% 51%, 52% 47%;
			opacity: 0.72;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.auth-card::before {
			animation: none;
		}
	}

	.auth-backdrop {
		background: #172232 url('/auth-lake-dusk.webp') center / cover no-repeat;
	}

	.auth-backdrop__vignette {
		background: radial-gradient(
			ellipse at center,
			transparent 40%,
			rgba(0, 0, 0, 0.3) 100%
		);
	}
</style>
