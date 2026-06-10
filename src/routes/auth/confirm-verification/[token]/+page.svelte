<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { pocketbase } from '$lib/pocketbaseClient';
	import { formatPocketBaseError } from '$lib/pocketbaseErrors';

	let loading = true;
	let message = '';
	let error = '';

	onMount(async () => {
		const token = $page.params.token || '';
		try {
			await pocketbase.collection('users').confirmVerification(token);
			message = 'Email verified. You can sign in now.';
		} catch (confirmError) {
			error = formatPocketBaseError(confirmError, 'Unable to verify this email link.');
		} finally {
			loading = false;
		}
	});
</script>

<section class="flex min-h-[100dvh] items-center justify-center bg-app-bg px-4 text-app-text">
	<div class="w-full max-w-sm border border-app-border bg-app-surface p-5">
		<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Kainbu</p>
		<h1 class="mt-2 text-xl font-bold">Email verification</h1>
		{#if loading}
			<p class="mt-3 text-sm text-app-subtext">Verifying...</p>
		{:else if error}
			<p class="mt-3 text-sm text-red-400">{error}</p>
		{:else}
			<p class="mt-3 text-sm text-emerald-300">{message}</p>
		{/if}
		<a href="/" class="kainbu-btn kainbu-btn--primary mt-4 inline-block">
			Open Kainbu
		</a>
	</div>
</section>
