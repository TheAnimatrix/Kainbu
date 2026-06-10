<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { LoaderCircle } from '$lib/icons';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ThemedBackdrop from '$lib/components/ThemedBackdrop.svelte';
	import AuthView from '$lib/components/AuthView.svelte';
	import { fetchPublicBoardShare } from '$lib/kainbu/shareApi';
	import { fetchAuthSettings, signupWithAuthSettings } from '$lib/kainbu/adminApi';
	import { applyColorMode, readStoredColorMode } from '$lib/kainbu/colorMode';
	import { normalizeBoardPreferences } from '$lib/kainbu/boardPreferences';
	import { DEFAULT_BACKGROUND_THEME } from '$lib/kainbu/backgrounds';
	import type { ColorMode, KanbanData, PublicBoardShareResponse } from '$lib/kainbu/types';
	import { isPocketBaseConfigured, pocketbase } from '$lib/pocketbaseClient';
	import { formatPocketBaseError } from '$lib/pocketbaseErrors';

	type AuthUser = { id: string; email?: string };

	const toAuthUser = (model: { id: string; email?: string } | null): AuthUser | null =>
		model ? { id: model.id, email: model.email } : null;

	let loading = true;
	let errorMessage = '';
	let requiresAuth = false;
	let share: PublicBoardShareResponse | null = null;
	let user: AuthUser | null = toAuthUser(pocketbase.authStore.model);
	let signupsEnabled = true;
	let emailConfigured = false;
	let emailVerificationEnabled = false;
	let showResendVerification = false;
	let authInfoMessage = '';
	let authErrorMessage = '';
	let isAuthLoading = false;
	let colorMode: ColorMode = readStoredColorMode() ?? 'dark';

	$: slug = $page.params.slug || '';

	const loadShare = async () => {
		if (!slug) return;
		loading = true;
		errorMessage = '';
		requiresAuth = false;

		try {
			const payload = await fetchPublicBoardShare(slug, pocketbase.authStore.token || null);
			if (payload.canEdit && payload.redirectTo) {
				await goto(payload.redirectTo);
				return;
			}
			share = payload;
		} catch (error) {
			const authRequired =
				typeof error === 'object' &&
				error !== null &&
				'requiresAuth' in error &&
				Boolean((error as { requiresAuth?: boolean }).requiresAuth);
			requiresAuth = authRequired;
			errorMessage =
				error instanceof Error ? error.message : 'Unable to load this shared board right now.';
			share = null;
		} finally {
			loading = false;
		}
	};

	const handleAuthSubmit = async (payload: {
		email: string;
		password: string;
		isSignUp: boolean;
	}) => {
		if (!isPocketBaseConfigured) return;

		isAuthLoading = true;
		authErrorMessage = '';
		authInfoMessage = '';

		try {
			if (payload.isSignUp) {
				const result = await signupWithAuthSettings(payload.email, payload.password);
				if (result.requiresVerification) {
					authInfoMessage =
						'Account created. Check your email for a verification link before signing in.';
					showResendVerification = true;
					return;
				}
				await pocketbase.collection('users').authWithPassword(payload.email, payload.password);
			} else {
				await pocketbase.collection('users').authWithPassword(payload.email, payload.password);
			}

			user = toAuthUser(pocketbase.authStore.model);
			await loadShare();
		} catch (error) {
			authErrorMessage = formatPocketBaseError(error, 'Unable to authenticate right now.');
		} finally {
			isAuthLoading = false;
		}
	};

	const noopKanbanChange = (_nextData: KanbanData) => {};

	onMount(() => {
		applyColorMode(colorMode);

		void fetchAuthSettings()
			.then((settings) => {
				signupsEnabled = settings.signupsEnabled;
				emailConfigured = settings.emailConfigured;
				emailVerificationEnabled = settings.emailVerificationEnabled;
			})
			.catch((error) => {
				console.error(error);
			});

		const stopAuthListener = pocketbase.authStore.onChange((_token, model) => {
			user = toAuthUser(model);
		});

		void loadShare();

		return () => {
			stopAuthListener?.();
		};
	});
</script>

<svelte:head>
	<title>{share ? `${share.boardName} | Kainbu` : 'Shared board | Kainbu'}</title>
</svelte:head>

<div
	class="relative h-[100dvh] overflow-hidden bg-app-bg pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-app-text"
>
	<ThemedBackdrop
		theme={share?.backgroundTheme ?? DEFAULT_BACKGROUND_THEME}
		imageUrl={null}
		{colorMode}
	/>

	<div class="relative flex h-full min-h-0 flex-col">
		<header class="bg-app-bg/82 px-3 py-2 backdrop-blur-xl lg:px-4">
			<div class="flex items-center justify-between gap-3">
				<a
					href="/"
					class="inline-flex h-10 items-center justify-center text-app-text transition hover:opacity-85"
					aria-label="Go to Kainbu home"
				>
					<BrandMark size={36} alt="" />
				</a>

				{#if !user && signupsEnabled}
					<a
						href="/"
						class="inline-flex items-center gap-1.5 rounded-full border border-app-primary/30 bg-app-primary/10 px-3 py-1.5 text-[11px] font-semibold text-app-primary transition hover:bg-app-primary/15"
					>
						Sign up
					</a>
				{/if}
			</div>
		</header>

		<div class="relative min-h-0 flex-1">
			{#if loading}
				<div class="flex h-full items-center justify-center text-app-subtext">
					<div class="flex items-center gap-2 text-sm">
						<LoaderCircle size={18} class="animate-spin text-app-primary" />
						Loading board…
					</div>
				</div>
			{:else if requiresAuth}
				<div class="flex h-full items-center justify-center px-4">
					<div class="w-full max-w-md space-y-4 text-center">
						<p class="text-sm text-app-subtext">
							This board is private. Sign in with an invited account to open it.
						</p>
						<AuthView
							loading={isAuthLoading}
							configured={isPocketBaseConfigured}
							infoMessage={authInfoMessage}
							errorMessage={authErrorMessage || errorMessage}
							{signupsEnabled}
							{emailConfigured}
							{showResendVerification}
							on:submit={(event) => handleAuthSubmit(event.detail)}
							on:resetPassword={() => {}}
							on:resendVerification={() => {}}
						/>
					</div>
				</div>
			{:else if errorMessage}
				<div class="flex h-full items-center justify-center px-4 text-center text-sm text-app-subtext">
					{errorMessage}
				</div>
			{:else if share}
				<KanbanBoard
					projectId={share.projectId}
					activeBoardId={share.boardId}
					boardName={share.boardName}
					data={share.kanbanData}
					boardPreferences={normalizeBoardPreferences(share.boardPreferences)}
					isLocked={true}
					showShareButton={false}
					showCollaborationChrome={false}
					colorMode={colorMode}
					active={true}
					members={[]}
					currentUserId=""
					currentUserAvatarUrl={null}
					onChange={noopKanbanChange}
					onSendToChat={() => {}}
				/>
			{/if}
		</div>
	</div>
</div>
