<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import appIcon from '../../assets/icon.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<link rel="apple-touch-icon" href={appIcon} />
</svelte:head>

{@render children()}
