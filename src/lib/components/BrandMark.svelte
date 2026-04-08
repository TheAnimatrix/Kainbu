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
	
	.brand-mark__image {
		height: 68%;
		width: 68%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
	}
</style>
