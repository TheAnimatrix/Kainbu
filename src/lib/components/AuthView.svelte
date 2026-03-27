<script lang="ts">
	import { LogIn, Mail, Lock, UserPlus } from 'lucide-svelte';
	import { BRAND_KATAKANA, BRAND_NAME } from '$lib/kainbu/constants';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import { createEventDispatcher } from 'svelte';
	import type { BackgroundTheme } from '$lib/kainbu/types';

	export let loading = false;
	export let configured = true;
	export let infoMessage = '';
	export let errorMessage = '';
	export let theme: BackgroundTheme;
	export let backgroundImageUrl: string | null = null;

	let email = '';
	let password = '';
	let isSignUp = false;
	const emailInputId = 'auth-email';
	const passwordInputId = 'auth-password';

	const dispatch = createEventDispatcher<{
		submit: { email: string; password: string; isSignUp: boolean };
	}>();

	const submit = () => {
		dispatch('submit', { email, password, isSignUp });
	};
</script>

<div
	class="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-app-bg p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] text-app-text"
>
	<ThemedBackdrop {theme} imageUrl={backgroundImageUrl} />

	<div
		class="relative z-10 w-full max-w-md overflow-hidden rounded-[2rem] border border-app-border bg-app-surface/90 p-8 shadow-kainbu-xl backdrop-blur-xl"
	>
		<div class="mb-8 space-y-4 text-center">
			<BrandMark size={68} className="mx-auto" alt={`${BRAND_NAME} icon`} />

			<div class="space-y-2">
				<h1 class="font-display text-5xl font-extrabold tracking-tight">{BRAND_NAME}</h1>
				<div class="flex items-center justify-center gap-3 text-app-subtext">
					<div class="h-px w-10 bg-app-border"></div>
					<span class="font-display text-xl font-bold tracking-[0.4em] text-app-primary"
						>{BRAND_KATAKANA}</span
					>
					<div class="h-px w-10 bg-app-border"></div>
				</div>
			</div>
			<p class="text-[11px] font-bold uppercase tracking-[0.36em] text-app-subtext/80">
				Intelligent Harmony Workspace
			</p>
		</div>

		{#if !configured}
			<div
				class="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
			>
				Add <code class="font-mono">VITE_SUPABASE_URL</code> and
				<code class="font-mono">VITE_SUPABASE_ANON_KEY</code> in
				<code class="font-mono">calurcap/.env.local</code>
				to enable auth.
			</div>
		{/if}

		{#if infoMessage}
			<div
				class="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
			>
				{infoMessage}
			</div>
		{/if}

		{#if errorMessage}
			<div
				class="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
			>
				{errorMessage}
			</div>
		{/if}

		<form class="space-y-5" on:submit|preventDefault={submit}>
			<div class="space-y-2">
				<label
					for={emailInputId}
					class="ml-1 text-[10px] font-bold uppercase tracking-[0.3em] text-app-subtext"
				>
					Identity
				</label>
				<div class="relative">
					<div
						class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-app-subtext"
					>
						<Mail size={18} />
					</div>
					<input
						id={emailInputId}
						bind:value={email}
						type="email"
						required
						placeholder="email@example.com"
						class="w-full rounded-2xl border border-app-border bg-app-bg px-12 py-3.5 text-sm text-app-text outline-none transition focus:border-app-primary/60 focus:ring-2 focus:ring-app-primary/20"
					/>
				</div>
			</div>

			<div class="space-y-2">
				<label
					for={passwordInputId}
					class="ml-1 text-[10px] font-bold uppercase tracking-[0.3em] text-app-subtext"
				>
					Password
				</label>
				<div class="relative">
					<div
						class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-app-subtext"
					>
						<Lock size={18} />
					</div>
					<input
						id={passwordInputId}
						bind:value={password}
						type="password"
						required
						minlength="6"
						placeholder="••••••••"
						class="w-full rounded-2xl border border-app-border bg-app-bg px-12 py-3.5 text-sm text-app-text outline-none transition focus:border-app-primary/60 focus:ring-2 focus:ring-app-primary/20"
					/>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading || !configured}
				class="flex w-full items-center justify-center gap-3 rounded-2xl bg-app-primary px-4 py-3.5 text-xs font-bold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5 hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if loading}
					<div
						class="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white"
					></div>
				{:else if isSignUp}
					<UserPlus size={18} />
				{:else}
					<LogIn size={18} />
				{/if}
				{isSignUp ? 'Establish Account' : 'Authenticate'}
			</button>
		</form>

		<div class="mt-4 text-center">
			<button
				type="button"
				class="text-[11px] font-bold uppercase tracking-[0.3em] text-app-subtext transition hover:text-app-primary"
				on:click={() => (isSignUp = !isSignUp)}
			>
				{isSignUp ? 'Existing identity? Sign in' : 'New identity? Sign up'}
			</button>
		</div>

		<div class="relative my-6">
			<div class="absolute inset-0 flex items-center">
				<div class="w-full border-t border-app-border"></div>
			</div>
			<div class="relative flex justify-center">
				<span
					class="bg-app-surface px-4 text-[10px] font-bold uppercase tracking-[0.3em] text-app-subtext"
				>
					Or
				</span>
			</div>
		</div>

		<button
			type="button"
			disabled
			class="flex w-full cursor-not-allowed items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left text-sm text-app-text opacity-80"
		>
			<span class="flex items-center gap-3 font-semibold">
				<span
					class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							fill="#4285F4"
						/>
						<path
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							fill="#34A853"
						/>
						<path
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							fill="#FBBC05"
						/>
						<path
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							fill="#EA4335"
						/>
					</svg>
				</span>
				<span>Google Sign In</span>
			</span>
			<span
				class="rounded-full border border-app-border bg-app-element px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-app-subtext"
			>
				Coming soon
			</span>
		</button>
	</div>
</div>
