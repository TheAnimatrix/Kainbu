<script lang="ts">
	import { ArrowRight, Lock, Server, Users } from 'lucide-svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import LandingProductShot from '$lib/components/landing/LandingProductShot.svelte';
	import { BRAND_KATAKANA, BRAND_NAME } from '$lib/kainbu/constants';

	const boardFeatures = [
		'Drag columns, cards, and link groups',
		'Markdown bodies, checklists, due dates',
		'Tag tones, assignments, and board search',
		'Share boards and see who is online'
	];

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
		content="Kainbu is a self-hosted kanban workspace with boards, notes, and an AI assistant that works on your actual tasks."
	/>
</svelte:head>

<div class="landing-page">
	<header
		class="sticky top-0 z-40 border-b border-app-border/60 bg-app-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-app-bg/70"
	>
		<div
			class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
		>
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
		<section class="landing-hero mx-auto max-w-7xl px-4 pt-12 pb-14 sm:px-6 sm:pt-16 sm:pb-20 lg:px-8 lg:pt-20">
			<div class="grid items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12">
				<div class="max-w-xl">
					<h1
						class="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-app-text sm:text-5xl lg:text-[3.15rem]"
					>
						Kanban, notes, and AI on one board.
					</h1>
					<p class="mt-4 text-base leading-relaxed text-app-subtext sm:text-lg">
						Boards, notes, and an assistant that reads your workspace and proposes changes you
						review before they land.
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

				<LandingProductShot
					src="/landing/kainbu-board.png"
					alt="Kainbu project rail and kanban board with columns, cards, and tags"
					priority
					aspect="16 / 10"
					class="w-full min-w-0"
				/>
			</div>
		</section>

		<section class="border-t border-app-border/70 bg-app-surface/20">
			<div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
				<h2 class="font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
					The board surface you work in every day.
				</h2>
				<p class="mt-4 max-w-2xl text-base leading-relaxed text-app-subtext">
					Planning columns, tagged cards, linked tasks, and a project rail that keeps every board and
					page one click away.
				</p>

				<ul class="mt-10 grid gap-3 sm:grid-cols-2">
					{#each boardFeatures as feature}
						<li
							class="rounded-lg border border-app-border bg-app-bg px-4 py-3.5 text-sm leading-relaxed text-app-text"
						>
							{feature}
						</li>
					{/each}
				</ul>
			</div>
		</section>

		<section class="border-t border-app-border/70">
			<div
				class="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14 lg:px-8"
			>
				<LandingProductShot
					src="/landing/kainbu-ai.png"
					alt="Kainbu AI assistant proposing tag updates with a review step before changes apply"
					fit="contain-top"
					aspect="4 / 5"
					class="order-2 w-full min-w-0 lg:order-1"
				/>

				<div class="order-1 lg:order-2">
					<h2 class="font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
						AI that edits your workspace, not a blank chat.
					</h2>
					<p class="mt-4 max-w-lg text-base leading-relaxed text-app-subtext">
						The assistant reads boards and notes, stages task moves and copy edits, and waits for you
						to accept or reject each update.
					</p>
				</div>
			</div>
		</section>

		<section class="border-t border-app-border/70 bg-app-surface/20">
			<div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
				<h2 class="font-display text-3xl font-extrabold tracking-tight text-app-text sm:text-4xl">
					Notes, sharing, and a stack you control.
				</h2>
				<p class="mt-4 max-w-2xl text-base leading-relaxed text-app-subtext">
					Markdown pages beside your boards. Invite teammates, share links, and run the full stack on
					your own domain.
				</p>

				<div class="mt-10 grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto]">
					<div class="lg:col-span-2">
						<LandingProductShot
							src="/landing/kainbu-notes.png"
							alt="Kainbu notes editor with block-based markdown beside the project sidebar"
							aspect="16 / 9"
						/>
					</div>

					<article
						class="flex flex-col justify-between rounded-xl border border-app-border bg-app-bg p-5 lg:row-span-2"
					>
						<div>
							<div class="mb-3 inline-flex rounded-lg border border-app-border bg-app-element p-2">
								<Server size={18} strokeWidth={1.75} />
							</div>
							<h3 class="text-lg font-semibold text-app-text">Self-hosted by default</h3>
							<p class="mt-2 text-sm leading-relaxed text-app-subtext">
								SvelteKit UI, Hono API, PocketBase storage. Deploy with Docker or Dokploy on your
								own domain.
							</p>
							<p class="mt-3 inline-flex items-center gap-1.5 text-xs text-app-subtext">
								<Lock size={13} strokeWidth={1.75} />
								Your tasks stay on your infrastructure.
							</p>
						</div>

						<ul class="mt-8 flex flex-wrap items-center gap-4">
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
											alt=""
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

					<article class="rounded-xl border border-app-border bg-app-bg p-5 lg:col-span-2">
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
				<div
					class="rounded-xl border border-app-border bg-app-surface/60 px-6 py-10 text-center sm:px-10"
				>
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
