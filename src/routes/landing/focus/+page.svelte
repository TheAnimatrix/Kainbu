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
	<title>Kainbu — Less managing. More making.</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="Kainbu. A workspace you can make your own." />
	<meta property="og:title" content="Kainbu — Less managing. More making." />
	<meta
		property="og:description"
		content="The plan, the thinking, and the next step. Finally, in the same place."
	/>
	<meta property="og:type" content="website" />
</svelte:head>

<LandingHeader />
<main id="main">
	<section class="hero landing-wrap" aria-labelledby="hero-title">
		<h1 id="hero-title"><MotionText lines={['Less managing.', 'More making.']} /></h1>
		<div class="hero-actions" use:reveal={{ delay: 550 }}>
			<a class="landing-button" href={resolve('/')}
				>Start your next project <ArrowRight size={16} /></a
			>
			<a class="landing-text-link" href="#workspace"
				>Meet your workspace <span aria-hidden="true">↓</span></a
			>
		</div>
	</section>

	<section id="workspace" class="workspace landing-wrap" aria-label="Explore the Kainbu workspace">
		<div class="product-stage" use:reveal={{ kind: 'panel', delay: 600 }}>
			<WorkspaceVideo />
		</div>
	</section>

	<section id="ownership" class="ownership" aria-labelledby="ownership-title">
		<div class="landing-wrap ownership-inner" use:reveal={{ selector: ':scope > *', stagger: 100 }}>
			<div class="ownership-heading">
				<p class="landing-kicker">Built to be yours.</p>
				<h2 id="ownership-title">Your work.<br /><span>Your rules.</span></h2>
				<a
					class="landing-text-link"
					href="https://github.com/TheAnimatrix/Kainbu"
					target="_blank"
					rel="noreferrer">Explore the source <ExternalLink size={14} /></a
				>
			</div>
			<dl>
				<div>
					<dt><span>01</span>A home you control.</dt>
					<dd>
						Self-host with Docker. Your boards, pages, and project data live on your infrastructure.
					</dd>
				</div>
				<div>
					<dt><span>02</span>Your choice of AI.</dt>
					<dd>
						Connect your own provider keys. Keep the help you want, with the models you choose.
					</dd>
				</div>
				<div>
					<dt><span>03</span>Room for your people.</dt>
					<dd>
						Invite your team into the project. Share the plan and keep the details in the same
						place.
					</dd>
				</div>
			</dl>
		</div>
	</section>
</main>
<LandingFooter />

<style>
	.hero {
		padding-top: 45px;
		padding-bottom: 32px;
		text-align: center;
	}
	h1 {
		font-size: clamp(58px, 5.9vw, 76px);
		font-weight: 500;
		letter-spacing: -0.064em;
		line-height: 1.06;
		margin: 24px 0 24px;
	}
	h1 {
		--motion-secondary: #747d86;
	}
	.hero-actions {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 26px;
		margin-top: 27px;
	}
	.product-stage {
		padding: 23px 24px 20px;
		background: #f0f1f1;
		border: 1px solid #e3e5de;
		border-radius: 11px;
	}
	.ownership {
		background: #eaf0e6;
		border-block: 1px solid #dce3d7;
	}
	.ownership-inner {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 90px;
		padding-block: 68px 72px;
	}
	.ownership h2 {
		margin: 25px 0 19px;
		font-size: 60px;
		font-weight: 400;
		line-height: 1.03;
		letter-spacing: -3.5px;
	}
	.ownership h2 span {
		color: #748269;
	}
	.ownership .landing-kicker {
		color: #5b6b53;
	}
	dl > div {
		padding: 20px 0;
		border-bottom: 1px solid #ced8c7;
	}
	dl > div:first-child {
		padding-top: 0;
	}
	dt {
		display: flex;
		align-items: baseline;
		gap: 22px;
		font-size: 16px;
		font-weight: 500;
		letter-spacing: -0.35px;
	}
	dt span {
		color: #5e7253;
		font-family: monospace;
		font-size: 11px;
	}
	dd {
		margin-top: 8px;
		margin-left: 37px;
		font-size: 13px;
		line-height: 1.8;
		color: #606c5b;
		max-width: 345px;
	}
	@media (min-width: 1500px) {
		.hero {
			padding-top: 80px;
			padding-bottom: 54px;
		}
	}
	@media (max-width: 800px) {
		.hero {
			padding-top: 52px;
		}
		.ownership-inner {
			gap: 50px;
		}
		.ownership h2 {
			font-size: 50px;
		}
	}
	@media (max-width: 600px) {
		.hero {
			padding-top: 42px;
			padding-bottom: 35px;
		}
		h1 {
			font-size: clamp(39px, 12vw, 66px);
			letter-spacing: -0.065em;
			margin-top: 24px;
		}
		.hero-actions {
			flex-direction: column;
			gap: 9px;
			margin-top: 22px;
		}
		.product-stage {
			padding: 12px 12px 13px;
			border-radius: 7px;
			margin-inline: -7px;
		}
		.ownership-inner {
			grid-template-columns: 1fr;
			gap: 28px;
			padding-block: 44px;
		}
		.ownership h2 {
			font-size: 52px;
		}
	}
</style>
