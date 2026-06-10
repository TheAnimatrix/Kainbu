<script lang="ts">
	import Icon from '@iconify/svelte';
	import { FLUENT_ICON_MAP, type FluentIconName } from '$lib/icons/fluent-map';
	import { registerFluentIcons } from '$lib/icons/register';
	import type { FluentIconProps } from '$lib/icons/types';

	registerFluentIcons();

	let {
		name,
		size = 24,
		class: className = '',
		strokeWidth: _strokeWidth,
		title,
		'aria-label': ariaLabel,
		'aria-hidden': ariaHidden
	}: FluentIconProps & { name: FluentIconName } = $props();

	const iconId = $derived(`fluent:${FLUENT_ICON_MAP[name]}`);
	const dimension = $derived(typeof size === 'number' ? size : Number.parseFloat(String(size)) || 24);
</script>

{#if title}
	<span {title} class="inline-flex">
		<Icon
			icon={iconId}
			width={dimension}
			height={dimension}
			class={className}
			aria-label={ariaLabel ?? title}
			aria-hidden={ariaHidden}
		/>
	</span>
{:else}
	<Icon
		icon={iconId}
		width={dimension}
		height={dimension}
		class={className}
		aria-label={ariaLabel}
		aria-hidden={ariaHidden}
	/>
{/if}
