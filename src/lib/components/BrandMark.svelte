<script lang="ts">
	export let size = 44;
	export let alt = '';
	export let className = '';
	export let framed = true;
</script>

<span
	class={`brand-mark ${framed ? 'brand-mark--framed' : ''} ${className}`}
	style={`--brand-mark-size:${size}px;`}
>
	<svg
		class="brand-mark__image"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="290 100 220 220"
		role={alt ? 'img' : 'presentation'}
		aria-label={alt || undefined}
		aria-hidden={alt ? undefined : true}
	>
		<polygon class="brand-mark__accent" points="290,100 400,100 400,210" />
		<polygon class="brand-mark__accent-dark" points="290,100 290,210 400,210" />
		<polygon class="brand-mark__gray" points="400,100 510,100 400,210" fill="#636363" />
		<polygon class="brand-mark__gray-dark" points="290,210 400,210 400,320" fill="#454545" />
		<polygon class="brand-mark__gray-darker" points="290,210 290,320 400,320" fill="#3a3a3a" />
		<polygon class="brand-mark__accent" points="400,210 510,320 400,320" />
		<polygon class="brand-mark__gray-mid" points="348,158 400,100 400,210" fill="#4a4a4a" />
		<polygon class="brand-mark__accent-darker" points="452,262 400,210 400,320" />
		<polygon
			class="brand-mark__gray-darker"
			points="290,320 400,320 290,210"
			fill="#3a3a3a"
			opacity="0.3"
		/>
	</svg>
</span>

<style>
	.brand-mark {
		display: inline-flex;
		height: var(--brand-mark-size);
		width: var(--brand-mark-size);
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.brand-mark__image {
		height: 68%;
		width: 68%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
	}

	.brand-mark__accent {
		fill: var(--color-app-accent);
	}

	.brand-mark__accent-dark {
		fill: var(--color-app-primary-hover);
	}

	.brand-mark__accent-darker {
		fill: color-mix(in srgb, var(--color-app-primary-hover) 72%, #000);
	}
</style>
