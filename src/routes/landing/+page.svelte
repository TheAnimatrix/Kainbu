<script lang="ts">
	import { ArrowRight, Lock, Server, Users, Link2, KeyRound, Palette } from 'lucide-svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import LandingSceneFrame from '$lib/components/landing/LandingSceneFrame.svelte';
	import LandingBoardScene from '$lib/components/landing/LandingBoardScene.svelte';
	import LandingAiScene from '$lib/components/landing/LandingAiScene.svelte';
	import LandingLinksScene from '$lib/components/landing/LandingLinksScene.svelte';
	import LandingThemesScene from '$lib/components/landing/LandingThemesScene.svelte';
	import LandingByokScene from '$lib/components/landing/LandingByokScene.svelte';
	import LandingNotesScene from '$lib/components/landing/LandingNotesScene.svelte';
	import LandingHeroBackdrop from '$lib/components/landing/LandingHeroBackdrop.svelte';
	import { BRAND_KATAKANA, BRAND_NAME } from '$lib/kainbu/constants';

	const stackItems = [
		{ name: 'Svelte', slug: 'svelte', href: 'https://svelte.dev' },
		{ name: 'Docker', slug: 'docker', href: 'https://www.docker.com' },
		{ name: 'PocketBase', slug: 'pocketbase', href: 'https://pocketbase.io' }
	];
</script>

<svelte:head>
	<title>{BRAND_NAME} | Self-hosted kanban with AI</title>
	<meta
		name="description"
		content="Kainbu is a self-hosted kanban workspace with boards, notes, linked cards, themeable backgrounds, and an AI assistant that stages changes you review."
	/>
</svelte:head>

