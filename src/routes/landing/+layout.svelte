<script lang="ts">
	import LandingTopGlow from '$lib/components/landing/LandingTopGlow.svelte';

	let { children } = $props();
</script>

<div class="landing-root relative isolate min-h-[100dvh] overflow-x-clip bg-app-bg text-app-text">
	<LandingTopGlow />
	<div class="relative z-[1]">
		{@render children()}
	</div>
</div>

<style>
	:global(html:has(.landing-root)),
	:global(body:has(.landing-root)) {
		height: auto;
		min-height: 100%;
		overflow: auto;
	}
</style>
