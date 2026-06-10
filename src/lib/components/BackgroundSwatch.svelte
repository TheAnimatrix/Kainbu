<script lang="ts">
	import { Check, ImageUp } from '$lib/icons';
	import { createEventDispatcher } from 'svelte';

	export let swatch: string | null = null;
	export let previewStyle: string | undefined = undefined;
	export let selected = false;
	export let size: 'lg' | 'sm' | 'xs' = 'lg';
	export let variant: 'color' | 'image' = 'color';
	export let ariaLabel = '';
	export let title = '';

	const dispatch = createEventDispatcher<{ click: void }>();
</script>

<button
	type="button"
	class={`kainbu-bg-swatch relative shrink-0 overflow-hidden rounded-lg transition ${size === 'lg' ? 'h-12 w-12 sm:h-14 sm:w-14' : size === 'sm' ? 'h-10 w-10 sm:h-12 sm:w-12' : 'h-8 w-8'} ${variant === 'image' ? 'kainbu-bg-swatch--image' : ''} ${selected ? 'kainbu-bg-swatch--selected' : 'kainbu-bg-swatch--idle'}`}
	style={previewStyle}
	aria-label={ariaLabel}
	{title}
	on:click={() => dispatch('click')}
>
	{#if swatch}
		<span class="absolute inset-0" style={`background:${swatch}`} aria-hidden="true"></span>
	{/if}
	{#if variant === 'image'}
		<span class="kainbu-bg-swatch__image-overlay absolute inset-0 inline-flex items-center justify-center">
			<ImageUp size={14} />
		</span>
	{/if}
	{#if selected}
		<span
			class={`absolute inline-flex items-center justify-center rounded-full bg-black/40 text-white ${size === 'lg' ? 'right-1 top-1 h-4 w-4' : size === 'sm' ? 'right-0.5 top-0.5 h-3.5 w-3.5' : 'right-0 top-0 h-3 w-3'}`}
		>
			<Check size={size === 'lg' ? 10 : size === 'sm' ? 9 : 8} />
		</span>
	{/if}
</button>