<div class="landing-page">
	<header
		class="sticky top-0 z-40 border-b border-app-border/60 bg-app-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-app-bg/70"
	>
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
			<a href="/landing" class="flex min-w-0 items-center gap-2.5">
				<BrandMark size={34} alt={`${BRAND_NAME} logo`} />
				<div class="min-w-0">
					<p class="font-display text-lg font-extrabold leading-none tracking-tight">{BRAND_NAME}</p>
					<p class="font-display text-[10px] font-bold tracking-[0.28em] text-app-subtext">
						{BRAND_KATAKANA}
					</p>
				</div>
			</a>

			<nav class="flex shrink-0 items-center gap-2 sm:gap-3">
				<a
					href="/"
					class="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-app-element px-3.5 py-2 text-sm font-medium text-app-text transition hover:border-app-primary/35 hover:bg-app-surface active:scale-[0.98]"
				>
					Get started
					<ArrowRight size={15} strokeWidth={1.75} />
				</a>
			</nav>
		</div>
	</header>

	<main>
		<!-- Hero: copy + live board scene (split) -->
		<section class="landing-hero relative isolate mx-auto max-w-7xl px-4 pt-12 pb-14 sm:px-6 sm:pt-16 sm:pb-20 lg:px-8 lg:pt-20">
			<LandingHeroBackdrop />
			<div class="relative z-[1] grid items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12">
				<div class="max-w-xl">
					<h1
						class="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-app-text sm:text-5xl lg:text-[3.15rem]"
					>
						Kanban, notes, and AI on one board.
					</h1>
					<p class="mt-4 text-base leading-relaxed text-app-subtext sm:text-lg">
						Boards, notes, and an assistant that reads your workspace and stages changes you review
						before they land.
					</p>
					<div class="mt-7 flex flex-wrap items-center gap-3">
						<a
							href="/"
							class="inline-flex items-center gap-2 rounded-lg bg-app-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-app-primary-hover active:scale-[0.98]"
						>
							Get started
							<ArrowRight size={16} strokeWidth={1.75} />
						</a>
						<a
							href="https://github.com/TheAnimatrix/Kainbu"
							class="inline-flex items-center gap-2 rounded-lg border border-app-border px-4 py-2.5 text-sm font-medium text-app-text transition hover:border-app-primary/35 hover:bg-app-surface active:scale-[0.98]"
							target="_blank"
							rel="noreferrer"
						>
							View on GitHub
						</a>
					</div>
				</div>

				<LandingSceneFrame
					aspect="16 / 10"
					label="Kainbu board with a project rail, tagged cards, and the themeable assistant orb"
					class="w-full"
				>
					<LandingBoardScene themeId="lagoon-veil" />
				</LandingSceneFrame>
			</div>
		</section>

		<!-- AI: assistant scene + copy (split, reversed) -->
		<section class="border-t border-app-border/70">
			<div
				class="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-14 lg:px-8"
			>
				<LandingSceneFrame
					aspect="4 / 5"
					label="Assistant proposing three subtasks with accept and reject controls"
					class="order-2 mx-auto w-full max-w-sm lg:order-1"
				>
					<LandingAiScene />
				</LandingSceneFrame>

				<div class="order-1 lg:order-2">
					<h2 class="font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
						AI that edits the board, then waits for you.
					</h2>
					<p class="mt-4 max-w-lg text-base leading-relaxed text-app-subtext">
						The assistant reads boards and notes and stages task moves, new cards, and copy edits as a
						proposal. Nothing changes until you accept.
					</p>
				</div>
			</div>
		</section>

		<!-- Linked views: centered heading + wide scene (breaks the split rhythm) -->
		<section class="border-t border-app-border/70 bg-app-surface/20">
			<div class="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
				<span class="inline-flex items-center gap-2 text-app-subtext">
					<Link2 size={18} strokeWidth={1.75} />
				</span>
				<h2 class="mt-2 font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
					Link cards across columns, then see the whole set.
				</h2>
				<p class="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-app-subtext">
					Connect related tasks and Kainbu draws the links between them. Switch to the link-group view
					to pull every connected card into one place.
				</p>

				<div class="mt-10">
					<LandingSceneFrame
						aspect="16 / 8"
						label="A linked group of three cards connected by curved links across columns"
						class="mx-auto w-full max-w-3xl"
					>
						<LandingLinksScene />
					</LandingSceneFrame>
				</div>
			</div>
		</section>

		<!-- Themes: copy + theme variations scene (split) -->
		<section class="border-t border-app-border/70">
			<div
				class="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:px-8"
			>
				<div>
					<span class="inline-flex text-app-subtext">
						<Palette size={18} strokeWidth={1.75} />
					</span>
					<h2 class="mt-2 font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
						Set a backdrop per board. The assistant follows.
					</h2>
					<p class="mt-4 max-w-lg text-base leading-relaxed text-app-subtext">
						Gradient and solid themes, a custom HSL picker, or your own image. The chat orb recolors to
						match whichever board you are on.
					</p>
				</div>

				<LandingSceneFrame
					aspect="16 / 10"
					label="Three board previews in different themes with the assistant orb recolored to match"
					class="w-full"
				>
					<LandingThemesScene />
				</LandingSceneFrame>
			</div>
		</section>

		<!-- Control bento: notes, self-host, BYOK, shared workspaces -->
		<section class="border-t border-app-border/70 bg-app-surface/20">
			<div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
				<h2 class="font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
					Notes, keys, and a stack you control.
				</h2>
				<p class="mt-4 max-w-2xl text-base leading-relaxed text-app-subtext">
					Markdown pages beside your boards, your own AI keys, and the whole stack running on your
					domain.
				</p>

				<div class="mt-10 grid gap-4 lg:grid-cols-3">
					<div class="lg:col-span-2">
						<LandingSceneFrame
							aspect="16 / 9"
							label="A markdown notes page with headings, a checklist, and a callout"
						>
							<LandingNotesScene />
						</LandingSceneFrame>
						<p class="mt-3 text-sm text-app-subtext">
							Block-based markdown pages live next to every board.
						</p>
					</div>

					<article class="flex flex-col justify-between rounded-xl border border-app-border bg-app-bg p-5">
						<div>
							<div class="mb-3 inline-flex rounded-lg border border-app-border bg-app-element p-2">
								<Server size={18} strokeWidth={1.75} />
							</div>
							<h3 class="text-lg font-semibold text-app-text">Self-hosted by default</h3>
							<p class="mt-2 text-sm leading-relaxed text-app-subtext">
								SvelteKit UI, Hono API, PocketBase storage. Deploy with Docker or Dokploy on your own
								domain.
							</p>
							<p class="mt-3 inline-flex items-center gap-1.5 text-xs text-app-subtext">
								<Lock size={13} strokeWidth={1.75} />
								Your tasks stay on your infrastructure.
							</p>
						</div>

						<ul class="mt-6 flex flex-wrap items-center gap-3">
							{#each stackItems as item}
								<li>
									<a
										href={item.href}
										class="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-element px-3 py-2 text-xs font-medium text-app-text transition hover:border-app-primary/35"
										target="_blank"
										rel="noreferrer"
									>
										<img
											src={`https://cdn.simpleicons.org/${item.slug}/a1a1aa`}
											alt={item.name}
											width="16"
											height="16"
											class="size-4 opacity-90"
											loading="lazy"
										/>
										{item.name}
									</a>
								</li>
							{/each}
						</ul>
					</article>

					<article class="rounded-xl border border-app-border bg-app-bg p-5">
						<div class="mb-3 inline-flex rounded-lg border border-app-border bg-app-element p-2">
							<KeyRound size={18} strokeWidth={1.75} />
						</div>
						<h3 class="text-lg font-semibold text-app-text">Bring your own AI keys</h3>
						<p class="mt-2 text-sm leading-relaxed text-app-subtext">
							Point Kainbu at OpenRouter or the Vercel AI Gateway. Keys stay server-side, with
							environment variables as the fallback.
						</p>
						<div class="mt-4">
							<LandingSceneFrame aspect="16 / 9" label="AI keys panel with OpenRouter and Vercel AI Gateway configured">
								<LandingByokScene />
							</LandingSceneFrame>
						</div>
					</article>

					<article class="flex flex-col rounded-xl border border-app-border bg-app-bg p-5 lg:col-span-2">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
							<div class="inline-flex shrink-0 rounded-lg border border-app-border bg-app-element p-2">
								<Users size={18} strokeWidth={1.75} />
							</div>
							<div>
								<h3 class="text-lg font-semibold text-app-text">Shared workspaces</h3>
								<p class="mt-2 max-w-3xl text-sm leading-relaxed text-app-subtext">
									Invite members, share boards with a link, and see who is viewing a board in real
									time. Each project keeps its own boards, pages, and chat history.
								</p>
							</div>
						</div>
					</article>
				</div>
			</div>
		</section>

		<section class="border-t border-app-border/70">
			<div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
				<div class="rounded-xl border border-app-border bg-app-surface/60 px-6 py-10 text-center sm:px-10">
					<h2 class="font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
						Open the workspace.
					</h2>
					<p class="mx-auto mt-3 max-w-lg text-base text-app-subtext">
						Sign in, create a project, and ask the assistant to organize the board you already have.
					</p>
					<a
						href="/"
						class="mt-7 inline-flex items-center gap-2 rounded-lg bg-app-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-app-primary-hover active:scale-[0.98]"
					>
						Get started
						<ArrowRight size={16} strokeWidth={1.75} />
					</a>
				</div>
			</div>
		</section>
	</main>

	<footer class="border-t border-app-border/70">
		<div
			class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-app-subtext sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
		>
			<p>{BRAND_NAME} - self-hosted kanban workspace</p>
			<div class="flex flex-wrap items-center gap-4">
				<a href="/" class="transition hover:text-app-text">App</a>
				<a
					href="https://github.com/TheAnimatrix/Kainbu"
					class="transition hover:text-app-text"
					target="_blank"
					rel="noreferrer"
				>
					GitHub
				</a>
			</div>
		</div>
	</footer>
</div>

<style>
	.landing-hero {
		min-height: min(100dvh, 52rem);
	}

	@media (prefers-reduced-motion: no-preference) {
		.landing-page :global(.landing-hero h1),
		.landing-page :global(.landing-hero p) {
			animation: landing-fade-up 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
		}

		.landing-page :global(section:not(.landing-hero) h2) {
			animation: landing-fade-up 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
			animation-timeline: view();
			animation-range: entry 0% cover 30%;
		}
	}

	@keyframes landing-fade-up {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
