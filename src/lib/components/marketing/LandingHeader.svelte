<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ExternalLink } from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
</script>

<header class="landing-wrap">
	<a class="wordmark" href={resolve('/landing')} aria-label="Kainbu home"
		><BrandMark size={31} framed={false} /><span>Kainbu</span></a
	>
	<nav aria-label="Main navigation">
		<a class="section-link" href="#workspace">The workspace</a>
		<a class="section-link" href="#ownership">Make it yours</a>
		<a
			class="source-link"
			href="https://github.com/TheAnimatrix/Kainbu"
			target="_blank"
			rel="noreferrer">GitHub <ExternalLink size={12} /></a
		>
	</nav>
	<a class="open-app" href={resolve('/')}>Open app <ArrowRight size={15} /></a>
</header>

<style>
	header {
		height: 89px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 28px;
		border-bottom: 1px solid var(--landing-line);
	}
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 23px;
		font-weight: 650;
		letter-spacing: -1px;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 30px;
		margin-left: auto;
		margin-right: 15px;
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		font-size: 12px;
		color: var(--landing-muted);
	}
	nav a:hover {
		color: var(--landing-ink);
	}
	.open-app {
		display: inline-flex;
		align-items: center;
		gap: 19px;
		min-height: 40px;
		border: 1px solid var(--landing-line);
		border-radius: 5px;
		padding: 9px 14px;
		font-size: 12px;
		font-weight: 500;
	}
	.open-app:hover {
		background: var(--landing-soft);
		border-color: var(--landing-muted);
	}
	@media (max-width: 700px) {
		header {
			height: 76px;
			gap: 18px;
		}
		nav {
			margin-right: 0;
			gap: 18px;
		}
		.section-link {
			display: none;
		}
	}
	@media (max-width: 430px) {
		nav {
			display: none;
		}
		.open-app {
			gap: 15px;
		}
	}
</style>
