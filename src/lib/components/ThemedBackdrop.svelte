<script lang="ts">
	import { fade } from 'svelte/transition';
	import { getBackgroundScene, getBackgroundThemeKey } from '$lib/kainbu/backgrounds';
	import type { BackgroundTheme, ColorMode } from '$lib/kainbu/types';

	export let theme: BackgroundTheme;
	export let imageUrl: string | null = null;
	export let colorMode: ColorMode = 'dark';

	const backdropFadeIn = { duration: 280 };
	const backdropFadeOut = { duration: 220 };

	$: sceneKey = `${getBackgroundThemeKey(theme)}::${imageUrl || ''}::${colorMode}`;
	$: scene = getBackgroundScene(theme, imageUrl || '', colorMode);
	$: showGrid = scene.gridOpacity > 0;
	$: showPrimaryGlow = scene.primaryGlow !== 'transparent';
	$: showSecondaryGlow = scene.secondaryGlow !== 'transparent';
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	{#key sceneKey}
		<div
			class="absolute inset-0 motion-reduce:transition-none"
			in:fade={backdropFadeIn}
			out:fade={backdropFadeOut}
		>
			<div class="absolute inset-0" style={scene.baseStyle}></div>
			{#if showGrid}
				<div class="absolute inset-0 bg-kainbu-grid" style={`opacity:${scene.gridOpacity};`}></div>
			{/if}
			{#if showPrimaryGlow}
				<div
					class="absolute left-[-12%] top-[-12%] h-[34rem] w-[34rem] rounded-full blur-[140px]"
					style={`background:${scene.primaryGlow};`}
				></div>
			{/if}
			{#if showSecondaryGlow}
				<div
					class="absolute bottom-[-18%] right-[-8%] h-[30rem] w-[30rem] rounded-full blur-[150px]"
					style={`background:${scene.secondaryGlow};`}
				></div>
			{/if}
		</div>
	{/key}
</div>
