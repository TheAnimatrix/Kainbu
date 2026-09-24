<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ExternalLink } from '$lib/icons';
	import LandingHeader from '$lib/components/marketing/LandingHeader.svelte';
	import LandingFooter from '$lib/components/marketing/LandingFooter.svelte';
	import WorkspaceVideo from '$lib/components/marketing/WorkspaceVideo.svelte';
	import MotionText from '$lib/components/marketing/MotionText.svelte';
	import { reveal } from '$lib/components/marketing/motion';
</script>

<svelte:head>
	<title>Kainbu — Good things start here.</title>
	<meta name="description" content="Kainbu. A workspace you can make your own." />
	<meta name="robots" content="noindex" />
</svelte:head>

<LandingHeader />
<main id="main">
	<section class="hero landing-wrap" aria-labelledby="hero-title">
		<div class="hero-copy">
			<h1 id="hero-title"><MotionText lines={['Good things', 'start here.']} italic="here." /></h1>
			<a use:reveal={{ delay: 550 }} class="landing-button" href={resolve('/')}
				>Make a little room <ArrowRight size={17} /></a
			>
			<a class="hero-secondary" href="#workspace"
				>Take a look around <span aria-hidden="true">↓</span></a
			>
		</div>
		<div class="folio" use:reveal={{ kind: 'panel', delay: 520 }}>
			<div class="page-sample">
				<img
					src="/marketing/kainbu-page.webp"
					width="1440"
					height="864"
					alt="The launch brief in Kainbu"
				/>
			</div>
		</div>
	</section>

	<section id="workspace" class="workspace landing-wrap" aria-labelledby="workspace-title">
		<div class="section-heading" use:reveal>
			<h2 id="workspace-title">One project. <em>All the pieces.</em></h2>
		</div>
		<div use:reveal={{ kind: 'panel' }}><WorkspaceVideo /></div>
	</section>

	<section
		id="ownership"
		class="ownership landing-wrap"
		aria-labelledby="ownership-title"
		use:reveal={{ selector: ':scope > *', stagger: 100 }}
	>
		<div class="ownership-copy">
			<p class="landing-kicker">Independent, by design.</p>
			<h2 id="ownership-title">Make it<br /><em>your own.</em></h2>
			<p>
				Your tools should fit the way you think.<br />Choose where your workspace lives, who joins
				in,<br class="desktop-break" /> and how AI helps.
			</p>
			<a
				class="landing-text-link"
				href="https://github.com/TheAnimatrix/Kainbu"
				target="_blank"
				rel="noreferrer">Make yourself at home <ExternalLink size={14} /></a
			>
		</div>
		<dl>
			<div>
				<dt>Bring your people.</dt>
				<dd>Invite your team into the project. Share the plan, the context, and the work ahead.</dd>
			</div>
			<div>
				<dt>Choose your models.</dt>
				<dd>Use your own provider keys and choose the AI models you want to work with.</dd>
			</div>
			<div>
				<dt>Keep it on your terms.</dt>
				<dd>Self-host with Docker. Give your workspace a home on infrastructure you control.</dd>
			</div>
		</dl>
	</section>
</main>
<LandingFooter statement="What have you been meaning to make?" />

<style>
	.hero {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 54px;
		align-items: center;
		padding-block: 70px 76px;
	}
	h1 {
		font-family: var(--landing-display);
		font-weight: 400;
		font-size: clamp(68px, 7.1vw, 95px);
		line-height: 1.02;
		letter-spacing: -5px;
		margin: 25px 0 24px;
	}
	h1 {
		--motion-italic: #657749;
	}
	.hero-copy > .landing-button {
		margin-top: 28px;
	}
	.hero-secondary {
		display: flex;
		align-items: center;
		gap: 15px;
		width: fit-content;
		min-height: 44px;
		margin-top: 7px;
		font-size: 11px;
		color: var(--landing-muted);
	}
	.hero-secondary:hover {
		color: var(--landing-ink);
	}
	.folio {
		min-width: 0;
		background: #dce3cb;
		padding: 24px 24px 17px;
		border-radius: 3px;
		transform: rotate(2deg);
	}
	.page-sample {
		background: #fff;
		border: 1px solid #c6cfb9;
		border-radius: 4px;
		padding: 9px 9px 7px;
		box-shadow: 0 4px 7px #3b4f3710;
	}
	.section-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 20px;
		padding-block: 25px;
		border-top: 1px solid var(--landing-line);
	}
	.section-heading h2 {
		font-family: var(--landing-display);
		font-size: 32px;
		font-weight: 400;
		letter-spacing: -0.8px;
	}
	.ownership {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 120px;
		padding-block: 69px 68px;
		border-bottom: 1px solid var(--landing-line);
	}
	.ownership-copy h2 {
		font-family: var(--landing-display);
		font-size: 65px;
		line-height: 1.04;
		letter-spacing: -2px;
		font-weight: 400;
		margin-block: 23px;
	}
	.ownership-copy h2 em {
		color: #67794e;
	}
	.ownership-copy > p:not(.landing-kicker) {
		color: var(--landing-muted);
		font-size: 13px;
		line-height: 1.8;
	}
	.ownership-copy .landing-text-link {
		margin-top: 16px;
	}
	dl {
		align-self: center;
	}
	dl > div {
		padding-block: 23px;
		border-bottom: 1px solid var(--landing-line);
	}
	dl > div:first-child {
		padding-top: 0;
	}
	dt {
		font-family: var(--landing-display);
		font-size: 24px;
		letter-spacing: -0.45px;
	}
	dd {
		margin-top: 8px;
		max-width: 380px;
		font-size: 13px;
		line-height: 1.8;
		color: var(--landing-muted);
	}
	@media (max-width: 1000px) {
		.hero {
			gap: 30px;
			padding-block: 55px;
		}
		h1 {
			font-size: clamp(54px, 7.3vw, 76px);
		}
		.folio {
			padding: 18px 15px 12px;
		}
		.ownership {
			gap: 65px;
		}
	}
	@media (max-width: 760px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 39px;
			padding-block: 46px 47px;
		}
		.hero-copy {
			text-align: center;
		}
		h1 {
			font-size: clamp(67px, 13vw, 90px);
			letter-spacing: -3.6px;
		}
		.hero-secondary {
			margin-inline: auto;
		}
		.folio {
			width: min(490px, calc(100% - 18px));
			margin: auto;
		}
		.section-heading h2 {
			font-size: 26px;
		}
		.ownership {
			grid-template-columns: 1fr;
			gap: 28px;
			padding-block: 46px;
		}
		.ownership-copy h2 {
			font-size: 58px;
		}
	}
	@media (max-width: 360px) {
		.desktop-break {
			display: none;
		}
		h1 {
			font-size: 54px;
		}
	}
</style>
