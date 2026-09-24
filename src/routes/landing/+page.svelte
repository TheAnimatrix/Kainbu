<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ExternalLink, Plus } from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import WorkspaceVideo from '$lib/components/marketing/WorkspaceVideo.svelte';
	import MotionText from '$lib/components/marketing/MotionText.svelte';
	import { reveal } from '$lib/components/marketing/motion';

</script>

<svelte:head>
	<title>Kainbu — Projects have a home. AI lends a hand.</title>
	<meta name="description" content="Plan projects with boards, notes, and a helping hand from AI. Free and open source. Easy to self-host with Docker." />
	<meta property="og:title" content="Kainbu — Projects have a home. AI lends a hand." />
	<meta property="og:description" content="Plan projects with boards, notes, and a helping hand from AI. Free and open source. Easy to self-host with Docker." />
	<meta property="og:type" content="website" />
	<meta name="theme-color" content="#101112" />
</svelte:head>

<div id="top" class="index-page">
	<div class="index-frame">
		<div class="main-column">
			<header class="utility-bar">
				<a class="header-brand" href="#top" aria-label="Kainbu home"
					><BrandMark size={29} framed={false} />Kainbu</a
				>
				<div class="utility-actions">
					<a href="https://github.com/TheAnimatrix/Kainbu" target="_blank" rel="noreferrer"
						>GitHub <ExternalLink size={11} /></a
					>
				</div>
			</header>
			<main id="main">
				<section
					id="overview"
					data-index-section
					class="intro page-section"
					aria-labelledby="intro-title"
				>
					<div class="hero-art">
						<img
							src="/marketing/kainbu-landscape-1600.webp"
							srcset="/marketing/kainbu-landscape-640.webp 640w, /marketing/kainbu-landscape-960.webp 960w, /marketing/kainbu-landscape-1600.webp 1600w"
							sizes="(max-width: 600px) 150vw, 1200px"
							width="1600"
							height="900"
							alt=""
							fetchpriority="high"
						/>
					</div>
					<h1 id="intro-title"><MotionText lines={['Projects have a home.', 'AI lends a hand.']} /></h1>
					<p class="intro-subtitle" use:reveal={{ delay: 460 }}>
						Plan projects with boards, notes, and a helping hand from AI. Free and open source.
						Easy to self-host with Docker.
					</p>
					<div class="intro-actions" use:reveal={{ delay: 570 }}>
						<a class="primary-action" href={resolve('/')}>Open Kainbu <ArrowRight size={14} /></a><a
							class="quiet-action"
							href="#workspace">Take a look <span aria-hidden="true">↓</span></a
						>
					</div>
				</section>
				<section
					id="workspace"
					data-index-section
					class="workspace-section page-section"
					aria-labelledby="workspace-title"
				>
					<h2 id="workspace-title" class="sr-only">Edit your workspace with Kainbu AI</h2>
					<div use:reveal={{ kind: 'panel', delay: 540 }}>
						<WorkspaceVideo feature="ai" description="AI reads a beta launch brief, updates the board with acceptance checks, and drafts an announcement page" />
					</div>
					<div class="hero-film-caption"><span>01 / AI chat</span><p>Give AI the context. Get a plan and a first draft.</p></div>
				</section>
				<section id="manual" data-index-section class="feature-section page-section" aria-labelledby="manual-title">
					<div class="feature-copy"><span class="feature-number">02 / Hands on</span><h2 id="manual-title"><MotionText text="Move it yourself." delay={0} /></h2><p>Edit a card, then drag it into the next column.</p></div>
					<div class="feature-film" use:reveal={{ kind: 'panel', delay: 130 }}><WorkspaceVideo feature="manual" description="A Kainbu card is edited and dragged to In progress" /></div>
				</section>
				<section id="notes" data-index-section class="feature-section page-section" aria-labelledby="notes-title">
					<div class="feature-copy"><span class="feature-number">03 / Notes</span><h2 id="notes-title"><MotionText text="Write the plan beside the board." delay={0} /></h2><p>Open a page and write down what needs to happen next.</p></div>
					<div class="feature-film" use:reveal={{ kind: 'panel', delay: 130 }}><WorkspaceVideo feature="notes" description="Pages opens and a launch checklist is written in Kainbu" /></div>
				</section>
				<section
					id="cli"
					data-index-section
					class="cli-section page-section"
					aria-labelledby="cli-title"
				>
					<div class="cli-copy feature-copy">
						<span class="feature-number">04 / Agent workflow</span>
						<h2 id="cli-title">
							<MotionText text="From the terminal." delay={0} />
						</h2>
						<p>An agent reads the Kainbu skill, checks tasks, does the work, and updates the board.</p>
						<a
							class="cli-guide"
							href="https://github.com/TheAnimatrix/Kainbu/tree/main/packages/kainbu-cli"
							target="_blank"
							rel="noreferrer">Explore the CLI <ArrowRight size={13} /></a
						>
					</div>
					<div class="cli-demo feature-film" use:reveal={{ kind: 'panel', delay: 160 }}><WorkspaceVideo feature="agent" description="Terminal agent uses the Kainbu skill and CLI to inspect and update tasks" /></div>
				</section>
				<section
					id="ownership"
					data-index-section
					class="ownership-section page-section"
					aria-labelledby="ownership-title"
				>
					<div class="section-heading">
						<h2 id="ownership-title"><MotionText text="On your terms" delay={0} /></h2>
					</div>
					<dl class="ownership-list" use:reveal={{ selector: ':scope > div', stagger: 110 }}>
						<div>
							<dt>Self-hosting</dt>
							<dd>Run Kainbu on your own infrastructure with Docker.</dd>
						</div>
						<div>
							<dt>AI providers</dt>
							<dd>Bring your own keys. Choose the models you work with.</dd>
						</div>
						<div>
							<dt>Collaboration</dt>
							<dd>Invite your people into the project. Keep the context shared.</dd>
						</div>
					</dl>
					<a
						class="source-note"
						href="https://github.com/TheAnimatrix/Kainbu"
						target="_blank"
						rel="noreferrer"
						><span aria-hidden="true">↳</span> Look around the source <ExternalLink size={11} /></a
					>
				</section>
				<section
					id="questions"
					data-index-section
					class="questions-section page-section"
					aria-labelledby="questions-title"
				>
					<div class="section-heading">
						<h2 id="questions-title"><MotionText text="A few answers" delay={0} /></h2>
					</div>
					<div class="questions-list" use:reveal={{ selector: 'details', stagger: 95 }}>
						<details name="index-faq">
							<summary>Do I need to use AI?<Plus size={14} /></summary>
							<p>No. Connecting an AI provider is optional.</p>
						</details>
						<details name="index-faq">
							<summary>Can I run it on my own server?<Plus size={14} /></summary>
							<p>
								Yes. The repository includes a Docker setup and the instructions to get started. <a
									href="https://github.com/TheAnimatrix/Kainbu#readme"
									target="_blank"
									rel="noreferrer">Read the setup guide <ExternalLink size={11} /></a
								>
							</p>
						</details>
					</div>
				</section>
				<section class="closing page-section" aria-labelledby="closing-title">
					<div>
						<h2 id="closing-title">
							<MotionText text="Start your next project." delay={0} />
						</h2>
					</div>
					<a class="primary-action" href={resolve('/')}>Open Kainbu <ArrowRight size={14} /></a>
				</section>
			</main>
			<footer class="index-footer">
				<span>Kainbu <span class="footer-separator">/</span> A place for your projects.</span><a
					href="#top">Back to top <span aria-hidden="true">↑</span></a
				>
			</footer>
		</div>
	</div>
