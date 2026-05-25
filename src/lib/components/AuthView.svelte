<script lang="ts">
	import { LogIn, Mail, Lock, UserPlus } from 'lucide-svelte';
	import { BRAND_KATAKANA, BRAND_NAME } from '$lib/kainbu/constants';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { createEventDispatcher } from 'svelte';
	import type { BackgroundTheme } from '$lib/kainbu/types';

	export let loading = false;
	export let configured = true;
	export let signupsEnabled = true;
	export let emailConfigured = false;
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
	const emailInputId = 'auth-email';
	const passwordInputId = 'auth-password';

	const dispatch = createEventDispatcher<{
		submit: { email: string; password: string; isSignUp: boolean };
		resetPassword: { email: string };
	}>();

	const submit = () => {
		dispatch('submit', { email, password, isSignUp });
	};

	const requestPasswordReset = () => {
		dispatch('resetPassword', { email });
	};

	$: if (!signupsEnabled && isSignUp) {
		isSignUp = false;
	}
</script>

<div
	class="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-app-bg px-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] text-app-text"
>
	<div class="auth-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<div class="auth-backdrop__sweep absolute inset-[-25%]"></div>
		<div class="auth-backdrop__dots absolute inset-0"></div>
		<div class="auth-backdrop__vignette absolute inset-0"></div>
		<div class="auth-backdrop__scan absolute inset-x-0 top-0 h-px"></div>
	</div>

	<div
		class="relative z-10 w-full max-w-sm rounded-xl border border-app-border bg-app-surface/90 p-5 shadow-kainbu-xl backdrop-blur-xl sm:p-6"
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
					minlength="6"
					placeholder="Password"
					autocomplete={isSignUp ? 'new-password' : 'current-password'}
					class="w-full rounded-lg border border-app-border bg-app-bg py-2.5 pl-10 pr-3 text-sm text-app-text outline-none transition focus:border-app-primary/60 focus:ring-2 focus:ring-app-primary/20"
				/>
			</div>

			<button
				type="submit"
				disabled={loading || !configured}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-app-primary px-4 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
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
	.auth-backdrop {
		background:
			radial-gradient(
				ellipse 80% 60% at 20% 0%,
				color-mix(in oklab, var(--color-app-primary) 22%, transparent),
				transparent 70%
			),
			radial-gradient(
				ellipse 70% 50% at 100% 100%,
				color-mix(in oklab, var(--color-app-primary) 14%, transparent),
				transparent 70%
			),
			var(--color-app-bg);
	}

	.auth-backdrop__dots {
		background-image: radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px);
		background-size: 24px 24px;
		mask-image: radial-gradient(ellipse at center, black 30%, transparent 85%);
		-webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 85%);
		opacity: 0.6;
	}

	.auth-backdrop__sweep {
		background: conic-gradient(
			from 0deg at 50% 50%,
			transparent 0deg,
			color-mix(in oklab, var(--color-app-primary) 100%, transparent) 50deg,
			transparent 130deg,
			transparent 230deg,
			color-mix(in oklab, #6366f1 100%, transparent) 310deg,
			transparent 360deg
		);
		opacity: 0.28;
		filter: blur(80px);
		animation: auth-sweep 60s linear infinite;
	}

	.auth-backdrop__vignette {
		background: radial-gradient(
			ellipse at center,
			transparent 35%,
			rgba(0, 0, 0, 0.55) 100%
		);
	}

	.auth-backdrop__scan {
		background: linear-gradient(
			to right,
			transparent,
			color-mix(in oklab, var(--color-app-primary) 70%, transparent),
			transparent
		);
		opacity: 0;
		box-shadow: 0 0 12px color-mix(in oklab, var(--color-app-primary) 50%, transparent);
		animation: auth-scan 16s ease-in-out infinite;
	}

	@keyframes auth-sweep {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes auth-scan {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0;
		}
		50% {
			transform: translateY(100vh);
			opacity: 0.5;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.auth-backdrop__sweep,
		.auth-backdrop__scan {
			animation: none;
		}
		.auth-backdrop__scan {
			opacity: 0;
		}
	}
</style>
