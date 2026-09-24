<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ExternalLink } from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
	let { statement = 'Make room for your next good idea.' }: { statement?: string } = $props();
</script>

<section class="closing landing-wrap" aria-labelledby="closing-title">
	<div>
		<p class="landing-kicker">Yours to begin.</p>
		<h2 id="closing-title">{statement}</h2>
	</div>
	<a class="landing-button" href={resolve('/')}>Open Kainbu <ArrowRight size={17} /></a>
</section>
<footer class="landing-wrap">
	<a class="footer-brand" href={resolve('/landing')}><BrandMark size={25} framed={false} />Kainbu</a
	>
	<p>A considered place to get things done.</p>
	<a class="source" href="https://github.com/TheAnimatrix/Kainbu" target="_blank" rel="noreferrer"
		>Made to be yours <ExternalLink size={12} /></a
	>
</footer>

<style>
	.closing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 36px;
		padding-block: 73px 75px;
		border-bottom: 1px solid var(--landing-line);
	}
	.closing .landing-kicker {
		color: var(--landing-muted);
		margin-bottom: 14px;
	}
	h2 {
		max-width: 730px;
		font-family: var(--landing-display);
		font-size: clamp(30px, 3.2vw, 43px);
		font-weight: 400;
		letter-spacing: -1.6px;
		line-height: 1.2;
		text-wrap: balance;
	}
	.landing-button {
		flex-shrink: 0;
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding-block: 27px 36px;
		font-size: 11px;
		color: var(--landing-muted);
	}
	.footer-brand {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 18px;
		letter-spacing: -0.7px;
		font-weight: 600;
		color: var(--landing-ink);
	}
	.source {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		gap: 8px;
	}
	.source:hover {
		color: var(--landing-ink);
	}
	@media (max-width: 760px) {
		.closing {
			flex-direction: column;
			align-items: flex-start;
			padding-block: 46px;
			gap: 27px;
		}
		footer {
			flex-wrap: wrap;
			gap: 8px 20px;
		}
		footer p {
			order: 3;
			width: 100%;
		}
	}
</style>
