<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { Undo2, X } from '$lib/icons';
	// Review tools stay out of the prerendered marketing experience.
	let visible = $derived(browser && page.url.searchParams.has('compare'));
	const directions = [
		{ title: 'Canvas', number: '04', route: '/landing' },
		{ title: 'Focus', number: '01', route: '/landing/focus' },
		{ title: 'Studio', number: '02', route: '/landing/studio' },
		{ title: 'Mono', number: '03', route: '/landing/mono' }
	] as const;
	function replay() {
		window.scrollTo({ top: 0, behavior: 'instant' });
		window.dispatchEvent(new Event('landing:replay'));
	}
</script>

{#if visible}
	<aside class="design-switcher" aria-label="Compare landing designs">
		<span class="switcher-label">Directions</span>
		<nav aria-label="Design directions">
			{#each directions as direction (direction.route)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- Resolve the typed route before appending the review query. -->
				<a
					href={`${resolve(direction.route)}?compare=1`}
					aria-current={page.url.pathname === resolve(direction.route) ? 'page' : undefined}
					><span>{direction.number}</span> {direction.title}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</nav>
		<button
			class="replay"
			onclick={replay}
			aria-label="Replay entrance animation"
			title="Replay entrance animation"><Undo2 size={14} /><span>Replay</span></button
		>
		<button onclick={() => (visible = false)} aria-label="Hide design switcher"
			><X size={16} /></button
		>
	</aside>
{/if}

<style>
	.design-switcher {
		position: fixed;
		z-index: 40;
		bottom: max(18px, env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 15px;
		max-width: calc(100% - 24px);
		padding: 5px 6px 5px 18px;
		border: 1px solid #dedfd9;
		border-radius: 9px;
		background: #fff;
		color: #252a25;
		box-shadow: 0 5px 26px #00000013;
		font-family: 'Inter', Arial, sans-serif;
		font-size: 11px;
	}
	.switcher-label {
		color: #697168;
	}
	nav {
		display: flex;
		gap: 3px;
	}
	a,
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
	}
	a {
		gap: 7px;
		padding: 0 14px;
		border-radius: 5px;
		white-space: nowrap;
	}
	a span {
		font-size: 10px;
		color: #798174;
	}
	a[aria-current='page'] {
		background: #eef1e9;
		font-weight: 600;
	}
	a:hover {
		background: #f3f4f0;
	}
	button {
		width: 36px;
		color: #6d736d;
	}
	.replay {
		width: auto;
		gap: 6px;
		padding-inline: 10px;
		border-left: 1px solid #7774;
	}
	:global([data-direction='index']) .design-switcher {
		background: #171719;
		border-color: #353538;
		color: #efeff0;
	}
	:global([data-direction='index']) .switcher-label,
	:global([data-direction='index']) a span,
	:global([data-direction='index']) button {
		color: #a7a7ad;
	}
	:global([data-direction='index']) a:hover,
	:global([data-direction='index']) a[aria-current='page'] {
		background: #29292d;
	}
	@media (max-width: 540px) {
		.replay {
			padding-inline: 8px;
		}
		.replay span {
			display: none;
		}
		.design-switcher {
			padding-left: 5px;
			gap: 0;
		}
		.switcher-label {
			display: none;
		}
		a {
			padding-inline: 11px;
		}
		a span {
			display: none;
		}
	}
	@media (max-width: 360px) {
		a {
			padding-inline: 8px;
		}
		button {
			width: 32px;
			flex-shrink: 0;
		}
	}
</style>
