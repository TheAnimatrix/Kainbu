<script lang="ts">
	import joinMark from '../../../assets/icon.svg?raw';

	export let size = 44;
	export let alt = '';
	export let className = '';
	export let framed = true;
</script>

<span
	class={`brand-mark ${framed ? 'brand-mark--framed' : ''} ${className}`}
	style={`--brand-mark-size:${size}px;`}
	role={alt ? 'img' : undefined}
	aria-label={alt || undefined}
	aria-hidden={alt ? undefined : true}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- Trusted, repository-owned SVG imported at build time. No user content. -->
	{@html joinMark}
</span>

<style>
	.brand-mark {
		display: inline-flex;
		height: var(--brand-mark-size);
		width: var(--brand-mark-size);
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: inherit;
	}
	.brand-mark :global(svg) {
		height: 78%;
		width: 78%;
		user-select: none;
		pointer-events: none;
	}
</style>
