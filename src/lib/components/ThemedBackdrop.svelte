<script lang="ts">
	import { getBackgroundScene } from '$lib/kainbu/backgrounds';
	import type { BackgroundTheme } from '$lib/kainbu/types';

	export let theme: BackgroundTheme;
	export let imageUrl: string | null = null;

	$: scene = getBackgroundScene(theme, imageUrl || '');
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	<div class="absolute inset-0" style={scene.baseStyle}></div>
	<div class="absolute inset-0 bg-kainbu-grid" style={`opacity:${scene.gridOpacity};`}></div>
	<div
		class="absolute left-[-12%] top-[-12%] h-[34rem] w-[34rem] rounded-full blur-[140px]"
		style={`background:${scene.primaryGlow};`}
	></div>
	<div
		class="absolute bottom-[-18%] right-[-8%] h-[30rem] w-[30rem] rounded-full blur-[150px]"
		style={`background:${scene.secondaryGlow};`}
	></div>
</div>
