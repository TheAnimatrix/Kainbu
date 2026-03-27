<script lang="ts">
	import { Check, ImageUp, RefreshCcw, Trash2 } from 'lucide-svelte';
	import {
		BACKGROUND_GRADIENT_OPTIONS,
		BACKGROUND_SOLID_OPTIONS,
		getBackgroundImagePreviewStyle,
		getBackgroundThemeKey
	} from '$lib/kainbu/backgrounds';
	import type { BackgroundTheme, Project, UserSettings } from '$lib/kainbu/types';

	export let settings: UserSettings;
	export let currentProject: Project | null = null;
	export let personalImageUrl: string | null = null;
	export let boardImageUrl: string | null = null;
	export let personalImageUploading = false;
	export let boardImageUploading = false;
	export let onSettingsChange: (nextSettings: UserSettings) => void;
	export let onSelectPersonalBackground: (theme: BackgroundTheme) => void;
	export let onUploadPersonalBackground: (file: File) => void | Promise<void>;
	export let onSelectBoardBackground: (theme: BackgroundTheme) => void;
	export let onUploadBoardBackground: (file: File) => void | Promise<void>;
	export let onClearBoardBackground: () => void;

	let personalUploadInput: HTMLInputElement | null = null;
	let boardUploadInput: HTMLInputElement | null = null;

	const gradientTheme = (id: string): BackgroundTheme => ({
		kind: 'gradient',
		id
	});

	const solidTheme = (id: string): BackgroundTheme => ({
		kind: 'solid',
		id
	});

	const isSelected = (
		currentTheme: BackgroundTheme | null | undefined,
		nextTheme: BackgroundTheme
	) => getBackgroundThemeKey(currentTheme) === getBackgroundThemeKey(nextTheme);

	const readSelectedFile = (event: Event, handler: (file: File) => void | Promise<void>) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			void handler(file);
		}
		input.value = '';
	};
</script>

<section
	class="absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5"
