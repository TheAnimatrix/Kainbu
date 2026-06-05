<script lang="ts">
	import { onMount } from 'svelte';
	import { ImageUp, Moon, RefreshCcw, Sun, Trash2 } from 'lucide-svelte';
	import AccountIdentityForm from '$lib/components/AccountIdentityForm.svelte';
	import BackgroundSwatch from '$lib/components/BackgroundSwatch.svelte';
	import { fetchAdminMe } from '$lib/kainbu/adminApi';
	import { pocketbase } from '$lib/pocketbaseClient';
	import { formatPocketBaseError } from '$lib/pocketbaseErrors';
	import {
		BACKGROUND_GRADIENT_OPTIONS,
		BACKGROUND_SOLID_OPTIONS,
		getBackgroundImagePreviewStyle,
		getBackgroundSwatch,
		getBackgroundThemeKey
	} from '$lib/kainbu/backgrounds';
	import type {
		BackgroundTheme,
		ColorMode,
		Project,
		SettingsSection,
		UserSettings,
		UsernameAvailabilityState
	} from '$lib/kainbu/types';

	export let section: SettingsSection = 'appearance';
	export let settings: UserSettings;
	export let currentProject: Project | null = null;
	export let email: string | null = null;
	export let username: string | null = null;
	export let usernameDraft = '';
	export let usernameAvailability: UsernameAvailabilityState = 'idle';
	export let usernameFeedback = '';
	export let usernameSaving = false;
	export let personalImageUrl: string | null = null;
	export let boardImageUrl: string | null = null;
	export let personalImageUploading = false;
	export let boardImageUploading = false;
	export let onSectionChange: (nextSection: SettingsSection) => void;
	export let onUsernameDraftChange: (value: string) => void;
	export let onUsernameSubmit: () => void | Promise<void>;
	export let onSettingsChange: (nextSettings: UserSettings) => void;
	export let onSelectPersonalBackground: (theme: BackgroundTheme) => void;
	export let onUploadPersonalBackground: (file: File) => void | Promise<void>;
	export let onSelectBoardBackground: (theme: BackgroundTheme) => void;
	export let onUploadBoardBackground: (file: File) => void | Promise<void>;
	export let onClearBoardBackground: () => void;

	let personalUploadInput: HTMLInputElement | null = null;
	let boardUploadInput: HTMLInputElement | null = null;
	let showAdminLink = false;
	let oldPassword = '';
	let newPassword = '';
	let passwordSaving = false;
	let passwordMessage = '';
	let passwordError = '';

	onMount(async () => {
		try {
			const me = await fetchAdminMe();
			showAdminLink = me.isAdmin;
		} catch {
			showAdminLink = false;
		}
	});

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

	const setColorMode = (colorMode: ColorMode) => {
		if (settings.colorMode === colorMode) return;
		onSettingsChange({ ...settings, colorMode });
	};

	const readSelectedFile = (event: Event, handler: (file: File) => void | Promise<void>) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			void handler(file);
		}
		input.value = '';
	};

	const changePassword = async () => {
		const userId = pocketbase.authStore.model?.id;
		passwordMessage = '';
		passwordError = '';
		if (!userId) {
			passwordError = 'Sign in again before changing your password.';
			return;
		}
		if (newPassword.length < 8) {
			passwordError = 'Use at least 8 characters for the new password.';
			return;
		}

		passwordSaving = true;
		try {
			await pocketbase.collection('users').update(userId, {
				oldPassword,
				password: newPassword,
				passwordConfirm: newPassword
			});
			oldPassword = '';
			newPassword = '';
			passwordMessage = 'Password changed.';
		} catch (error) {
			passwordError = formatPocketBaseError(error, 'Unable to change password.');
		} finally {
			passwordSaving = false;
		}
	};
</script>

<section
	class="absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5"
