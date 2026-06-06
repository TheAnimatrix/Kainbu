<script lang="ts">
	type ShotFit = 'cover' | 'contain-top';

	interface Props {
		src: string;
		alt: string;
		priority?: boolean;
		fit?: ShotFit;
		aspect?: string;
		class?: string;
	}

	let {
		src,
		alt,
		priority = false,
		fit = 'cover',
		aspect = '16 / 10',
		class: className = ''
	}: Props = $props();
</script>

<figure class={`landing-product-shot ${className}`}>
	<div
		class="landing-product-shot__frame"
		class:landing-product-shot__frame--contain-top={fit === 'contain-top'}
		style={`--shot-aspect: ${aspect};`}
	>
		<img
			{src}
			{alt}
			width="1520"
			height="1080"
			class="landing-product-shot__img"
			loading={priority ? 'eager' : 'lazy'}
			fetchpriority={priority ? 'high' : 'auto'}
			decoding="async"
		/>
	</div>
</figure>

<style>
	.landing-product-shot {
		margin: 0;
	}

	.landing-product-shot__frame {
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 90%, transparent);
		background: var(--color-app-surface);
		box-shadow: var(--shadow-kainbu-xl);
		aspect-ratio: var(--shot-aspect);
	}

	.landing-product-shot__img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: left top;
	}

	.landing-product-shot__frame--contain-top .landing-product-shot__img {
		object-fit: contain;
		object-position: top center;
		background: var(--color-app-bg);
	}

	@media (prefers-reduced-motion: no-preference) {
		.landing-product-shot__frame {
			animation: landing-shot-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
	}

	@keyframes landing-shot-enter {
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
