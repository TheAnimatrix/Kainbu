<script lang="ts">
	import { page } from '$app/stores';
	import { pocketbase } from '$lib/pocketbaseClient';
	import { formatPocketBaseError } from '$lib/pocketbaseErrors';

	let password = '';
	let saving = false;
	let message = '';
	let error = '';

	const resetPassword = async () => {
		message = '';
		error = '';
		if (password.length < 8) {
			error = 'Use at least 8 characters.';
			return;
		}

		saving = true;
		try {
			await pocketbase
				.collection('users')
				.confirmPasswordReset($page.params.token || '', password, password);
			password = '';
			message = 'Password changed. You can sign in now.';
		} catch (resetError) {
			error = formatPocketBaseError(resetError, 'Unable to reset password.');
		} finally {
			saving = false;
		}
	};
</script>

<section class="flex min-h-[100dvh] items-center justify-center bg-app-bg px-4 text-app-text">
	<form
		class="w-full max-w-sm border border-app-border bg-app-surface p-5"
		on:submit|preventDefault={resetPassword}
	>
		<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Kainbu</p>
		<h1 class="mt-2 text-xl font-bold">Reset password</h1>
		<input
			bind:value={password}
			type="password"
			required
			minlength="8"
			autocomplete="new-password"
			placeholder="New password"
			class="mt-4 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
		/>
		{#if error}
			<p class="mt-3 text-sm text-red-400">{error}</p>
		{/if}
		{#if message}
			<p class="mt-3 text-sm text-emerald-300">{message}</p>
		{/if}
		<div class="mt-4 flex items-center gap-3">
			<button
				type="submit"
				disabled={saving || Boolean(message)}
				class="kainbu-btn kainbu-btn--primary disabled:opacity-60"
			>
				{saving ? 'Saving...' : 'Set password'}
			</button>
			<a href="/" class="text-sm text-app-subtext hover:text-app-text">Back to sign in</a>
		</div>
	</form>
</section>
