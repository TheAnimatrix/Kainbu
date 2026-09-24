<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ExternalLink } from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import LandingHeader from '$lib/components/marketing/LandingHeader.svelte';
	import LandingFooter from '$lib/components/marketing/LandingFooter.svelte';
	import WorkspaceVideo from '$lib/components/marketing/WorkspaceVideo.svelte';
	import MotionText from '$lib/components/marketing/MotionText.svelte';
	import { reveal } from '$lib/components/marketing/motion';
</script>

<svelte:head>
	<title>Kainbu — Make space. Make progress.</title>
	<meta name="description" content="Kainbu. A workspace you can make your own." />
	<meta name="robots" content="noindex" />
</svelte:head>

<LandingHeader />
<main id="main">
	<section class="hero landing-wrap" aria-labelledby="hero-title">
		<div class="hero-grid">
			<h1 id="hero-title"><MotionText lines={['Make space.', 'Make progress.']} /></h1>
			<div class="hero-aside" use:reveal={{ delay: 440 }}>
				<a class="landing-button" href={resolve('/')}>Open Kainbu <ArrowRight size={17} /></a><a
					class="source-note"
					href="https://github.com/TheAnimatrix/Kainbu"
					target="_blank"
					rel="noreferrer">Self-hostable. Source on GitHub. <ExternalLink size={11} /></a
				>
			</div>
		</div>
	</section>

	<section id="workspace" class="workspace landing-wrap" aria-label="Explore the Kainbu workspace">
		<div use:reveal={{ kind: 'panel', delay: 540 }}><WorkspaceVideo /></div>
	</section>

	<section
		id="ownership"
		class="ownership landing-wrap"
		aria-labelledby="ownership-title"
		use:reveal={{ selector: ':scope > *', stagger: 100 }}
	>
		<div class="ownership-title">
			<p class="landing-kicker">Control comes standard.</p>
			<h2 id="ownership-title">A tool you can<br />call <em>your own.</em></h2>
			<div class="ownership-mark" aria-hidden="true"><BrandMark size={84} framed={false} /></div>
		</div>
		<div class="ownership-body">
			<p class="ownership-intro">
				Keep the work on your infrastructure.<br />Choose the intelligence you work with.<br />Bring
				the people you want to build with.
			</p>
			<div class="ownership-specs">
				<p><span>HOSTING</span>Self-host with Docker</p>
				<p><span>INTELLIGENCE</span>Your provider keys. Your models.</p>
				<p><span>COLLABORATION</span>Shared projects and invitations</p>
				<p><span>ACCESS</span>In the browser. From the CLI.</p>
			</div>
			<a
				class="landing-text-link"
				href="https://github.com/TheAnimatrix/Kainbu"
				target="_blank"
				rel="noreferrer">Read the source <ExternalLink size={14} /></a
			>
		</div>
	</section>

	<section
		class="terminal-section landing-wrap"
		aria-labelledby="terminal-title"
		use:reveal={{ selector: ':scope > *', stagger: 100 }}
	>
		<div>
			<p class="landing-kicker">Another way in.</p>
			<h2 id="terminal-title">At home in<br />your terminal, too.</h2>
			<a
				class="landing-text-link"
				href="https://github.com/TheAnimatrix/Kainbu/blob/main/docs/CLI.md"
				target="_blank"
				rel="noreferrer">Explore the CLI <ArrowRight size={15} /></a
			>
		</div>
		<div class="terminal">
			<div class="terminal-bar"><span>kainbu / cli</span><span>QUICK START</span></div>
			<pre><code
					><span class="comment"># Install the command-line tool</span>
<span class="prompt">$</span> npm install -g kainbu

<span class="comment"># After connecting your workspace</span>
<span class="prompt">$</span> kainbu project list
<span class="prompt">$</span> kainbu ls</code
				></pre>
		</div>
	</section>
</main>
<LandingFooter statement="Your next project starts with a little space." />

