<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		aspect?: string;
		label?: string;
		class?: string;
		children: Snippet;
	}

	let { aspect = '16 / 10', label, class: className = '', children }: Props = $props();
</script>

<figure
	class={`landing-scene ${className}`}
	style={`--scene-aspect: ${aspect};`}
	aria-label={label}
	aria-hidden={label ? undefined : true}
>
	<div class="landing-scene__frame">
		{@render children()}
	</div>
</figure>

<style>
	.landing-scene {
		margin: 0;
		min-width: 0;
	}

	.landing-scene__frame {
		position: relative;
		overflow: hidden;
		aspect-ratio: var(--scene-aspect);
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 90%, transparent);
		background: var(--color-app-bg);
		box-shadow: var(--shadow-kainbu-xl);
		pointer-events: none;
		user-select: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.landing-scene__frame {
			animation: landing-scene-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
	}

	@keyframes landing-scene-enter {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
