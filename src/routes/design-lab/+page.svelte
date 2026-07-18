<script lang="ts">
	import ArrowRight from '$lib/icons/components/ArrowRight.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';

	const variants = [
		{ href: '/design-lab/signal', number: '01', name: 'Signal Minimal', stance: 'The cleanest SaaS direction. Near-black surfaces with one quiet spectral perimeter signal.', tone: 'violet' },
		{ href: '/design-lab/flow', number: '02', name: 'Kainbu Flow Map', stance: 'The product model becomes the identity: linked tasks, proposals, and release paths form a living map.', tone: 'cyan' },
		{ href: '/design-lab/facet', number: '03', name: 'Faceted Editorial', stance: 'A bolder interpretation of the polygon mark with asymmetric composition and restrained spectral light.', tone: 'ember' }
	];
</script>

<svelte:head><title>Kainbu Flow · Design Lab</title><meta name="description" content="Three near-black Kainbu dashboard design directions." /></svelte:head>

<div class="index">
	<div class="grain" aria-hidden="true"></div>
	<header><a href="/design-lab"><BrandMark size={34} framed={false}/><span>Kainbu</span></a><span>DESIGN LAB · 01</span></header>
	<main>
		<div class="intro"><p>Near-black SaaS · Kainbu identity</p><h1>Three ways to make<br/>work feel <em>connected.</em></h1><span>Each route uses the same dashboard content. Compare hierarchy, density, geometry, and how the subtle signal animation carries identity.</span></div>
		<div class="grid">
			{#each variants as item}
				<a class={`card card--${item.tone}`} href={item.href}>
					<div class="card__preview"><div class="preview-rail"></div><div class="preview-top"></div><div class="preview-title"></div><div class="preview-hero"><i></i></div><div class="preview-row"><span></span><span></span></div><b>{item.number}</b></div>
					<div class="card__copy"><div><h2>{item.name}</h2><p>{item.stance}</p></div><span>Open route <ArrowRight size={14}/></span></div>
				</a>
			{/each}
		</div>
	</main>
</div>

<style>
	:global(html:has(.index)),:global(body:has(.index)){height:auto;min-height:100%;overflow:auto;background:#08090a}:global(body:has(.index)){color:#f4f5f7}
	.index{position:relative;min-height:100dvh;overflow:hidden;background:#08090a;color:#f4f5f7;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.grain{position:fixed;inset:0;pointer-events:none;opacity:.025;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E")}
	header{display:flex;height:68px;align-items:center;justify-content:space-between;border-bottom:1px solid rgb(255 255 255/.055);padding:0 clamp(20px,5vw,72px)}header a{display:flex;align-items:center;gap:9px;color:inherit;font-size:14px;font-weight:650;text-decoration:none}header>span{color:#62666d;font:600 9px ui-monospace,monospace;letter-spacing:.12em}
	main{width:min(1240px,100%);margin:0 auto;padding:clamp(52px,8vw,100px) clamp(20px,5vw,58px) 90px}.intro{max-width:690px}.intro>p{margin:0 0 16px;color:#8a80ff;font:600 10px ui-monospace,monospace;letter-spacing:.11em;text-transform:uppercase}.intro h1{margin:0;font-size:clamp(42px,6vw,72px);font-weight:520;line-height:.98;letter-spacing:-.065em}.intro h1 em{background:linear-gradient(90deg,#8a80ff,#42d8e8,#ff8d61);background-size:180% 100%;background-clip:text;color:transparent;font-style:normal;animation:shift 7s ease-in-out infinite alternate}.intro>span{display:block;max-width:580px;margin-top:24px;color:#8a8f98;font-size:14px;line-height:1.65}
	.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:62px}.card{overflow:hidden;border:1px solid rgb(255 255 255/.075);border-radius:12px;background:#0f1012;color:inherit;text-decoration:none;transition:transform .2s ease,border-color .2s ease}.card:hover{transform:translateY(-4px);border-color:rgb(255 255 255/.14)}.card__preview{position:relative;height:220px;overflow:hidden;border-bottom:1px solid rgb(255 255 255/.055);background:#0b0c0e}.preview-rail{position:absolute;inset:0 auto 0 0;width:19%;border-right:1px solid rgb(255 255 255/.05);background:#0d0e10}.preview-top{position:absolute;top:0;right:0;left:19%;height:15%;border-bottom:1px solid rgb(255 255 255/.05)}.preview-title{position:absolute;top:25%;left:25%;width:31%;height:7px;border-radius:2px;background:rgb(255 255 255/.42)}.preview-hero{position:absolute;top:37%;right:7%;bottom:28%;left:25%;overflow:hidden;border:1px solid rgb(255 255 255/.065);border-radius:7px;background:#121316}.preview-hero i{position:absolute;top:-1px;left:-30%;width:32%;height:1px;background:linear-gradient(90deg,transparent,var(--tone),#41d8e7,transparent);filter:drop-shadow(0 0 4px var(--tone));animation:signal 5s ease-in-out infinite}.preview-row{position:absolute;right:7%;bottom:8%;left:25%;display:grid;grid-template-columns:1.5fr 1fr;gap:5px}.preview-row span{height:33px;border:1px solid rgb(255 255 255/.055);border-radius:5px;background:#101113}.card__preview>b{position:absolute;right:16px;top:14px;color:rgb(255 255 255/.2);font:500 10px ui-monospace,monospace}.card--violet{--tone:#8578ff}.card--cyan{--tone:#3ed8e6}.card--ember{--tone:#ff8462}.card__copy{display:flex;min-height:152px;flex-direction:column;justify-content:space-between;padding:22px}.card__copy h2{margin:0 0 9px;font-size:16px;font-weight:560;letter-spacing:-.025em}.card__copy p{margin:0;color:#7f848d;font-size:11.5px;line-height:1.55}.card__copy>span{display:flex;align-items:center;gap:6px;color:#cfd1d6;font-size:10px}
	@keyframes signal{0%,20%{opacity:0;transform:translateX(0)}35%{opacity:1}70%,100%{opacity:0;transform:translateX(420px)}}@keyframes shift{to{background-position:100% 50%}}
	@media(max-width:840px){.grid{grid-template-columns:1fr}.card{display:grid;grid-template-columns:1fr 1fr}.card__preview{height:auto;min-height:190px;border-right:1px solid rgb(255 255 255/.055);border-bottom:0}}@media(max-width:560px){header{height:58px}.intro h1{font-size:42px}.grid{margin-top:44px}.card{display:block}.card__preview{height:180px;border-right:0;border-bottom:1px solid rgb(255 255 255/.055)}}@media(prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
</style>
