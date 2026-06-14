<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, ImageUp, Moon, Sun, Trash2 } from '$lib/icons';
	import AccountIdentityForm from '$lib/components/AccountIdentityForm.svelte';
	import BackgroundThemePicker from '$lib/components/BackgroundThemePicker.svelte';
	import SettingsApiKeys from '$lib/components/SettingsApiKeys.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { fetchAdminMe } from '$lib/kainbu/adminApi';
	import { pocketbase } from '$lib/pocketbaseClient';
	import { formatPocketBaseError } from '$lib/pocketbaseErrors';
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
	export let avatarUrl: string | null = null;
	export let usernameDraft = '';
	export let usernameAvailability: UsernameAvailabilityState = 'idle';
	export let usernameFeedback = '';
	export let usernameSaving = false;
	export let avatarUploading = false;
	export let personalImageUrl: string | null = null;
	export let boardImageUrl: string | null = null;
	export let personalImageUploading = false;
	export let boardImageUploading = false;
	export let onSectionChange: (nextSection: SettingsSection) => void;
	export let onUsernameDraftChange: (value: string) => void;
	export let onUsernameSubmit: () => void | Promise<void>;
	export let onUploadAvatar: (file: File) => void | Promise<void>;
	export let onRemoveAvatar: () => void | Promise<void>;
	export let onSettingsChange: (nextSettings: UserSettings) => void;
	export let onSelectPersonalBackground: (theme: BackgroundTheme) => void;
	export let onUploadPersonalBackground: (file: File) => void | Promise<void>;
	export let onSelectBoardBackground: (theme: BackgroundTheme) => void;
	export let onUploadBoardBackground: (file: File) => void | Promise<void>;
	export let onClearBoardBackground: () => void;
	export let onBack: () => void;

	let personalUploadInput: HTMLInputElement | null = null;
	let boardUploadInput: HTMLInputElement | null = null;
	let avatarUploadInput: HTMLInputElement | null = null;
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

	$: pageTitle = section === 'account' ? 'Account' : section === 'access' ? 'Access' : 'Appearance';
	$: pageKicker =
		section === 'account'
			? 'Profile and access'
			: section === 'access'
				? 'API keys and CLI'
				: 'Look and feel';
	$: avatarLabel = username ? `@${username}` : email || 'Your profile';
</script>

<section
	class="kainbu-settings absolute inset-0 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6"