</div>

<style>
	.index-page {
		--motion-secondary: #e8edf3;
		--index-bg: #101112;
		--index-panel: #141517;
		--index-card: #191a1d;
		--index-hover: #232427;
		--index-text: #edeeef;
		--index-muted: #a1a4aa;
		--index-faint: #6e737a;
		--index-border: #2b2d31;
		--index-rule: #42464d;
		--index-blue: #9eb9e8;
		--index-button: #e9ecef;
		--index-button-text: #171a1e;
		--landing-accent: var(--index-blue);
		min-height: 100dvh;
		background: var(--index-bg);
		color: var(--index-text);
		color-scheme: dark;
		font-size: 13px;
		line-height: 1.65;
		transition:
			background-color 400ms ease,
			color 400ms ease;
	}
	:global(html:has(.index-page)) {
		scroll-behavior: smooth;
	}
	.index-page :global(::selection) {
		color: var(--index-text);
		background: color-mix(in srgb, var(--index-blue) 25%, var(--index-bg));
	}
	.index-page :global(:is(a, button, summary, [tabindex]):focus-visible) {
		outline: 2px solid var(--index-blue);
		outline-offset: 4px;
	}
	.index-frame {
		position: relative;
		width: min(1200px, calc(100% - 96px));
		margin-inline: auto;
		min-height: 100dvh;
		border-inline: 1px solid var(--index-border);
	}
	.index-frame::before,
	.index-frame::after {
		content: '';
		position: absolute;
		inset-block: 0;
		width: 9px;
		background: var(--index-border);
		mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cpath d='M-2 2L2-2M0 8L8 0M6 10L10 6' stroke='white' stroke-width='.7'/%3E%3C/svg%3E");
		pointer-events: none;
	}
	.index-frame::before {
		left: -10px;
	}
	.index-frame::after {
		right: -10px;
	}
	.main-column {
		min-width: 0;
	}
	.utility-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		height: 62px;
		padding-inline: 35px;
		border-bottom: 1px solid var(--index-border);
	}
	.header-brand {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 19px;
		font-weight: 550;
		letter-spacing: -0.75px;
	}
	.header-brand :global(.brand-mark) {
		transition: transform 200ms ease;
	}
	.header-brand:hover :global(.brand-mark) {
		transform: translateY(-2px);
	}
	.utility-actions {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.utility-actions a {
		display: flex;
		align-items: center;
		gap: 7px;
		min-height: 36px;
		color: var(--index-muted);
		font-size: 11px;
	}
	.utility-actions a:hover {
		color: var(--index-text);
	}
	.page-section {
		padding-inline: 44px;
	}
	.intro {
		isolation: isolate;
		position: relative;
		overflow: hidden;
		min-height: 610px;
		padding-top: 62px;
		padding-bottom: 220px;
		color: #f7f7f0;
	}
	.hero-art {
		position: absolute;
		z-index: -1;
		inset: -36px 0 0;
		pointer-events: none;
	}
	.hero-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 56%;
	}
	h1 {
		max-width: 680px;
		margin-top: 23px;
		font-size: clamp(43px, 4.9vw, 61px);
		font-weight: 450;
		letter-spacing: -0.055em;
		line-height: 1.065;
	}
	.intro-subtitle {
		max-width: 510px;
		margin-top: 22px;
		color: #edf1f0;
		font-size: 14px;
		line-height: 1.6;
	}
	.intro-actions {
		display: flex;
		align-items: center;
		gap: 26px;
		margin-top: 28px;
	}
	.primary-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 41px;
		gap: 24px;
		border: 1px solid transparent;
		border-radius: 5px;
		padding: 9px 15px;
		background: var(--index-button);
		color: var(--index-button-text);
		font-size: 12px;
		font-weight: 500;
		transition:
			background-color 160ms ease,
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 160ms ease;
	}
	.primary-action:hover {
		background: color-mix(in srgb, var(--index-button) 87%, var(--index-bg));
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--index-button) 9%, transparent);
	}
	.primary-action :global(svg) {
		transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.primary-action:hover :global(svg) {
		transform: translateX(3px);
	}
	.primary-action:active {
		transform: scale(0.97);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--index-button) 15%, transparent);
	}
	.intro .primary-action {
		background: #f0f2f3;
		color: #222b35;
	}
	.intro .primary-action:hover {
		background: #fff;
		box-shadow: 0 0 0 3px #f0f2f315;
	}
	.quiet-action {
		display: flex;
		align-items: center;
		min-height: 41px;
		gap: 15px;
		font-size: 12px;
		color: #f0f2f5;
	}
	.quiet-action > span {
		transition: transform 180ms ease;
	}
	.quiet-action:hover > span {
		transform: translateY(3px);
	}
	.section-heading {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 23px;
	}
	.section-heading h2 {
		font-size: 17px;
		font-weight: 500;
		letter-spacing: -0.4px;
	}
	.workspace-section {
		position: relative;
		margin-top: -168px;
		padding-inline: 30px;
		padding-bottom: 38px;
	}
	.hero-film-caption {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		padding: 17px 3px 4px;
		font-size: 11px;
		color: var(--index-muted);
	}
	.hero-film-caption p { color: var(--index-text); }
	.feature-section {
		display: grid;
		grid-template-columns: 1fr;
		gap: 26px;
		align-items: center;
		border-top: 1px solid var(--index-border);
		padding-block: 58px;
	}
	.feature-copy h2 {
		font-size: clamp(27px, 3vw, 37px);
		font-weight: 450;
		letter-spacing: -1.4px;
		line-height: 1.18;
	}
	.feature-copy p {
		max-width: 260px;
		margin-top: 14px;
		font-size: 12px;
		color: var(--index-muted);
	}
	.feature-number {
		display: block;
		margin-bottom: 18px;
		font-size: 10px;
		letter-spacing: .13em;
		text-transform: uppercase;
		color: var(--index-blue);
	}
	.feature-film { min-width: 0; }
	.cli-section {
		display: grid;
		grid-template-columns: 1fr;
		gap: 26px;
		align-items: center;
		border-top: 1px solid var(--index-border);
		padding-block: 58px;
	}
	.cli-copy h2 {
		font-size: clamp(27px, 3vw, 37px);
		font-weight: 450;
		letter-spacing: -1.4px;
		line-height: 1.18;
	}
	.cli-guide {
		display: inline-flex;
		align-items: center;
		gap: 22px;
		min-height: 44px;
		margin-top: 18px;
		font-size: 11px;
	}
	.cli-guide :global(svg) {
		transition: transform 180ms ease;
	}
	.cli-guide:hover :global(svg) {
		transform: translateX(4px);
	}
	.cli-demo {
		min-width: 0;
	}
	.ownership-section,
	.questions-section {
		display: grid;
		grid-template-columns: 0.85fr 1.5fr;
		column-gap: 60px;
		border-top: 1px solid var(--index-border);
		padding-block: 49px;
	}
	.ownership-section .section-heading,
	.questions-section .section-heading {
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 8px 12px;
	}
	.ownership-list {
		grid-column: 2;
		grid-row: 1 / 3;
	}
	.ownership-list > div {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr);
		gap: 7px 18px;
		padding-block: 17px;
		border-bottom: 1px solid var(--index-border);
		font-size: 12px;
	}
	.ownership-list > div:first-child {
		padding-top: 0;
	}
	.ownership-list dt {
		font-weight: 500;
	}
	.ownership-list dd {
		color: var(--index-muted);
		line-height: 1.85;
	}
	.source-note {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		align-self: end;
		justify-self: start;
		min-height: 38px;
		font-size: 11px;
		color: var(--index-muted);
	}
	.source-note > span {
		color: var(--index-blue);
	}
	.source-note:hover {
		color: var(--index-text);
	}
	.questions-list details {
		border-bottom: 1px solid var(--index-border);
	}
	.questions-list summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		min-height: 50px;
		padding-block: 13px;
		cursor: pointer;
		font-size: 12px;
		list-style: none;
	}
	.questions-list details:first-child summary {
		padding-top: 0;
		min-height: 36px;
	}
	.questions-list summary::-webkit-details-marker {
		display: none;
	}
	.questions-list summary :global(svg) {
		flex-shrink: 0;
		color: var(--index-muted);
		transition:
			transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
			color 160ms ease;
	}
	.questions-list summary:hover :global(svg) {
		color: var(--index-text);
	}
	.questions-list details[open] summary :global(svg) {
		transform: rotate(45deg);
		color: var(--index-blue);
	}
	.questions-list details p {
		padding: 0 24px 18px 0;
		color: var(--index-muted);
		font-size: 12px;
		line-height: 1.85;
	}
	.questions-list details p a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--index-text);
		text-decoration: underline;
		text-decoration-color: var(--index-rule);
		text-underline-offset: 3px;
	}
	@supports (interpolate-size: allow-keywords) {
		.questions-list details {
			interpolate-size: allow-keywords;
		}
		.questions-list details::details-content {
			block-size: 0;
			overflow: clip;
			transition:
				block-size 240ms ease,
				content-visibility 240ms allow-discrete;
		}
		.questions-list details[open]::details-content {
			block-size: auto;
		}
	}
	.closing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 28px;
		border-top: 1px solid var(--index-border);
		padding-block: 40px 45px;
	}
	.closing h2 {
		margin-top: 8px;
		font-size: 28px;
		font-weight: 450;
		letter-spacing: -1px;
	}
	.index-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		border-top: 1px solid var(--index-border);
		padding: 19px 44px 33px;
		color: var(--index-muted);
		font-size: 10px;
	}
	.footer-separator {
		color: var(--index-faint);
		padding-inline: 10px;
	}
	.index-footer > a {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		min-height: 36px;
		white-space: nowrap;
	}
	.index-footer > a:hover {
		color: var(--index-text);
	}
	@media (min-width: 1500px) {
		.intro {
			min-height: 650px;
			padding-top: 75px;
		}
		.workspace-section {
			margin-top: -178px;
		}
	}
	@media (min-width: 901px) {
		.feature-section,
		.cli-section {
			grid-template-columns: minmax(0, 0.65fr) minmax(0, 1fr);
			column-gap: clamp(28px, 4vw, 56px);
		}
		#notes {
			grid-template-columns: minmax(0, 1fr) minmax(0, 0.65fr);
		}
		#notes .feature-film {
			grid-column: 1;
			grid-row: 1;
		}
		#notes .feature-copy {
			grid-column: 2;
			grid-row: 1;
		}
	}
	@media (max-width: 1000px) {
		.cli-section, .feature-section {
			gap: 24px;
		}
		.index-frame {
			width: calc(100% - 48px);
		}
		.utility-bar {
			padding-inline: 26px;
		}
		.page-section {
			padding-inline: 30px;
		}
		.intro {
			min-height: 585px;
			padding-top: 56px;
		}
		h1 {
			font-size: 53px;
		}
		.workspace-section {
			padding-inline: 21px;
			margin-top: -150px;
		}
		.ownership-section,
		.questions-section {
			column-gap: 35px;
		}
		.index-footer {
			padding-inline: 30px;
		}
	}
	@media (max-width: 760px) {
		.cli-section, .feature-section {
			grid-template-columns: 1fr;
			gap: 28px;
			padding-block: 36px;
		}
		.cli-copy h2 {
			font-size: 34px;
		}
		.cli-guide {
			margin-top: 12px;
		}
		.utility-bar {
			height: 60px;
			padding-inline: 23px;
		}
		.utility-actions a {
			min-height: 42px;
		}
		.intro {
			min-height: 552px;
			padding-top: 44px;
		}
		h1 {
			font-size: 49px;
		}
		.ownership-section,
		.questions-section {
			grid-template-columns: 1fr;
			row-gap: 17px;
			padding-block: 33px;
		}
		.ownership-section .section-heading,
		.questions-section .section-heading {
			margin-bottom: 0;
		}
		.ownership-list {
			grid-column: 1;
			grid-row: auto;
		}
		.source-note {
			grid-row: 3;
		}
		.closing h2 {
			font-size: 24px;
		}
		.index-footer {
			padding-bottom: 88px;
		}
	}
	@media (max-width: 480px) {
		.index-frame {
			width: calc(100% - 24px);
		}
		.index-frame::before,
		.index-frame::after {
			width: 5px;
		}
		.index-frame::before {
			left: -6px;
		}
		.index-frame::after {
			right: -6px;
		}
		.utility-bar {
			padding-inline: 17px;
			gap: 15px;
		}
		.header-brand {
			font-size: 18px;
		}
		.utility-actions {
			gap: 10px;
		}
		.page-section {
			padding-inline: 21px;
		}
		.intro {
			min-height: 545px;
			padding-top: 40px;
			padding-bottom: 205px;
		}
		.hero-art {
			inset-inline: -100% -15%;
			inset-block: 0 -60px;
		}
		.hero-art img {
			object-position: 48% center;
		}
		h1 {
			font-size: 42px;
			margin-top: 20px;
		}
		.intro-actions {
			margin-top: 24px;
			gap: 23px;
		}
		.intro-subtitle {
			font-size: 13px;
		}
		.primary-action,
		.quiet-action {
			min-height: 44px;
			font-size: 11px;
		}
		.primary-action {
			gap: 18px;
		}
		.workspace-section {
			margin-top: -145px;
			padding-inline: 11px;
			padding-bottom: 27px;
		}
		.section-heading h2 {
			font-size: 16px;
		}
		.ownership-list > div {
			grid-template-columns: 1fr;
			gap: 5px;
			padding-block: 15px;
		}
		.questions-list summary {
			font-size: 12px;
		}
		.closing {
			flex-direction: column;
			align-items: flex-start;
			gap: 23px;
			padding-block: 32px;
		}
		.closing h2 {
			font-size: 23px;
		}
		.index-footer {
			padding-inline: 21px;
			gap: 15px;
			font-size: 9px;
		}
		.index-footer > span {
			max-width: 160px;
		}
		.footer-separator {
			padding-inline: 4px;
		}
	}
	@media (max-width: 350px) {
		h1 {
			font-size: 31px;
			letter-spacing: -1.25px;
		}
		.intro-actions {
			gap: 18px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.questions-list details::details-content {
			transition: none;
		}
		:global(html:has(.index-page)) {
			scroll-behavior: auto;
		}
	}
</style>
