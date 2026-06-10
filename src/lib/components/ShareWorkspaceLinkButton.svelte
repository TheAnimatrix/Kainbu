<script lang="ts">
	import { Check, Link2 } from '$lib/icons';

	export let url = '';
	export let label = 'Share';

	let copied = false;
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	const copyLink = async () => {
		if (!url || typeof navigator === 'undefined') return;

		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
				copyTimeout = null;
			}, 1800);
		} catch (error) {
			console.error(error);
		}
	};
</script>

<button
	type="button"
	class="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-3 py-1.5 text-[11px] font-semibold text-app-subtext transition hover:border-app-primary/30 hover:text-app-text disabled:cursor-not-allowed disabled:opacity-50"
	title={url || 'Open a board to get a share link'}
	disabled={!url}
	onclick={copyLink}
>
	{#if copied}
		<Check size={13} />
		Copied
	{:else}
		<Link2 size={13} />
		{label}
	{/if}
</button>