>
	<div class="mx-auto flex min-w-0 max-w-6xl flex-col gap-4">
		<div
			class="overflow-hidden rounded-xl border border-app-border bg-app-surface/88 shadow-kainbu-xl sm:rounded-[1.8rem]"
		>
			<div class="border-b border-app-border px-4 py-4 sm:px-5 sm:py-5">
				<p class="text-[10px] font-bold uppercase tracking-[0.32em] text-app-primary">Settings</p>
				<h2 class="mt-1.5 font-display text-xl font-bold tracking-tight text-app-text sm:mt-2 sm:text-3xl">
					Shape the workspace atmosphere
				</h2>
				<p class="mt-1.5 max-w-2xl text-xs leading-relaxed text-app-subtext sm:mt-2 sm:text-sm">
					Choose the look you want across devices, then optionally give the current board its own
					shared backdrop.
				</p>
			</div>

			<div class="grid gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 lg:grid-cols-[1.15fr_0.85fr] lg:px-5 lg:py-5">
				<div class="space-y-4">
					<div class="rounded-xl border border-app-border bg-app-bg/60 p-3 sm:rounded-[1.45rem] sm:p-4">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p class="text-sm font-semibold text-app-text">Personal background</p>
								<p class="mt-1 text-sm text-app-subtext">
									Used on login, dashboard, settings, and anywhere a board does not override it.
								</p>
							</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-app-border bg-app-element text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
									on:click={() => personalUploadInput?.click()}
									aria-label={personalImageUploading
										? 'Uploading personal background image'
										: settings.backgroundTheme.kind === 'image'
											? 'Replace personal background image'
											: 'Upload personal background image'}
									title={settings.backgroundTheme.kind === 'image'
										? 'Replace image'
										: 'Upload image'}
								>
									{#if personalImageUploading}
										<span
											class="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current"
										></span>
									{:else}
										<ImageUp size={18} />
									{/if}
								</button>
							</div>
						</div>

						<div class="mt-4 flex flex-wrap gap-3">
							{#each BACKGROUND_GRADIENT_OPTIONS as option (option.id)}
								{@const theme = gradientTheme(option.id)}
								<button
									type="button"
									class={`relative h-14 w-14 rounded-[1rem] border transition sm:h-16 sm:w-16 ${
										isSelected(settings.backgroundTheme, theme)
											? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
											: 'border-app-border hover:border-app-primary/35'
									}`}
									style={`background:${option.swatch};`}
									aria-label={`Use ${option.label} gradient`}
									title={option.label}
									on:click={() => onSelectPersonalBackground(theme)}
								>
									{#if isSelected(settings.backgroundTheme, theme)}
										<span
											class="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white"
										>
											<Check size={12} />
										</span>
									{/if}
								</button>
							{/each}
						</div>

						<div class="mt-3 flex flex-wrap gap-3">
							{#each BACKGROUND_SOLID_OPTIONS as option (option.id)}
								{@const theme = solidTheme(option.id)}
								<button
									type="button"
									class={`relative h-12 w-12 rounded-[0.9rem] border transition sm:h-14 sm:w-14 ${
										isSelected(settings.backgroundTheme, theme)
											? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
											: 'border-app-border hover:border-app-primary/35'
									}`}
									style={`background:${option.swatch};`}
									aria-label={`Use ${option.label} solid color`}
									title={option.label}
									on:click={() => onSelectPersonalBackground(theme)}
								>
									{#if isSelected(settings.backgroundTheme, theme)}
										<span
											class="absolute right-1 top-1 inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full bg-black/45 text-white"
										>
											<Check size={11} />
										</span>
									{/if}
								</button>
							{/each}

							<button
								type="button"
								class={`relative h-12 w-12 rounded-[0.9rem] border border-dashed transition sm:h-14 sm:w-14 ${
									settings.backgroundTheme.kind === 'image'
										? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
										: 'border-app-border hover:border-app-primary/35'
								}`}
								style={getBackgroundImagePreviewStyle(personalImageUrl)}
								aria-label={settings.backgroundTheme.kind === 'image'
									? 'Personal uploaded image selected'
									: 'Upload personal background image'}
								title={settings.backgroundTheme.kind === 'image'
									? 'Uploaded image'
									: 'Upload image'}
								on:click={() => personalUploadInput?.click()}
							>
								<span
									class="absolute inset-0 inline-flex items-center justify-center rounded-[0.8rem] bg-black/18 text-white"
								>
									<ImageUp size={16} />
								</span>
							</button>
						</div>
					</div>

					{#if currentProject}
						<div class="rounded-xl border border-app-border bg-app-bg/60 p-3 sm:rounded-[1.45rem] sm:p-4">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p class="text-sm font-semibold text-app-text">Current board background</p>
									<p class="mt-1 text-sm text-app-subtext">
										Shared with everyone on <span class="font-semibold text-app-text">
											{currentProject.name}
										</span> and shown on Kanban, notes, and chat.
									</p>
								</div>
								<div class="flex gap-2">
									<button
										type="button"
										class="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-app-border bg-app-element text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
										on:click={() => boardUploadInput?.click()}
										aria-label={boardImageUploading
											? 'Uploading board background image'
											: currentProject.backgroundTheme?.kind === 'image'
												? 'Replace board background image'
												: 'Upload board background image'}
										title={currentProject.backgroundTheme?.kind === 'image'
											? 'Replace image'
											: 'Upload image'}
									>
										{#if boardImageUploading}
											<span
												class="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current"
											></span>
										{:else}
											<ImageUp size={18} />
										{/if}
									</button>
									<button
										type="button"
										class="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-app-border bg-app-element text-app-subtext transition hover:border-rose-500/35 hover:text-rose-300"
										on:click={onClearBoardBackground}
										aria-label="Clear board background override"
										title="Clear override"
									>
										<Trash2 size={18} />
									</button>
								</div>
							</div>

							<div class="mt-4 flex flex-wrap gap-3">
								{#each BACKGROUND_GRADIENT_OPTIONS as option (option.id)}
									{@const theme = gradientTheme(option.id)}
									<button
										type="button"
										class={`relative h-14 w-14 rounded-[1rem] border transition sm:h-16 sm:w-16 ${
											isSelected(currentProject.backgroundTheme, theme)
												? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
												: 'border-app-border hover:border-app-primary/35'
										}`}
										style={`background:${option.swatch};`}
										aria-label={`Set board background to ${option.label}`}
										title={option.label}
										on:click={() => onSelectBoardBackground(theme)}
									>
										{#if isSelected(currentProject.backgroundTheme, theme)}
											<span
												class="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white"
											>
												<Check size={12} />
											</span>
										{/if}
									</button>
								{/each}
							</div>

							<div class="mt-3 flex flex-wrap gap-3">
								{#each BACKGROUND_SOLID_OPTIONS as option (option.id)}
									{@const theme = solidTheme(option.id)}
									<button
										type="button"
										class={`relative h-12 w-12 rounded-[0.9rem] border transition sm:h-14 sm:w-14 ${
											isSelected(currentProject.backgroundTheme, theme)
												? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
												: 'border-app-border hover:border-app-primary/35'
										}`}
										style={`background:${option.swatch};`}
										aria-label={`Set board background to ${option.label}`}
										title={option.label}
										on:click={() => onSelectBoardBackground(theme)}
									>
										{#if isSelected(currentProject.backgroundTheme, theme)}
											<span
												class="absolute right-1 top-1 inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full bg-black/45 text-white"
											>
												<Check size={11} />
											</span>
										{/if}
									</button>
								{/each}

								<button
									type="button"
									class={`relative h-12 w-12 rounded-[0.9rem] border border-dashed transition sm:h-14 sm:w-14 ${
										currentProject.backgroundTheme?.kind === 'image'
											? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
											: 'border-app-border hover:border-app-primary/35'
									}`}
									style={getBackgroundImagePreviewStyle(boardImageUrl)}
									aria-label={currentProject.backgroundTheme?.kind === 'image'
										? 'Board uploaded image selected'
										: 'Upload board background image'}
									title={currentProject.backgroundTheme?.kind === 'image'
										? 'Uploaded image'
										: 'Upload image'}
									on:click={() => boardUploadInput?.click()}
								>
									<span
										class="absolute inset-0 inline-flex items-center justify-center rounded-[0.8rem] bg-black/18 text-white"
									>
										<ImageUp size={16} />
									</span>
								</button>
							</div>

							{#if !currentProject.backgroundTheme}
								<div
									class="mt-3 inline-flex items-center gap-2 rounded-full border border-app-border bg-app-element/70 px-3 py-1.5 text-xs font-semibold text-app-subtext"
								>
									<RefreshCcw size={12} />
									Falling back to your personal background
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<div class="space-y-4">
					<div class="rounded-xl border border-app-border bg-app-bg/60 p-3 sm:rounded-[1.45rem] sm:p-4">
						<p class="text-sm font-semibold text-app-text">Task defaults</p>
						<label
							class="mt-3 flex items-center justify-between gap-3 rounded-xl border border-app-border bg-app-element/60 px-3 py-2.5 sm:mt-4 sm:rounded-[1rem] sm:px-4 sm:py-3"
						>
							<div>
								<p class="text-sm font-semibold text-app-text">Checkbox on new tasks</p>
								<p class="mt-1 text-sm text-app-subtext">
									Start new cards with a checkbox ready to toggle.
								</p>
							</div>
							<input
								type="checkbox"
								class="h-4 w-4 accent-[var(--color-app-primary)]"
								checked={settings.defaultShowCheckbox}
								on:change={(event) =>
									onSettingsChange({
										...settings,
										defaultShowCheckbox: (event.currentTarget as HTMLInputElement).checked
									})}
							/>
						</label>
					</div>

					<div class="rounded-xl border border-app-border bg-app-bg/60 p-3 sm:rounded-[1.45rem] sm:p-4">
						<p class="text-sm font-semibold text-app-text">How backgrounds apply</p>
						<ul class="mt-3 space-y-2 text-sm leading-relaxed text-app-subtext">
							<li>Personal background: login, dashboard, settings, and fallback workspace mood.</li>
							<li>Board background: the selected board's Kanban, notes, and chat.</li>
							<li>Uploaded images stay synced through Supabase Storage.</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>

	<input
		bind:this={personalUploadInput}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/avif"
		class="hidden"
		on:change={(event) => readSelectedFile(event, onUploadPersonalBackground)}
	/>

	<input
		bind:this={boardUploadInput}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/avif"
		class="hidden"
		on:change={(event) => readSelectedFile(event, onUploadBoardBackground)}
	/>
</section>