>
	<div class="mx-auto flex min-w-0 max-w-5xl flex-col gap-5">
		<div class="flex flex-wrap items-end justify-between gap-3 px-1">
			<div>
				<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Settings</p>
				<h2 class="mt-1.5 text-2xl font-bold tracking-tight text-app-text">
					{section === 'account' ? 'Account' : 'Appearance'}
				</h2>
			</div>

			<div class="inline-flex items-center gap-1 rounded-lg border border-app-border/50 p-0.5">
				<button
					type="button"
					class={`rounded-md px-3 py-1.5 text-sm font-medium transition ${section === 'account' ? 'bg-app-element text-app-text' : 'text-app-subtext hover:text-app-text'}`}
					on:click={() => onSectionChange('account')}
				>
					Account
				</button>
				<button
					type="button"
					class={`rounded-md px-3 py-1.5 text-sm font-medium transition ${section === 'appearance' ? 'bg-app-element text-app-text' : 'text-app-subtext hover:text-app-text'}`}
					on:click={() => onSectionChange('appearance')}
				>
					Appearance
				</button>
			</div>
		</div>

		{#if section === 'account'}
			<div class="grid gap-5">
				{#if showAdminLink}
					<div class="flex items-center justify-between gap-3 border border-app-border/40 bg-app-surface/30 px-3 py-2">
						<div>
							<p class="text-xs font-medium text-app-text">Admin panel</p>
							<p class="text-xs text-app-subtext">Manage users, AI key, and usage.</p>
						</div>
						<a
							href="/admin"
							class="rounded-md bg-app-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-app-primary-hover"
						>
							Open admin
						</a>
					</div>
				{/if}
				<div>
					<AccountIdentityForm
						heading="Username"
						description="This name appears in the sidebar and collaboration surfaces."
						{email}
						currentUsername={username}
						{usernameDraft}
						availability={usernameAvailability}
						feedback={usernameFeedback}
						saving={usernameSaving}
						submitLabel="Save username"
						onDraftChange={onUsernameDraftChange}
						onSubmit={onUsernameSubmit}
					/>
				</div>
				<form
					class="border-t border-app-border/30 pt-5"
					on:submit|preventDefault={changePassword}
				>
					<p class="text-xs font-semibold text-app-text">Password</p>
					<div class="mt-3 grid gap-2 sm:grid-cols-2">
						<input
							bind:value={oldPassword}
							type="password"
							autocomplete="current-password"
							placeholder="Current password"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
						<input
							bind:value={newPassword}
							type="password"
							minlength="8"
							autocomplete="new-password"
							placeholder="New password"
							class="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-primary/60"
						/>
					</div>
					<div class="mt-3 flex flex-wrap items-center gap-3">
						<button
							type="submit"
							disabled={passwordSaving}
							class="rounded-md bg-app-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-app-primary-hover disabled:opacity-60"
						>
							{passwordSaving ? 'Changing...' : 'Change password'}
						</button>
						{#if passwordMessage}
							<p class="text-xs text-emerald-300">{passwordMessage}</p>
						{/if}
						{#if passwordError}
							<p class="text-xs text-red-400">{passwordError}</p>
						{/if}
					</div>
				</form>
			</div>
		{:else}
			<div class="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
				<div class="space-y-5">
					<div>
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-xs font-semibold text-app-text">Personal background</p>
								<p class="mt-1 text-sm text-app-subtext">
									Used on dashboard, settings, and anywhere a board doesn't override it.
								</p>
							</div>
							<button
								type="button"
								class="rounded-lg border border-app-border/50 p-2 text-app-subtext transition hover:text-app-primary"
								on:click={() => personalUploadInput?.click()}
								aria-label={personalImageUploading
									? 'Uploading personal background image'
									: settings.backgroundTheme.kind === 'image'
										? 'Replace personal background image'
										: 'Upload personal background image'}
								title={settings.backgroundTheme.kind === 'image' ? 'Replace image' : 'Upload image'}
							>
								{#if personalImageUploading}
									<span class="block h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current"></span>
								{:else}
									<ImageUp size={16} />
								{/if}
							</button>
						</div>

						<div class="mt-3 flex flex-wrap gap-2">
							{#each BACKGROUND_GRADIENT_OPTIONS as option (option.id)}
								{@const theme = gradientTheme(option.id)}
								<BackgroundSwatch
									size="lg"
									swatch={getBackgroundSwatch(option, settings.colorMode)}
									selected={isSelected(settings.backgroundTheme, theme)}
									ariaLabel={`Use ${option.label} gradient`}
									title={option.label}
									on:click={() => onSelectPersonalBackground(theme)}
								/>
							{/each}
						</div>

						<div class="mt-2 flex flex-wrap gap-2">
							{#each BACKGROUND_SOLID_OPTIONS as option (option.id)}
								{@const theme = solidTheme(option.id)}
								<BackgroundSwatch
									size="sm"
									swatch={getBackgroundSwatch(option, settings.colorMode)}
									selected={isSelected(settings.backgroundTheme, theme)}
									ariaLabel={`Use ${option.label} solid color`}
									title={option.label}
									on:click={() => onSelectPersonalBackground(theme)}
								/>
							{/each}

							<BackgroundSwatch
								size="sm"
								variant="image"
								previewStyle={getBackgroundImagePreviewStyle(personalImageUrl, settings.colorMode)}
								selected={settings.backgroundTheme.kind === 'image'}
								ariaLabel={settings.backgroundTheme.kind === 'image'
									? 'Personal uploaded image selected'
									: 'Upload personal background image'}
								title={settings.backgroundTheme.kind === 'image' ? 'Uploaded image' : 'Upload image'}
								on:click={() => personalUploadInput?.click()}
							/>
						</div>
					</div>

					{#if currentProject}
						<div class="border-t border-app-border/30 pt-5">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-xs font-semibold text-app-text">Board background</p>
									<p class="mt-1 text-sm text-app-subtext">
										Shared with everyone on <span class="font-medium text-app-text">{currentProject.name}</span>.
									</p>
								</div>
								<div class="flex gap-1.5">
									<button
										type="button"
										class="rounded-lg border border-app-border/50 p-2 text-app-subtext transition hover:text-app-primary"
										on:click={() => boardUploadInput?.click()}
										aria-label={boardImageUploading ? 'Uploading board background image' : currentProject.backgroundTheme?.kind === 'image' ? 'Replace board background image' : 'Upload board background image'}
										title={currentProject.backgroundTheme?.kind === 'image' ? 'Replace image' : 'Upload image'}
									>
										{#if boardImageUploading}
											<span class="block h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current"></span>
										{:else}
											<ImageUp size={16} />
										{/if}
									</button>
									<button
										type="button"
										class="rounded-lg border border-app-border/50 p-2 text-app-subtext transition hover:text-rose-400"
										on:click={onClearBoardBackground}
										aria-label="Clear board background override"
										title="Clear override"
									>
										<Trash2 size={16} />
									</button>
								</div>
							</div>

							<div class="mt-3 flex flex-wrap gap-2">
								{#each BACKGROUND_GRADIENT_OPTIONS as option (option.id)}
									{@const theme = gradientTheme(option.id)}
									<BackgroundSwatch
										size="lg"
										swatch={getBackgroundSwatch(option, settings.colorMode)}
										selected={isSelected(currentProject.backgroundTheme, theme)}
										ariaLabel={`Set board background to ${option.label}`}
										title={option.label}
										on:click={() => onSelectBoardBackground(theme)}
									/>
								{/each}
							</div>

							<div class="mt-2 flex flex-wrap gap-2">
								{#each BACKGROUND_SOLID_OPTIONS as option (option.id)}
									{@const theme = solidTheme(option.id)}
									<BackgroundSwatch
										size="sm"
										swatch={getBackgroundSwatch(option, settings.colorMode)}
										selected={isSelected(currentProject.backgroundTheme, theme)}
										ariaLabel={`Set board background to ${option.label}`}
										title={option.label}
										on:click={() => onSelectBoardBackground(theme)}
									/>
								{/each}

								<BackgroundSwatch
									size="sm"
									variant="image"
									previewStyle={getBackgroundImagePreviewStyle(boardImageUrl, settings.colorMode)}
									selected={currentProject.backgroundTheme?.kind === 'image'}
									ariaLabel={currentProject.backgroundTheme?.kind === 'image'
										? 'Board uploaded image selected'
										: 'Upload board background image'}
									title={currentProject.backgroundTheme?.kind === 'image' ? 'Uploaded image' : 'Upload image'}
									on:click={() => boardUploadInput?.click()}
								/>
							</div>

							{#if !currentProject.backgroundTheme}
								<p class="mt-2 flex items-center gap-1.5 text-xs text-app-subtext">
									<RefreshCcw size={11} />
									Falling back to your personal background
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<div class="space-y-5">
					<div>
						<p class="text-xs font-semibold text-app-text">Interface theme</p>
						<p class="mt-1 text-sm text-app-subtext">Choose light or dark for panels, text, and controls.</p>
						<div class="mt-2 inline-flex items-center gap-1 rounded-lg border border-app-border/50 p-0.5">
							<button
								type="button"
								class={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${settings.colorMode === 'dark' ? 'bg-app-element text-app-text' : 'text-app-subtext hover:text-app-text'}`}
								on:click={() => setColorMode('dark')}
							>
								<Moon size={14} />
								Dark
							</button>
							<button
								type="button"
								class={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${settings.colorMode === 'light' ? 'bg-app-element text-app-text' : 'text-app-subtext hover:text-app-text'}`}
								on:click={() => setColorMode('light')}
							>
								<Sun size={14} />
								Light
							</button>
						</div>
					</div>

					<div>
						<p class="text-xs font-semibold text-app-text">Task defaults</p>
						<label class="mt-2 flex items-center justify-between gap-3 rounded-lg border border-app-border/40 px-3 py-2.5">
							<div>
								<p class="text-sm font-medium text-app-text">Checkbox on new tasks</p>
								<p class="mt-0.5 text-xs text-app-subtext">Start new cards with a checkbox ready to toggle.</p>
							</div>
							<input
								type="checkbox"
								class="h-4 w-4 accent-app-primary"
								checked={settings.defaultShowCheckbox}
								on:change={(event) =>
									onSettingsChange({
										...settings,
										defaultShowCheckbox: (event.currentTarget as HTMLInputElement).checked
									})}
							/>
						</label>
					</div>

					<div>
						<p class="text-xs font-semibold text-app-text">How backgrounds apply</p>
						<ul class="mt-2 space-y-1 text-sm text-app-subtext">
							<li>Personal: dashboard, settings, and fallback workspace mood.</li>
							<li>Board: the selected board's Kanban, notes, and chat.</li>
							<li>Uploaded images are stored in PocketBase.</li>
						</ul>
					</div>
				</div>
			</div>
		{/if}
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
