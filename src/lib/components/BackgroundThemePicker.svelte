<script lang="ts">
	import BackgroundHslPicker from '$lib/components/BackgroundHslPicker.svelte';
	import BackgroundSwatch from '$lib/components/BackgroundSwatch.svelte';
	import { ChevronDown } from '$lib/icons';
	import {
		BACKGROUND_GRADIENT_OPTIONS,
		getBackgroundImagePreviewStyle,
		getBackgroundSwatch,
		getBackgroundThemeKey,
		getBackgroundThemeLabel,
		getBackgroundThemeSwatch,
		getDefaultBackgroundSwatch,
		getDefaultBackgroundThemeForColorMode
	} from '$lib/kainbu/backgrounds';
	import type { BackgroundTheme, ColorMode } from '$lib/kainbu/types';

	export let colorMode: ColorMode = 'dark';
	export let currentTheme: BackgroundTheme | null | undefined = null;
	export let imageUrl: string | null = null;
	export let imageUploading = false;
	export let mode: 'personal' | 'board' = 'personal';
	export let inheritPreviewTheme: BackgroundTheme | null = null;
	export let inheritPreviewImageUrl: string | null = null;
	export let onSelect: (theme: BackgroundTheme) => void;
	export let onUpload: () => void;
	export let onInherit: (() => void) | null = null;

	let expanded = false;

	const gradientTheme = (id: string): BackgroundTheme => ({
		kind: 'gradient',
		id
	});

	const isSelected = (
		candidate: BackgroundTheme | null | undefined,
		nextTheme: BackgroundTheme
	) => getBackgroundThemeKey(candidate) === getBackgroundThemeKey(nextTheme);

	const close = () => {
		expanded = false;
	};

	const selectTheme = (theme: BackgroundTheme) => {
		onSelect(theme);
		close();
	};

	const selectInherit = () => {
		onInherit?.();
		close();
	};

	$: defaultTheme = getDefaultBackgroundThemeForColorMode(colorMode);
	$: defaultSwatch = getDefaultBackgroundSwatch(colorMode);
	$: activeTheme =
		mode === 'board' && !currentTheme && inheritPreviewTheme ? inheritPreviewTheme : currentTheme;
	$: activeImageUrl =
		mode === 'board' && !currentTheme ? (inheritPreviewImageUrl ?? '') : (imageUrl ?? '');
	$: activePreview = getBackgroundThemeSwatch(
		activeTheme ?? defaultTheme,
		colorMode,
		activeImageUrl
	);
	$: activeLabel =
		mode === 'board' && !currentTheme
			? 'Personal'
			: getBackgroundThemeLabel(currentTheme, colorMode);
	$: inheritPreview = inheritPreviewTheme
		? getBackgroundThemeSwatch(inheritPreviewTheme, colorMode, inheritPreviewImageUrl ?? '')
		: null;
</script>

<div class="kainbu-bg-picker">
	<button
		type="button"
		class="kainbu-bg-picker__trigger"
		aria-expanded={expanded}
		aria-haspopup="listbox"
		on:click={() => (expanded = !expanded)}
	>
		<span
			class="kainbu-bg-picker__preview"
			style={activePreview.previewStyle}
			aria-hidden="true"
		>
			{#if activePreview.swatch}
				<span class="absolute inset-0" style={`background:${activePreview.swatch}`}></span>
			{/if}
		</span>
		<span class="kainbu-bg-picker__label">{activeLabel}</span>
		{#if imageUploading}
			<span class="kainbu-bg-picker__spinner" aria-hidden="true"></span>
		{:else}
			<ChevronDown
				size={14}
				class={`kainbu-bg-picker__chevron shrink-0 opacity-60 ${expanded ? 'rotate-180' : ''}`}
			/>
		{/if}
	</button>

	{#if expanded}
		<div class="kainbu-bg-picker__panel" role="listbox" aria-label="Background presets">
			<div class="kainbu-bg-picker__grid">
				{#if mode === 'board' && onInherit && inheritPreview}
					<BackgroundSwatch
						size="xs"
						swatch={inheritPreview.swatch}
						previewStyle={inheritPreview.previewStyle}
						selected={!currentTheme}
						ariaLabel="Use personal background for this board"
						title="Personal"
						on:click={selectInherit}
					/>
				{:else if mode === 'personal'}
					<BackgroundSwatch
						size="xs"
						swatch={defaultSwatch}
						selected={isSelected(currentTheme, defaultTheme)}
						ariaLabel="Use default personal background"
						title="Default"
						on:click={() => selectTheme(defaultTheme)}
					/>
				{/if}

				{#each BACKGROUND_GRADIENT_OPTIONS as option (option.id)}
					{@const theme = gradientTheme(option.id)}
					<BackgroundSwatch
						size="xs"
						swatch={getBackgroundSwatch(option, colorMode)}
						selected={isSelected(currentTheme, theme)}
						ariaLabel={`Use ${option.label} gradient`}
						title={option.label}
						on:click={() => selectTheme(theme)}
					/>
				{/each}
			</div>

			<div class="kainbu-bg-picker__custom">
				<BackgroundHslPicker
					{colorMode}
					{currentTheme}
					compact
					on:change={(event) => onSelect(event.detail)}
				/>
				<BackgroundSwatch
					size="xs"
					variant="image"
					previewStyle={getBackgroundImagePreviewStyle(imageUrl, colorMode)}
					selected={currentTheme?.kind === 'image'}
					ariaLabel={currentTheme?.kind === 'image'
						? 'Uploaded image selected'
						: 'Upload background image'}
					title={currentTheme?.kind === 'image' ? 'Uploaded image' : 'Upload image'}
					on:click={onUpload}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	.kainbu-bg-picker {
		margin-top: 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 82%, transparent);
		background: color-mix(in oklab, var(--color-app-bg) 88%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 5%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 8%, transparent);
	}

	.kainbu-bg-picker__trigger {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.625rem;
		padding: 0.45rem 0.625rem;
		border: none;
		background: transparent;
		color: var(--color-app-text);
		text-align: left;
		cursor: pointer;
		transition: background-color 0.16s ease;
	}

	.kainbu-bg-picker__trigger:hover {
		background: color-mix(in oklab, var(--color-app-element) 35%, transparent);
	}

	.kainbu-bg-picker__trigger:focus-visible {
		outline: 2px solid color-mix(in oklab, var(--color-app-primary) 70%, white);
		outline-offset: -2px;
	}

	.kainbu-bg-picker__preview {
		position: relative;
		height: 1.75rem;
		width: 1.75rem;
		flex-shrink: 0;
		overflow: hidden;
		border-radius: 0.4rem;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-app-border) 70%, transparent);
	}

	.kainbu-bg-picker__label {
		min-width: 0;
		flex: 1;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-app-text);
	}


	.kainbu-bg-picker__spinner {
		display: block;
		height: 0.875rem;
		width: 0.875rem;
		border-radius: 999px;
		border: 2px solid color-mix(in oklab, currentColor 25%, transparent);
		border-top-color: currentColor;
		animation: kainbu-bg-picker-spin 0.75s linear infinite;
	}

	.kainbu-bg-picker__panel {
		border-top: 1px solid color-mix(in oklab, var(--color-app-border) 72%, transparent);
		padding: 0.55rem 0.625rem 0.625rem;
	}

	.kainbu-bg-picker__grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.kainbu-bg-picker__custom {
		display: flex;
		align-items: stretch;
		gap: 0.375rem;
		margin-top: 0.5rem;
	}

	@keyframes kainbu-bg-picker-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
