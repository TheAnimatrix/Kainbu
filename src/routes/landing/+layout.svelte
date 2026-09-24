<script lang="ts">
	import { page } from '$app/state';
	import LandingDesignSwitcher from '$lib/components/marketing/LandingDesignSwitcher.svelte';
	import '$lib/components/marketing/landing.css';
	let { children } = $props();
	const direction = $derived(
		page.url.pathname.endsWith('/studio')
			? 'studio'
			: page.url.pathname.endsWith('/mono')
				? 'mono'
				: page.url.pathname.endsWith('/focus')
					? 'focus'
					: 'index'
	);
</script>

<div class="landing-root" data-direction={direction}>
	<a class="landing-skip" href="#main">Skip to content</a>
	{@render children()}
	<LandingDesignSwitcher />
</div>