>
	<div class="mx-auto flex min-w-0 max-w-6xl flex-col gap-7">
		<header class="kainbu-settings__header flex flex-wrap items-end justify-between gap-4">
			<div class="flex min-w-0 items-start gap-3">
				<button
					type="button"
					class="kainbu-btn kainbu-btn--ghost kainbu-btn--icon shrink-0"
					on:click={onBack}
					aria-label="Go back"
					title="Go back"
				>
					<ArrowLeft size={18} />
				</button>
				<div class="min-w-0">
					<p class="kainbu-settings__kicker">{pageKicker}</p>
					<h2 class="kainbu-settings__title mt-1 text-app-text">{pageTitle}</h2>
				</div>
			</div>

			<div class="kainbu-settings-seg" role="tablist" aria-label="Settings sections">
				<button
					type="button"
					role="tab"
					aria-selected={section === 'account'}
					class={`kainbu-settings-seg__btn ${section === 'account' ? 'kainbu-settings-seg__btn--active' : ''}`}
					on:click={() => onSectionChange('account')}
				>
					Account
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={section === 'access'}
					class={`kainbu-settings-seg__btn ${section === 'access' ? 'kainbu-settings-seg__btn--active' : ''}`}
					on:click={() => onSectionChange('access')}
				>
					Access
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={section === 'appearance'}
					class={`kainbu-settings-seg__btn ${section === 'appearance' ? 'kainbu-settings-seg__btn--active' : ''}`}
					on:click={() => onSectionChange('appearance')}
				>
					Appearance
				</button>
			</div>
		</header>

		{#if section === 'account'}
			<div class="kainbu-settings__stack">
				{#if showAdminLink}
					<div class="kainbu-settings-panel kainbu-settings-panel--accent">
						<div class="kainbu-settings-panel__body flex flex-wrap items-center justify-between gap-3">
							<div>
								<h3 class="kainbu-settings-panel__title">Admin panel</h3>
								<p class="kainbu-settings-panel__desc">Manage users, AI key, and usage.</p>
							</div>
							<a href="/admin" class="kainbu-btn kainbu-btn--primary kainbu-btn--compact">
								Open admin
							</a>
						</div>
					</div>
				{/if}

				<div class="kainbu-settings-panel">
					<div class="kainbu-settings-panel__body">
						<h3 class="kainbu-settings-panel__title">Profile picture</h3>
						<p class="kainbu-settings-panel__desc">
							Shown on shared boards when you are assigned to a task.
						</p>
						<div class="mt-4 flex flex-wrap items-center gap-4">
							<UserAvatar src={avatarUrl} label={avatarLabel} size="md" />
							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact"
									disabled={avatarUploading}
									on:click={() => avatarUploadInput?.click()}
								>
									{#if avatarUploading}
										<span class="kainbu-settings-spinner"></span>
									{:else}
										<ImageUp size={14} />
									{/if}
									{avatarUrl ? 'Replace photo' : 'Upload photo'}
								</button>
								{#if avatarUrl}
									<button
										type="button"
										class="kainbu-btn kainbu-btn--ghost kainbu-btn--compact kainbu-btn--danger"
										disabled={avatarUploading}
										on:click={() => void onRemoveAvatar()}
									>
										<Trash2 size={14} />
										Remove
									</button>
								{/if}
							</div>
						</div>
						<p class="kainbu-settings-note mt-3">PNG, JPEG, or WebP up to 2 MB.</p>
					</div>
				</div>

				<div class="kainbu-settings-panel">
					<div class="kainbu-settings-panel__body">
						<h3 class="kainbu-settings-panel__title">Username</h3>
						<p class="kainbu-settings-panel__desc">
							This name appears in the sidebar and collaboration surfaces.
						</p>
						<div class="mt-4">
							<AccountIdentityForm
								heading="Username"
								description=""
								embedded
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
					</div>
				</div>

				<form class="kainbu-settings-panel" on:submit|preventDefault={changePassword}>
					<div class="kainbu-settings-panel__body">
						<h3 class="kainbu-settings-panel__title">Password</h3>
						<p class="kainbu-settings-panel__desc">Use at least 8 characters.</p>
						<div class="mt-4 grid gap-3 sm:grid-cols-2">
							<label class="block">
								<span class="kainbu-settings-field-label mb-1.5 block">Current password</span>
								<input
									bind:value={oldPassword}
									type="password"
									autocomplete="current-password"
									placeholder="Current password"
									class="kainbu-settings-input w-full px-3 py-2 text-sm"
								/>
							</label>
							<label class="block">
								<span class="kainbu-settings-field-label mb-1.5 block">New password</span>
								<input
									bind:value={newPassword}
									type="password"
									minlength="8"
									autocomplete="new-password"
									placeholder="New password"
									class="kainbu-settings-input w-full px-3 py-2 text-sm"
								/>
							</label>
						</div>
						<div class="mt-4 flex flex-wrap items-center gap-3">
							<button
								type="submit"
								disabled={passwordSaving}
								class="kainbu-btn kainbu-btn--primary kainbu-btn--compact disabled:cursor-not-allowed disabled:opacity-60"
							>
								{passwordSaving ? 'Changing…' : 'Change password'}
							</button>
							{#if passwordMessage}
								<p class="kainbu-settings-feedback kainbu-settings-feedback--success">{passwordMessage}</p>
							{/if}
							{#if passwordError}
								<p class="kainbu-settings-feedback kainbu-settings-feedback--error">{passwordError}</p>
							{/if}
						</div>
					</div>
				</form>
			</div>
		{:else if section === 'access'}
			<SettingsApiKeys />
		{:else}
			<div class="kainbu-settings__stack">
				<div class="kainbu-settings-panel">
					<div class="kainbu-settings-panel__body">
						<h3 class="kainbu-settings-panel__title">Backgrounds</h3>
						<p class="kainbu-settings-panel__desc">
							Personal is your default. Boards can override it for everyone on that workspace.
						</p>

						<div class="kainbu-settings-subsection kainbu-settings-subsection--inline">
							<p class="kainbu-settings-field-label kainbu-settings-field-label--heading">
								Interface
							</p>
							<div class="kainbu-settings-seg" role="group" aria-label="Color mode">
								<button
									type="button"
									class={`kainbu-settings-seg__btn kainbu-settings-seg__btn--with-icon ${settings.colorMode === 'dark' ? 'kainbu-settings-seg__btn--active' : ''}`}
									on:click={() => setColorMode('dark')}
								>
									<Moon size={14} />
									Dark
								</button>
								<button
									type="button"
									class={`kainbu-settings-seg__btn kainbu-settings-seg__btn--with-icon ${settings.colorMode === 'light' ? 'kainbu-settings-seg__btn--active' : ''}`}
									on:click={() => setColorMode('light')}
								>
									<Sun size={14} />
									Light
								</button>
							</div>
						</div>

						<div class="kainbu-settings-subsection">
							<p class="kainbu-settings-field-label kainbu-settings-field-label--heading">
								Personal
							</p>
							<BackgroundThemePicker
								colorMode={settings.colorMode}
								currentTheme={settings.backgroundTheme}
								imageUrl={personalImageUrl}
								imageUploading={personalImageUploading}
								mode="personal"
								onSelect={onSelectPersonalBackground}
								onUpload={() => personalUploadInput?.click()}
							/>
						</div>

						{#if currentProject}
							<div class="kainbu-settings-subsection">
								<p class="kainbu-settings-field-label kainbu-settings-field-label--heading">
									Board
									<span class="kainbu-settings-subsection__meta font-normal text-app-subtext">
										· {currentProject.name}
									</span>
								</p>
								<BackgroundThemePicker
									colorMode={settings.colorMode}
									currentTheme={currentProject.backgroundTheme}
									imageUrl={boardImageUrl}
									imageUploading={boardImageUploading}
									mode="board"
									inheritPreviewTheme={settings.backgroundTheme}
									inheritPreviewImageUrl={personalImageUrl}
									onSelect={onSelectBoardBackground}
									onUpload={() => boardUploadInput?.click()}
									onInherit={onClearBoardBackground}
								/>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<input
		bind:this={avatarUploadInput}
		type="file"
		accept="image/png,image/jpeg,image/webp"
		class="hidden"
		on:change={(event) => readSelectedFile(event, onUploadAvatar)}
	/>

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

<style>
	.kainbu-settings {
		background:
			radial-gradient(
				ellipse 80% 50% at 50% -20%,
				color-mix(in oklab, var(--color-app-primary) 7%, transparent),
				transparent 70%
			),
			transparent;
	}

	.kainbu-settings__kicker {
		font-size: 0.8125rem;
		font-weight: 500;
		font-style: italic;
		font-family: var(--font-serif);
		color: color-mix(in oklab, var(--color-app-subtext) 92%, var(--color-app-primary));
		letter-spacing: 0.01em;
	}

	.kainbu-settings__title {
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3.5vw, 2.25rem);
		font-weight: 700;
		line-height: 1.05;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}

	.kainbu-settings__stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.kainbu-settings-subsection {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid color-mix(in oklab, var(--color-app-border) 72%, transparent);
	}

	.kainbu-settings-subsection:first-of-type {
		margin-top: 1.125rem;
		padding-top: 0;
		border-top: none;
	}

	.kainbu-settings-subsection--inline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.625rem 1rem;
	}

	.kainbu-settings-subsection__meta {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.kainbu-settings-panel {
		border-radius: 0.875rem;
		background: color-mix(in oklab, var(--color-app-surface) 86%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 6%, transparent),
			0 1px 3px color-mix(in oklab, var(--color-app-bg) 45%, transparent);
	}

	.kainbu-settings-panel--accent {
		background: color-mix(in oklab, var(--color-app-primary) 6%, var(--color-app-surface));
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-app-primary) 22%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 6%, transparent),
			0 4px 16px -10px color-mix(in oklab, var(--color-app-primary) 30%, transparent);
	}

	.kainbu-settings-panel__body {
		padding: 1.125rem 1.25rem 1.25rem;
	}

	.kainbu-settings-panel__title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-app-text);
	}

	.kainbu-settings-panel__desc {
		margin-top: 0.25rem;
		max-width: 42ch;
		font-size: 0.8125rem;
		line-height: 1.55;
		color: var(--color-app-subtext);
	}

	.kainbu-settings-note {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: var(--color-app-subtext);
	}

	.kainbu-settings-feedback {
		font-size: 0.75rem;
		font-weight: 500;
	}

	.kainbu-settings-feedback--success {
		color: rgb(52 211 153);
	}

	.kainbu-settings-feedback--error {
		color: rgb(251 113 133);
	}

	.kainbu-settings-spinner {
		display: block;
		height: 1rem;
		width: 1rem;
		border-radius: 999px;
		border: 2px solid color-mix(in oklab, currentColor 25%, transparent);
		border-top-color: currentColor;
		animation: kainbu-settings-spin 0.75s linear infinite;
	}

	@keyframes kainbu-settings-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.kainbu-settings-seg {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.2rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-app-element) 55%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 8%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 12%, transparent);
	}

	.kainbu-settings-seg__btn {
		border: none;
		border-radius: 0.45rem;
		padding: 0.4rem 0.85rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-app-subtext);
		background: transparent;
		transition:
			transform 0.16s ease,
			background-color 0.16s ease,
			color 0.16s ease,
			box-shadow 0.16s ease;
	}

	.kainbu-settings-seg__btn--with-icon {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.kainbu-settings-seg__btn:hover {
		color: var(--color-app-text);
	}

	.kainbu-settings-seg__btn--active {
		color: var(--color-app-text);
		background: linear-gradient(
			180deg,
			color-mix(in oklab, var(--color-app-surface) 88%, white) 0%,
			color-mix(in oklab, var(--color-app-element) 70%, transparent) 100%
		);
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 16%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 10%, transparent),
			0 1px 3px color-mix(in oklab, var(--color-app-bg) 35%, transparent);
	}

	.kainbu-settings-seg__btn:active {
		transform: scale(0.98);
	}

	.kainbu-settings-seg__btn:focus-visible {
		outline: 2px solid color-mix(in oklab, var(--color-app-primary) 70%, white);
		outline-offset: 2px;
	}

	:global(.kainbu-settings-field-label) {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-app-subtext);
		letter-spacing: 0.01em;
	}

	:global(.kainbu-settings-field-label--heading) {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-app-text);
		letter-spacing: -0.01em;
	}

	:global(.kainbu-settings-input) {
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--color-app-border) 82%, transparent);
		background: color-mix(in oklab, var(--color-app-bg) 88%, transparent);
		color: var(--color-app-text);
		outline: none;
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 5%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 8%, transparent);
		transition:
			border-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	:global(.kainbu-settings-input:focus) {
		border-color: color-mix(in oklab, var(--color-app-primary) 45%, var(--color-app-border));
		box-shadow:
			inset 0 1px 0 color-mix(in oklab, white 6%, transparent),
			0 0 0 3px color-mix(in oklab, var(--color-app-primary) 14%, transparent);
	}

	:root[data-color-mode='light'] .kainbu-settings-panel {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.72),
			0 1px 3px color-mix(in oklab, var(--color-app-bg) 12%, transparent);
	}

	:root[data-color-mode='light'] :global(.kainbu-settings-input) {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.85),
			inset 0 -1px 0 color-mix(in oklab, var(--color-app-border) 45%, transparent);
	}

	:root[data-color-mode='light'] .kainbu-settings-seg__btn--active {
		background: linear-gradient(
			180deg,
			color-mix(in oklab, var(--color-app-surface) 95%, white) 0%,
			color-mix(in oklab, var(--color-app-element) 85%, transparent) 100%
		);
	}
</style>
