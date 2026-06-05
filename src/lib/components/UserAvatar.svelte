<script lang="ts">
	import { getAvatarInitial, getAvatarInitials } from '$lib/kainbu/avatar';

	export let src: string | null | undefined = null;
	export let label = '';
	export let initials: string | null = null;
	export let initialsMode: 'single' | 'double' = 'single';
	export let size: 'xs' | 'sm' | 'base' | 'lg' | 'md' = 'sm';
	export let variant: 'default' | 'primary' = 'default';

	const sizeClasses = {
		xs: 'h-3 w-3 text-[7px] leading-3',
		sm: 'h-4 w-4 text-[8px] leading-4',
		base: 'h-6 w-6 text-[10px] leading-none',
		lg: 'h-7 w-7 text-[10px] leading-none',
		md: 'h-16 w-16 text-xl leading-none'
	} as const;

	const variantClasses = {
		default: 'border-app-border bg-app-element text-app-subtext',
		primary: 'border-app-primary/40 bg-app-primary/20 text-app-primary'
	} as const;

	$: resolvedInitials =
		initials ??
		(initialsMode === 'double' ? getAvatarInitials(label, 2) : getAvatarInitial(label));
	$: sizeClass = sizeClasses[size];
	$: variantClass = variantClasses[variant];
</script>

{#if src}
	<img
		src={src}
		alt={label ? `${label} profile picture` : 'Profile picture'}
		class="shrink-0 rounded-full object-cover {sizeClass} {variant === 'primary'
			? 'border border-app-primary/40'
			: 'border border-app-border'}"
		loading="lazy"
		decoding="async"
	/>
{:else}
	<span
		class="inline-flex shrink-0 items-center justify-center rounded-full border font-bold {sizeClass} {variantClass}"
		aria-hidden="true"
	>
		{resolvedInitials}
	</span>
{/if}
