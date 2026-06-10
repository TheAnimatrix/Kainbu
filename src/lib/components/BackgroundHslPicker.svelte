<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		applyThemeAccent,
		customHslSolidTheme,
		getBackgroundThemeKey,
		isCustomHslSolidId,
		resolveCustomHslFromTheme
	} from '$lib/kainbu/backgrounds';
	import type { BackgroundTheme, ColorMode } from '$lib/kainbu/types';

	export let colorMode: ColorMode = 'dark';
	export let currentTheme: BackgroundTheme | null | undefined = null;
	export let compact = false;

	const dispatch = createEventDispatcher<{ change: BackgroundTheme }>();

	type Hsl = { h: number; s: number; l: number };

	let hsl: Hsl = resolveCustomHslFromTheme(currentTheme, colorMode);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	$: selected =
		currentTheme?.kind === 'solid' && isCustomHslSolidId(currentTheme.id);
	$: previewStyle = `background: hsl(${hsl.h} ${hsl.s}% ${hsl.l}%);`;
	$: hueTrack = `linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))`;
	$: saturationTrack = `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`;
	$: lightnessTrack = `linear-gradient(to right, hsl(${hsl.h} ${hsl.s}% 0%), hsl(${hsl.h} ${hsl.s}% 50%), hsl(${hsl.h} ${hsl.s}% 100%))`;

	let syncKey = '';
	$: {
		const nextKey = `${getBackgroundThemeKey(currentTheme)}:${colorMode}`;
		if (nextKey !== syncKey) {
			syncKey = nextKey;
			hsl = resolveCustomHslFromTheme(currentTheme, colorMode);
		}
	}

	const scheduleChange = () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			dispatch('change', customHslSolidTheme(hsl.h, hsl.s, hsl.l));
		}, 160);
	};

	const previewAccent = () => {
		applyThemeAccent(customHslSolidTheme(hsl.h, hsl.s, hsl.l), '', colorMode);
	};

	const updateHsl = (patch: Partial<Hsl>) => {
		hsl = {
			h: patch.h ?? hsl.h,
			s: patch.s ?? hsl.s,
			l: patch.l ?? hsl.l
		};
		previewAccent();
		scheduleChange();
	};
</script>

<div
	class={`kainbu-hsl-picker ${compact ? 'kainbu-hsl-picker--compact' : ''} ${selected ? 'kainbu-hsl-picker--selected' : ''}`}
	role="group"
	aria-label="Custom HSL background"
>
	<div
		class="kainbu-hsl-picker__preview"
		style={previewStyle}
		aria-hidden="true"
		title="Custom color preview"
	></div>

	<div class="kainbu-hsl-picker__sliders">
		<label class="kainbu-hsl-picker__field">
			<span class="kainbu-hsl-picker__label">Hue</span>
			<input
				class="kainbu-hsl-picker__range kainbu-hsl-picker__range--hue"
				type="range"
				min="0"
				max="360"
				step="1"
				value={hsl.h}
				style={`--track:${hueTrack}`}
				on:input={(event) => updateHsl({ h: Number(event.currentTarget.value) })}
			/>
		</label>
		<label class="kainbu-hsl-picker__field">
			<span class="kainbu-hsl-picker__label">Saturation</span>
			<input
				class="kainbu-hsl-picker__range"
				type="range"
				min="0"
				max="100"
				step="1"
				value={hsl.s}
				style={`--track:${saturationTrack}`}
				on:input={(event) => updateHsl({ s: Number(event.currentTarget.value) })}
			/>
		</label>
		<label class="kainbu-hsl-picker__field">
			<span class="kainbu-hsl-picker__label">Lightness</span>
			<input
				class="kainbu-hsl-picker__range"
				type="range"
				min="0"
				max="100"
				step="1"
				value={hsl.l}
				style={`--track:${lightnessTrack}`}
				on:input={(event) => updateHsl({ l: Number(event.currentTarget.value) })}
			/>
		</label>
	</div>
</div>

<style>
	.kainbu-hsl-picker {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: stretch;
		gap: 0.75rem;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 82%, transparent);
		background: color-mix(in oklab, var(--color-app-element) 42%, transparent);
		padding: 0.625rem 0.75rem;
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 6%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 8%, transparent);
		transition:
			border-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	.kainbu-hsl-picker--selected {
		border-color: color-mix(in oklab, var(--color-app-primary) 55%, var(--color-app-border));
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-app-primary) 28%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 8%, transparent);
	}

	.kainbu-hsl-picker__preview {
		height: 2.75rem;
		width: 2.75rem;
		flex-shrink: 0;
		align-self: center;
		border-radius: 0.625rem;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-app-border) 70%, transparent);
	}

	.kainbu-hsl-picker__sliders {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 0.55rem;
	}

	.kainbu-hsl-picker__field {
		display: grid;
		grid-template-columns: 4.75rem minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}

	.kainbu-hsl-picker__label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-app-subtext);
	}

	.kainbu-hsl-picker__range {
		appearance: none;
		width: 100%;
		height: 0.45rem;
		border-radius: 999px;
		background: var(--track);
		outline: none;
	}

	.kainbu-hsl-picker__range::-webkit-slider-thumb {
		appearance: none;
		height: 0.9rem;
		width: 0.9rem;
		border-radius: 999px;
		border: 2px solid rgb(255 255 255 / 0.92);
		background: var(--color-app-text);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.28);
	}

	.kainbu-hsl-picker__range::-moz-range-thumb {
		height: 0.9rem;
		width: 0.9rem;
		border-radius: 999px;
		border: 2px solid rgb(255 255 255 / 0.92);
		background: var(--color-app-text);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.28);
	}

	.kainbu-hsl-picker__range:focus-visible {
		outline: 2px solid color-mix(in oklab, var(--color-app-primary) 70%, white);
		outline-offset: 2px;
	}

	.kainbu-hsl-picker--compact {
		gap: 0.5rem;
		padding: 0.45rem 0.55rem;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__preview {
		height: 2rem;
		width: 2rem;
		border-radius: 0.5rem;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__sliders {
		gap: 0.55rem;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__field {
		grid-template-columns: minmax(0, 1fr);
		gap: 0;
		padding-block: 0.1rem;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__label {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__range {
		height: 0.35rem;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__range::-webkit-slider-thumb {
		height: 0.75rem;
		width: 0.75rem;
	}

	.kainbu-hsl-picker--compact .kainbu-hsl-picker__range::-moz-range-thumb {
		height: 0.75rem;
		width: 0.75rem;
	}
</style>