<style>
	.hero {
		padding-block: 38px 50px;
	}
	.hero-grid {
		display: grid;
		grid-template-columns: 1.85fr 1fr;
		gap: 45px;
		align-items: end;
		margin-top: 47px;
	}
	h1 {
		font-size: clamp(59px, 6.8vw, 87px);
		font-weight: 450;
		line-height: 1.055;
		letter-spacing: -0.065em;
	}
	h1 {
		--motion-secondary: #9ca88d;
	}
	.hero-aside {
		padding-bottom: 2px;
	}
	.hero-aside .landing-button {
		margin-top: 25px;
		min-width: 175px;
		justify-content: space-between;
	}
	.source-note {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		margin-top: 6px;
		color: #a2ac9a;
		font-size: 10px;
	}
	.source-note:hover {
		color: var(--landing-ink);
	}
	.landing-kicker {
		font-family: monospace;
		font-size: 10px;
		letter-spacing: 0.07em;
		color: #9bac8f;
	}
	.ownership {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 100px;
		border-block: 1px solid var(--landing-line);
		padding-block: 65px;
	}
	.ownership h2 {
		font-size: 47px;
		font-weight: 400;
		line-height: 1.15;
		letter-spacing: -2px;
		margin-top: 23px;
	}
	.ownership h2 em {
		font-style: normal;
		color: var(--landing-accent);
	}
	.ownership-mark {
		color: #839575;
		margin-top: 29px;
		margin-left: -12px;
	}
	.ownership-intro {
		font-size: 15px;
		line-height: 1.9;
		color: #b8c0b1;
	}
	.ownership-specs {
		margin-top: 30px;
	}
	.ownership-specs p {
		display: grid;
		grid-template-columns: 128px 1fr;
		align-items: baseline;
		gap: 20px;
		padding-block: 11px;
		border-bottom: 1px solid #30382f;
		font-size: 11px;
	}
	.ownership-specs span {
		font-family: monospace;
		color: #a2b391;
		font-size: 9px;
	}
	.ownership-body .landing-text-link {
		margin-top: 16px;
		font-size: 12px;
	}
	.terminal-section {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 100px;
		padding-block: 57px 63px;
		border-bottom: 1px solid var(--landing-line);
	}
	.terminal-section h2 {
		font-size: 31px;
		font-weight: 400;
		line-height: 1.2;
		letter-spacing: -1px;
		margin-top: 18px;
	}
	.terminal-section .landing-text-link {
		margin-top: 15px;
		font-size: 12px;
	}
	.terminal {
		min-width: 0;
		border: 1px solid #3d4738;
		background: #1c221b;
		border-radius: 3px;
	}
	.terminal-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 13px 20px;
		border-bottom: 1px solid #354031;
		font-family: monospace;
		font-size: 10px;
		color: #b1c59c;
	}
	.terminal-bar span:last-child {
		font-size: 8px;
		color: #a6b897;
	}
	pre {
		padding: 24px 21px;
		font-size: 12px;
		line-height: 1.85;
		overflow-x: auto;
	}
	.comment {
		color: #8f9d83;
	}
	.prompt {
		color: #c5df9c;
	}
	@media (max-width: 1000px) {
		.hero-grid {
			gap: 28px;
			grid-template-columns: 1.7fr 1fr;
		}
		h1 {
			font-size: 67px;
		}
		.ownership-specs p {
			grid-template-columns: 102px 1fr;
			gap: 15px;
		}
	}
	@media (max-width: 760px) {
		.hero {
			padding-block: 27px 35px;
		}
		.hero-grid {
			grid-template-columns: 1fr;
			gap: 26px;
			margin-top: 34px;
		}
		h1 {
			font-size: clamp(38px, 12.1vw, 72px);
		}
		.hero-aside {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 16px 35px;
		}
		.hero-aside .landing-button {
			margin-top: 0;
		}
		.source-note {
			width: 100%;
			margin-top: 0;
		}
		.ownership h2 {
			font-size: 42px;
		}
		.ownership-mark {
			display: none;
		}
		.ownership-specs p {
			grid-template-columns: 111px 1fr;
		}
	}
	@media (max-width: 380px) {
		.hero-aside {
			gap: 19px;
		}
		pre {
			font-size: 10px;
		}
	}
</style>
