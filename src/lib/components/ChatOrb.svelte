<script lang="ts">
	import { browser } from '$app/environment';
	import { MessageSquare } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';

	export let style = '';

	const dispatch = createEventDispatcher<{ click: void; exitComplete: void }>();

	let bouncing = false;

	const prefersReducedMotion = () =>
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const handleClick = () => {
		if (bouncing) return;

		dispatch('click');

		if (prefersReducedMotion()) {
			dispatch('exitComplete');
			return;
		}

		bouncing = true;
	};

	const handleAnimationEnd = (event: AnimationEvent) => {
		if (event.animationName !== 'chat-orb-open-bounce' || !bouncing) return;
		bouncing = false;
		dispatch('exitComplete');
	};
</script>

<div class="chat-orb-anchor" {style}>
	<button
		type="button"
		class="chat-orb group"
		class:chat-orb--bounce={bouncing}
		aria-label="Open chat sidebar"
		title="Open chat sidebar"
		on:click={handleClick}
		on:animationend={handleAnimationEnd}
	>
		<span class="chat-orb__icons" aria-hidden="true">
			<MessageSquare class="chat-orb__icon" size={20} strokeWidth={2} />
		</span>
		<div class="chat-orb__ball" aria-hidden="true">
			<div class="chat-orb__gooey">
				<div class="chat-orb__lines"></div>
				<div class="chat-orb__rings"></div>
			</div>
		</div>
		<svg class="chat-orb__filters" aria-hidden="true">
			<filter id="chat-orb-gooey">
				<feGaussianBlur in="SourceGraphic" stdDeviation="5" />
				<feColorMatrix
					values="1 0 0 0 0
					0 1 0 0 0
					0 0 1 0 0
					0 0 0 20 -10"
				/>
			</filter>
		</svg>
	</button>
</div>
