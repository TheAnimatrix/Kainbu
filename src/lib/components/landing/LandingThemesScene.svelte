<script lang="ts">
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import {
		BACKGROUND_GRADIENT_OPTIONS,
		getBackgroundSwatch,
		getChatOrbStyle
	} from '$lib/kainbu/backgrounds';
	import type { BackgroundTheme } from '$lib/kainbu/types';
	import { DEMO_THEME_IDS } from './demoData';

	const optionById = new Map(BACKGROUND_GRADIENT_OPTIONS.map((option) => [option.id, option]));

	const tiles = ['lagoon-veil', 'ember-haze', 'forest-glow'].map((id) => {
		const theme: BackgroundTheme = { kind: 'gradient', id };
		return {
			id,
			theme,
			label: optionById.get(id)?.label ?? id,
			orbStyle: getChatOrbStyle(theme, '', 'dark')
		};
	});

	const swatches = DEMO_THEME_IDS.map((id) => {
		const option = optionById.get(id);
		return {
			id,
			label: option?.label ?? id,
			swatch: option ? getBackgroundSwatch(option, 'dark') : ''
		};
	});
</script>

<div class="flex h-full w-full flex-col gap-3 overflow-hidden bg-app-bg p-3 text-app-text">
	<div class="grid min-h-0 flex-1 grid-cols-3 gap-2.5">
		{#each tiles as tile (tile.id)}
			<div class="relative overflow-hidden rounded-lg border border-app-border/80">
				<ThemedBackdrop theme={tile.theme} colorMode="dark" />
				<div class="relative flex h-full flex-col p-2">
					<span class="text-[10px] font-medium text-app-text/90">{tile.label}</span>
					<div class="mt-auto rounded-md border border-app-border/70 bg-app-surface/80 px-2 py-1.5 backdrop-blur-sm">
						<span class="text-[10px] leading-snug text-app-text">Reminder notifications v2</span>
					</div>
					<span
						class="orb-dot mt-2 self-end"
						style={tile.orbStyle}
						aria-hidden="true"
					></span>
				</div>
			</div>
		{/each}
	</div>

	<div class="flex items-center gap-1.5">
		{#each swatches as swatch (swatch.id)}
			<div class="flex items-center gap-1.5">
				<span
					class={`h-5 w-5 rounded-full border ${
						swatch.id === 'lagoon-veil'
							? 'border-app-text ring-2 ring-app-text/30'
							: 'border-app-border'
					}`}
					style={`background:${swatch.swatch};`}
					title={swatch.label}
				></span>
			</div>
		{/each}
		<span class="ml-1 text-[10px] text-app-subtext">Per-board background, recolors the assistant</span>
	</div>
</div>

<style>
	.orb-dot {
		height: 1.25rem;
		width: 1.25rem;
		border-radius: 9999px;
		background: rgb(var(--chat-orb-ball, 82 82 91));
		box-shadow:
			0 0 8px rgb(var(--chat-orb-primary, 113 113 122) / 0.7),
			0 0 16px rgb(var(--chat-orb-secondary, 161 161 170) / 0.4);
	}

	@media (prefers-reduced-motion: no-preference) {
		.orb-dot {
			animation: orb-dot-pulse 4.2s ease-in-out infinite;
		}
	}

	@keyframes orb-dot-pulse {
		0%,
		100% {
			transform: scale(0.92);
			opacity: 0.85;
		}
		50% {
			transform: scale(1.08);
			opacity: 1;
		}
	}
</style>
