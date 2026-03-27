<script lang="ts">
	import brandIconUrl from '../../../assets/icon.svg';

	export let size = 44;
	export let alt = '';
	export let className = '';
	export let framed = true;
</script>

<span
	class={`brand-mark ${framed ? 'brand-mark--framed' : ''} ${className}`}
	style={`--brand-mark-size:${size}px;`}
>
	<img class="brand-mark__image" src={brandIconUrl} {alt} />
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

	.brand-mark--framed {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: calc(var(--brand-mark-size) * 0.24);
		background: #2d2d2d;
		box-shadow: 0 18px 42px -24px rgba(0, 0, 0, 0.72);
	}

	.brand-mark__image {
		height: 68%;
		width: 68%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
	}
</style>
