<script lang="ts">
	import {
		ArrowRight,
		CheckCircle2,
		ChevronRight,
		Clock3,
		FileText,
		LayoutPanelTop,
		Link2,
		MessageSquare,
		Plus,
		Search,
		Settings2,
		Sparkles,
		Users
	} from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';

	export let variant: 'signal' | 'flow' | 'facet' = 'signal';

	let period: '7d' | '30d' = '7d';
	let activeProject = 'Firmware R2';
	let searchOpen = false;

	const variants = [
		{ id: 'signal', name: 'Signal Minimal', href: '/design-lab/signal' },
		{ id: 'flow', name: 'Flow Map', href: '/design-lab/flow' },
		{ id: 'facet', name: 'Faceted Editorial', href: '/design-lab/facet' }
	] as const;

	const projects = [
		{ name: 'Firmware R2', meta: '18 open · 6 due', progress: 72, tone: 'violet', members: ['AD', 'MK', 'SR'] },
		{ name: 'Kainbu web', meta: '11 open · 2 due', progress: 58, tone: 'cyan', members: ['AD', 'RN'] },
		{ name: 'Device tooling', meta: '7 open · on track', progress: 84, tone: 'amber', members: ['AD', 'MK'] }
	];

	const activity = [
		{ title: 'DMA buffer validation completed', detail: 'Firmware R2 · Verification', time: '12 min', type: 'done' },
		{ title: 'Crash telemetry linked to watchdog task', detail: 'Firmware R2 · Runtime', time: '34 min', type: 'link' },
		{ title: 'AI proposal ready for review', detail: 'Kainbu web · 4 changes', time: '1 hr', type: 'ai' },
		{ title: 'Mira joined Device tooling', detail: 'Device tooling · Member', time: '3 hr', type: 'people' }
	];

	const due = [
		{ title: 'Verify bootloader rollback', project: 'Firmware R2', due: 'Today · 17:00', tone: 'urgent' },
		{ title: 'Review editor persistence PR', project: 'Kainbu web', due: 'Tomorrow', tone: 'normal' },
		{ title: 'Document probe setup', project: 'Device tooling', due: 'Friday', tone: 'normal' }
	];

	const title = variant === 'signal' ? 'Signal Minimal' : variant === 'flow' ? 'Kainbu Flow Map' : 'Faceted Editorial';
	const subtitle =
		variant === 'signal'
			? 'Quiet, precise, and product-first.'
			: variant === 'flow'
				? 'Relationships become the visual language.'
				: 'The Kainbu mark becomes a spatial system.';
</script>

<svelte:head>
	<title>{title} · Kainbu Design Lab</title>
	<meta name="description" content={`Kainbu dashboard mockup: ${title}`} />
</svelte:head>

<div class={`lab lab--${variant}`}>
	<div class="lab__grain" aria-hidden="true"></div>
	<aside class="rail">
		<a class="brand" href="/design-lab" aria-label="Back to Kainbu design lab">
			<BrandMark size={31} framed={false} />
			<span class="brand__word">Kainbu</span>
			<span class="brand__lab">LAB</span>
		</a>

		<nav class="nav" aria-label="Mock dashboard navigation">
			<a class="nav__item nav__item--active" href="#overview"><LayoutPanelTop size={16} /> Overview</a>
			<a class="nav__item" href="#projects"><span class="nav__glyph"><span></span><span></span></span> Projects</a>
			<a class="nav__item" href="#activity"><Clock3 size={16} /> Activity</a>
			<a class="nav__item" href="#notes"><FileText size={16} /> Pages</a>
			<a class="nav__item" href="#assistant"><MessageSquare size={16} /> Assistant</a>
		</nav>

		<div class="rail__projects">
			<p class="eyebrow">Workspace</p>
			{#each projects as project}
				<button
					type="button"
					class:rail__project--active={activeProject === project.name}
					class="rail__project"
					onclick={() => (activeProject = project.name)}
				>
					<span class={`project-dot project-dot--${project.tone}`}></span>
					<span>{project.name}</span>
					<span class="rail__count">{project.meta.split(' ')[0]}</span>
				</button>
			{/each}
		</div>

		<div class="rail__bottom">
			<a class="nav__item" href="#settings"><Settings2 size={16} /> Settings</a>
			<div class="person">
				<span class="avatar">AD</span>
				<span><b>Adithya</b><small>Workspace owner</small></span>
			</div>
		</div>
	</aside>

	<header class="topbar">
		<div class="mobile-brand"><BrandMark size={26} framed={false} /><span>Kainbu</span></div>
		<div class="crumb"><span>Workspace</span><ChevronRight size={13} /><b>Overview</b></div>
		<div class="topbar__actions">
			<button class:search--open={searchOpen} class="search" type="button" onclick={() => (searchOpen = !searchOpen)}>
				<Search size={15} /><span>{searchOpen ? 'Search projects, tasks…' : 'Search'}</span><kbd>⌘ K</kbd>
			</button>
			<button class="icon-button" type="button" aria-label="Open assistant"><Sparkles size={16} /></button>
			<button class="primary-action" type="button"><Plus size={15} /> New</button>
		</div>
	</header>

	<main class="content" id="overview">
		<section class="intro">
			<div>
				<p class="eyebrow eyebrow--accent">Design direction · {title}</p>
				<h1>Good evening, Adithya.</h1>
				<p>{subtitle} Here is what is moving across your workspace.</p>
			</div>
			<div class="period" aria-label="Time period">
				<button class:period__active={period === '7d'} type="button" onclick={() => (period = '7d')}>7 days</button>
				<button class:period__active={period === '30d'} type="button" onclick={() => (period = '30d')}>30 days</button>
			</div>
		</section>

		{#if variant === 'flow'}
			<section class="flow-hero panel" aria-label="Workspace relationship map">
				<div class="panel__head">
					<div><p class="eyebrow">Live workspace</p><h2>Work in motion</h2></div>
					<span class="live"><i></i> 3 active paths</span>
				</div>
				<div class="map">
					<svg class="map__lines" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
						<defs>
							<linearGradient id="flow-gradient" x1="0" y1="0" x2="1" y2="0">
								<stop offset="0" stop-color="#7c6cff"/><stop offset=".52" stop-color="#36d7e7"/><stop offset="1" stop-color="#ff8a5b"/>
							</linearGradient>
						</defs>
						<path class="map__path" d="M155 78 C300 78 270 147 430 147 S610 72 720 72 S820 72 890 72" />
						<path class="map__path" d="M155 78 C280 78 280 228 430 228 S610 220 720 220 S820 220 890 220" />
						<path class="map__signal map__signal--one" d="M155 78 C300 78 270 147 430 147 S610 72 720 72 S820 72 890 72" />
						<path class="map__signal map__signal--two" d="M155 78 C280 78 280 228 430 228 S610 220 720 220 S820 220 890 220" />
					</svg>
					<div class="map-node map-node--source"><span class="node-icon node-icon--violet"><LayoutPanelTop size={14}/></span><b>Firmware R2</b><small>18 open tasks</small></div>
					<div class="map-node map-node--middle map-node--active"><span class="node-icon node-icon--cyan"><Link2 size={14}/></span><b>Watchdog recovery</b><small>3 linked tasks</small></div>
					<div class="map-node map-node--lower"><span class="node-icon node-icon--amber"><Sparkles size={14}/></span><b>AI proposal</b><small>4 changes staged</small></div>
					<div class="map-node map-node--right"><span class="node-icon"><CheckCircle2 size={14}/></span><b>Release gate</b><small>8 / 11 checks</small></div>
					<div class="map-node map-node--right-lower"><span class="node-icon"><Users size={14}/></span><b>Review queue</b><small>2 reviewers</small></div>
				</div>
			</section>
		{:else if variant === 'facet'}
			<section class="facet-hero">
				<div class="facet-hero__main panel">
					<div class="facet-ribbon" aria-hidden="true"></div>
					<p class="eyebrow">Workspace pulse</p>
					<div class="facet-number">24</div>
					<h2>meaningful actions this week</h2>
					<p>Eight completed tasks, four new links, and one accepted proposal.</p>
					<a href="#activity">Follow the signal <ArrowRight size={14}/></a>
				</div>
				<div class="facet-stack">
					<div class="facet-stat facet-stat--violet"><span>72%</span><p>Firmware R2</p><small>Release readiness</small></div>
					<div class="facet-stat facet-stat--cyan"><span>4</span><p>Linked clusters</p><small>Across 3 projects</small></div>
				</div>
			</section>
		{:else}
			<section class="signal-overview panel">
				<div class="signal-overview__beam" aria-hidden="true"></div>
				<div class="overview-copy">
					<p class="eyebrow">Workspace signal</p>
					<strong>24</strong>
					<span>meaningful actions in the last {period === '7d' ? '7' : '30'} days</span>
				</div>
				<div class="metric-grid">
					<div><small>Open tasks</small><b>36</b><em>−4 this week</em></div>
					<div><small>Completed</small><b>18</b><em>+12%</em></div>
					<div><small>Linked</small><b>09</b><em>3 clusters</em></div>
					<div><small>Due soon</small><b>06</b><em class="metric-warn">2 today</em></div>
				</div>
			</section>
		{/if}

		<section class="dashboard-grid">
			<div class="panel activity-panel" id="activity">
				<div class="panel__head">
					<div><p class="eyebrow">Today</p><h2>Activity signal</h2></div>
					<button type="button" class="text-button">View history <ArrowRight size={13}/></button>
				</div>
				<div class="activity-list">
					{#each activity as item, i}
						<button class="activity-row" type="button">
							<span class={`activity-icon activity-icon--${item.type}`}>
								{#if item.type === 'done'}<CheckCircle2 size={14}/>{:else if item.type === 'link'}<Link2 size={14}/>{:else if item.type === 'ai'}<Sparkles size={14}/>{:else}<Users size={14}/>{/if}
							</span>
							<span class="activity-copy"><b>{item.title}</b><small>{item.detail}</small></span>
							<time>{item.time}</time>
							{#if i === 1}<span class="row-signal" aria-hidden="true"></span>{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="panel due-panel">
				<div class="panel__head"><div><p class="eyebrow">Focus</p><h2>Due soon</h2></div><span class="count">3</span></div>
				<div class="due-list">
					{#each due as task}
						<button class="due-row" type="button">
							<span class:due-check--urgent={task.tone === 'urgent'} class="due-check"></span>
							<span><b>{task.title}</b><small>{task.project}</small></span>
							<time class:due-time--urgent={task.tone === 'urgent'}>{task.due}</time>
						</button>
					{/each}
				</div>
			</div>
		</section>

		<section class="projects-section" id="projects">
			<div class="section-head"><div><p class="eyebrow">Projects</p><h2>Your workspace</h2></div><button type="button" class="text-button">All projects <ArrowRight size={13}/></button></div>
			<div class="project-grid">
				{#each projects as project, i}
					<button class:project-card--active={activeProject === project.name} class="project-card panel" type="button" onclick={() => (activeProject = project.name)}>
						<div class="project-card__top"><span class={`project-mark project-mark--${project.tone}`}><span></span></span><ChevronRight size={15}/></div>
						<h3>{project.name}</h3><p>{project.meta}</p>
						<div class="progress"><span style={`width:${project.progress}%`}></span></div>
						<div class="project-card__foot"><div class="avatars">{#each project.members as member}<span>{member}</span>{/each}</div><small>{project.progress}% ready</small></div>
						{#if i === 0}<div class="project-card__signal" aria-hidden="true"></div>{/if}
					</button>
				{/each}
			</div>
		</section>
	</main>

	<nav class="variant-switcher" aria-label="Design variants">
		<span>Design lab</span>
		{#each variants as item}
			<a class:variant-switcher__active={item.id === variant} href={item.href}>{item.name}</a>
		{/each}
	</nav>
</div>

<style>
	@property --beam-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
	:global(html:has(.lab)), :global(body:has(.lab)) { height: auto; min-height: 100%; overflow: auto; background: #08090a; }
	:global(body:has(.lab)) { color: #f4f5f7; }
	.lab { --bg:#08090a; --rail:#0b0c0e; --surface:#0f1012; --surface-2:#141518; --surface-3:#191b1f; --line:rgb(255 255 255 / .07); --line-soft:rgb(255 255 255 / .045); --text:#f4f5f7; --muted:#8a8f98; --muted-2:#5f646d; --violet:#8075ff; --cyan:#3ed8e6; --amber:#ff9563; position:relative; display:grid; grid-template-columns:228px minmax(0,1fr); grid-template-rows:56px minmax(calc(100dvh - 56px),auto); min-height:100dvh; overflow:hidden; background:var(--bg); color:var(--text); font-family:Inter,ui-sans-serif,system-ui,sans-serif; font-feature-settings:'cv01','ss03'; }
	.lab__grain { position:fixed; inset:0; pointer-events:none; z-index:20; opacity:.025; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E"); }
	button,a { -webkit-tap-highlight-color:transparent; }
	button { font:inherit; }
	.rail { position:fixed; inset:0 auto 0 0; z-index:10; display:flex; width:228px; flex-direction:column; border-right:1px solid var(--line-soft); background:color-mix(in srgb,var(--rail) 96%,transparent); padding:15px 12px 12px; }
	.brand { display:flex; height:34px; align-items:center; gap:8px; padding:0 7px; color:var(--text); text-decoration:none; }
	.brand__word { font-size:14px; font-weight:650; letter-spacing:-.02em; }
	.brand__lab { margin-left:auto; border:1px solid var(--line); border-radius:4px; padding:2px 5px; color:var(--muted); font:500 8px/1.2 ui-monospace,monospace; letter-spacing:.08em; }
	.nav { display:grid; gap:3px; margin-top:25px; }
	.nav__item { display:flex; min-height:34px; align-items:center; gap:10px; border:1px solid transparent; border-radius:7px; padding:0 9px; color:var(--muted); font-size:12.5px; font-weight:500; text-decoration:none; transition:background .15s ease,color .15s ease,border-color .15s ease; }
	.nav__item:hover { background:rgb(255 255 255/.035); color:#d9dce1; }
	.nav__item--active { border-color:var(--line-soft); background:rgb(255 255 255/.045); color:var(--text); box-shadow:inset 0 1px 0 rgb(255 255 255/.025); }
	.nav__glyph { display:grid; grid-template-columns:repeat(2,5px); gap:2px; }
	.nav__glyph span { width:5px; height:12px; border:1px solid currentColor; border-radius:1px; }
	.rail__projects { margin-top:26px; }
	.eyebrow { margin:0; color:var(--muted-2); font:600 9px/1.2 ui-monospace,SFMono-Regular,monospace; letter-spacing:.105em; text-transform:uppercase; }
	.eyebrow--accent { color:color-mix(in srgb,var(--violet) 82%,white); }
	.rail__projects>.eyebrow { padding:0 9px 8px; }
	.rail__project { display:grid; width:100%; grid-template-columns:7px minmax(0,1fr) auto; align-items:center; gap:9px; border:0; border-radius:6px; background:transparent; padding:7px 9px; color:var(--muted); font-size:11.5px; text-align:left; cursor:pointer; }
	.rail__project:hover,.rail__project--active { background:rgb(255 255 255/.03); color:#dfe1e5; }
	.project-dot { width:5px; height:5px; border-radius:50%; background:var(--muted-2); box-shadow:0 0 0 3px rgb(255 255 255/.025); }
	.project-dot--violet{background:var(--violet)}.project-dot--cyan{background:var(--cyan)}.project-dot--amber{background:var(--amber)}
	.rail__count { color:var(--muted-2); font:500 9px ui-monospace,monospace; }
	.rail__bottom { display:grid; gap:7px; margin-top:auto; }
	.person { display:flex; align-items:center; gap:9px; border-top:1px solid var(--line-soft); padding:13px 8px 3px; }
	.avatar { display:grid; width:26px; height:26px; place-items:center; border:1px solid var(--line); border-radius:7px; background:var(--surface-2); color:#d9dbe0; font:600 9px ui-monospace,monospace; }
	.person>span:last-child { display:grid; gap:1px; font-size:10px; }.person b{font-weight:550}.person small{color:var(--muted-2);font-size:9px}
	.topbar { position:sticky; top:0; z-index:9; grid-column:2; display:flex; height:56px; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line-soft); background:rgb(8 9 10/.84); padding:0 26px; backdrop-filter:blur(12px); }
	.crumb { display:flex; align-items:center; gap:7px; color:var(--muted-2); font-size:11px; }.crumb b{color:#d6d8dd;font-weight:500}
	.mobile-brand { display:none; align-items:center; gap:7px; font-size:13px; font-weight:600; }
	.topbar__actions { display:flex; align-items:center; gap:7px; }
	.search { display:flex; width:114px; height:30px; align-items:center; gap:7px; overflow:hidden; border:1px solid var(--line); border-radius:7px; background:rgb(255 255 255/.025); padding:0 8px; color:var(--muted); font-size:10.5px; cursor:pointer; transition:width .2s ease,background .15s ease; }
	.search--open{width:220px}.search span{white-space:nowrap}.search kbd{margin-left:auto;color:var(--muted-2);font:500 8px ui-monospace,monospace}
	.icon-button,.primary-action { display:inline-flex; height:30px; align-items:center; justify-content:center; border-radius:7px; cursor:pointer; transition:transform .15s ease,background .15s ease,border-color .15s ease; }
	.icon-button { width:30px; border:1px solid var(--line); background:rgb(255 255 255/.025); color:var(--muted); }.icon-button:hover{background:var(--surface-2);color:var(--text)}
	.primary-action { gap:6px; border:1px solid rgb(255 255 255/.76); background:#eceef1; padding:0 11px; color:#101113; font-size:10.5px; font-weight:600; box-shadow:inset 0 1px 0 white,0 1px 2px rgb(0 0 0/.45); }.primary-action:hover{background:white;transform:translateY(-1px)}
	.content { grid-column:2; width:min(1180px,100%); margin:0 auto; padding:42px 34px 96px; }
	.intro { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:24px; }
	.intro h1 { margin:8px 0 5px; font-size:clamp(25px,3vw,34px); font-weight:580; line-height:1.08; letter-spacing:-.045em; }.intro>div>p:last-child{margin:0;color:var(--muted);font-size:12.5px}
	.period { display:flex; border:1px solid var(--line); border-radius:7px; background:rgb(255 255 255/.018); padding:3px; }.period button{border:0;border-radius:4px;background:transparent;padding:5px 9px;color:var(--muted);font-size:9.5px;cursor:pointer}.period .period__active{background:var(--surface-3);color:var(--text);box-shadow:0 1px 2px rgb(0 0 0/.25)}
	.panel { position:relative; border:1px solid var(--line); border-radius:10px; background:var(--surface); box-shadow:inset 0 1px 0 rgb(255 255 255/.018),0 8px 30px rgb(0 0 0/.11); }
	.panel__head,.section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; }.panel__head{padding:17px 18px;border-bottom:1px solid var(--line-soft)}.panel__head h2,.section-head h2{margin:4px 0 0;font-size:13px;font-weight:560;letter-spacing:-.015em}
	.signal-overview { display:grid; grid-template-columns:minmax(210px,.78fr) minmax(480px,1.55fr); min-height:170px; overflow:hidden; }
	.signal-overview__beam { position:absolute; inset:-1px; border-radius:inherit; pointer-events:none; padding:1px; opacity:.38; background:conic-gradient(from var(--beam-angle),transparent 0 68%,var(--violet) 76%,var(--cyan) 83%,var(--amber) 89%,transparent 96%); mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0); animation:beam-spin 10s linear infinite; }
	.overview-copy { display:flex; flex-direction:column; justify-content:center; padding:28px 30px; }.overview-copy strong{margin:8px 0 0;font-size:44px;font-weight:520;letter-spacing:-.06em}.overview-copy span{max-width:180px;color:var(--muted);font-size:10.5px;line-height:1.5}
	.metric-grid { display:grid; grid-template-columns:repeat(4,1fr); border-left:1px solid var(--line-soft); }.metric-grid>div{display:flex;flex-direction:column;justify-content:center;border-left:1px solid var(--line-soft);padding:20px}.metric-grid>div:first-child{border-left:0}.metric-grid small{color:var(--muted);font-size:9.5px}.metric-grid b{margin:7px 0 5px;font-size:24px;font-weight:520;font-variant-numeric:tabular-nums;letter-spacing:-.04em}.metric-grid em{color:#72c49a;font-size:8.5px;font-style:normal}.metric-grid .metric-warn{color:var(--amber)}
	.dashboard-grid { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(290px,.8fr); gap:12px; margin-top:12px; }
	.activity-list,.due-list { display:grid; }.activity-row,.due-row{position:relative;display:flex;width:100%;align-items:center;border:0;border-top:1px solid var(--line-soft);background:transparent;color:var(--text);text-align:left;cursor:pointer;transition:background .15s ease}.activity-row:first-child,.due-row:first-child{border-top:0}.activity-row:hover,.due-row:hover{background:rgb(255 255 255/.018)}
	.activity-row{min-height:57px;padding:9px 15px}.activity-icon{display:grid;width:28px;height:28px;flex:none;place-items:center;border:1px solid var(--line);border-radius:7px;background:var(--surface-2);color:var(--muted)}.activity-icon--ai{color:var(--violet)}.activity-icon--link{color:var(--cyan)}.activity-icon--done{color:#72c49a}.activity-copy{display:grid;gap:3px;min-width:0;margin-left:11px}.activity-copy b,.due-row b{overflow:hidden;font-size:10.5px;font-weight:520;text-overflow:ellipsis;white-space:nowrap}.activity-copy small,.due-row small{color:var(--muted-2);font-size:9px}.activity-row time{margin-left:auto;color:var(--muted-2);font:500 8.5px ui-monospace,monospace}
	.row-signal{position:absolute;bottom:0;left:54px;width:70px;height:1px;background:linear-gradient(90deg,transparent,var(--violet),var(--cyan),transparent);filter:drop-shadow(0 0 5px var(--cyan));animation:row-flow 3.8s ease-in-out infinite}
	.text-button { display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--muted);font-size:9px;cursor:pointer}.text-button:hover{color:var(--text)}
	.count{display:grid;width:20px;height:20px;place-items:center;border:1px solid var(--line);border-radius:5px;color:var(--muted);font:500 8px ui-monospace,monospace}
	.due-row{min-height:62px;padding:9px 15px}.due-check{width:12px;height:12px;flex:none;border:1px solid var(--muted-2);border-radius:3px}.due-check--urgent{border-color:color-mix(in srgb,var(--amber) 70%,transparent);box-shadow:0 0 10px rgb(255 149 99/.08)}.due-row>span:nth-child(2){display:grid;gap:3px;min-width:0;margin-left:10px}.due-row time{margin-left:auto;color:var(--muted-2);font:500 8px ui-monospace,monospace}.due-time--urgent{color:var(--amber)!important}
	.projects-section{margin-top:28px}.section-head{margin-bottom:11px}.project-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.project-card{position:relative;overflow:hidden;padding:17px;color:var(--text);text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}.project-card:hover{transform:translateY(-2px);border-color:rgb(255 255 255/.12);background:var(--surface-2)}.project-card--active{border-color:rgb(128 117 255/.28)}
	.project-card__top{display:flex;align-items:center;justify-content:space-between;color:var(--muted-2)}.project-mark{position:relative;display:block;width:22px;height:22px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2)}.project-mark span{position:absolute;inset:5px;clip-path:polygon(0 0,100% 0,100% 50%,50% 100%,0 50%);background:var(--violet)}.project-mark--cyan span{background:var(--cyan)}.project-mark--amber span{background:var(--amber)}
	.project-card h3{margin:18px 0 4px;font-size:12px;font-weight:560}.project-card>p{margin:0;color:var(--muted);font-size:9.5px}.progress{height:2px;margin:19px 0 12px;overflow:hidden;border-radius:3px;background:rgb(255 255 255/.045)}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--violet),var(--cyan))}.project-card__foot{display:flex;align-items:center;justify-content:space-between}.project-card__foot small{color:var(--muted-2);font:500 8px ui-monospace,monospace}.avatars{display:flex}.avatars span{display:grid;width:21px;height:21px;place-items:center;border:2px solid var(--surface);border-radius:50%;background:var(--surface-3);color:var(--muted);font:600 7px ui-monospace,monospace}.avatars span+span{margin-left:-5px}.project-card__signal{position:absolute;top:0;left:-35%;width:26%;height:1px;background:linear-gradient(90deg,transparent,var(--violet),var(--cyan),transparent);filter:drop-shadow(0 0 4px var(--violet));animation:card-signal 6s ease-in-out infinite}
	.variant-switcher { position:fixed; right:18px; bottom:17px; z-index:30; display:flex; align-items:center; gap:3px; border:1px solid rgb(255 255 255/.09); border-radius:9px; background:rgb(14 15 17/.9); padding:4px; box-shadow:0 12px 40px rgb(0 0 0/.45); backdrop-filter:blur(14px); }.variant-switcher>span{padding:0 7px;color:var(--muted-2);font:600 8px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.variant-switcher a{border-radius:5px;padding:6px 8px;color:var(--muted);font-size:8.5px;text-decoration:none}.variant-switcher a:hover{color:var(--text)}.variant-switcher .variant-switcher__active{background:rgb(255 255 255/.07);color:var(--text)}
	/* Flow map */
	.flow-hero{min-height:350px;overflow:hidden}.live{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font:500 8.5px ui-monospace,monospace}.live i{width:5px;height:5px;border-radius:50%;background:#72c49a;box-shadow:0 0 9px #72c49a}.map{position:relative;height:282px;overflow:hidden;background:radial-gradient(circle at 50% 48%,rgb(128 117 255/.05),transparent 34%)}.map::before{content:'';position:absolute;inset:0;opacity:.25;background-image:radial-gradient(rgb(255 255 255/.12) .6px,transparent .6px);background-size:16px 16px;mask-image:radial-gradient(circle,#000,transparent 75%)}.map__lines{position:absolute;inset:0;width:100%;height:100%}.map__path,.map__signal{fill:none;vector-effect:non-scaling-stroke}.map__path{stroke:rgb(255 255 255/.075);stroke-width:1}.map__signal{stroke:url(#flow-gradient);stroke-width:1.25;stroke-dasharray:2 140;stroke-linecap:round;filter:drop-shadow(0 0 4px rgb(62 216 230/.6));animation:map-flow 4.8s linear infinite}.map__signal--two{animation-delay:-2.2s;animation-duration:5.7s}
	.map-node{position:absolute;display:grid;grid-template-columns:25px 1fr;grid-template-rows:1fr 1fr;width:150px;height:53px;align-items:center;border:1px solid var(--line);border-radius:8px;background:#111215;padding:8px 10px;box-shadow:inset 0 1px 0 rgb(255 255 255/.025),0 8px 24px rgb(0 0 0/.24)}.map-node b{font-size:8.5px;font-weight:550}.map-node small{grid-column:2;color:var(--muted-2);font-size:7.5px}.node-icon{grid-row:1/3;display:grid;width:20px;height:20px;place-items:center;border:1px solid var(--line);border-radius:5px;color:var(--muted)}.node-icon--violet{color:var(--violet)}.node-icon--cyan{color:var(--cyan)}.node-icon--amber{color:var(--amber)}.map-node--source{left:6%;top:51px}.map-node--middle{left:37%;top:117px}.map-node--lower{left:37%;top:198px}.map-node--right{right:5%;top:45px}.map-node--right-lower{right:5%;top:192px}.map-node--active::before{content:'';position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:conic-gradient(from var(--beam-angle),transparent 0 62%,var(--violet),var(--cyan),var(--amber),transparent 96%);mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);opacity:.72;animation:beam-spin 7s linear infinite}
	/* Faceted */
	.lab--facet{--violet:#9a7cff;--cyan:#40d8d0;--amber:#ff7b60}.facet-hero{display:grid;grid-template-columns:1.55fr .75fr;gap:11px}.facet-hero__main{min-height:260px;overflow:hidden;padding:29px 31px}.facet-ribbon{position:absolute;right:-16%;bottom:-52%;width:78%;height:150%;opacity:.14;transform:rotate(-18deg);background:linear-gradient(135deg,transparent 5%,var(--violet) 26%,var(--cyan) 48%,var(--amber) 68%,transparent 84%);filter:blur(22px);animation:facet-drift 10s ease-in-out infinite alternate}.facet-hero__main::after{content:'';position:absolute;right:0;bottom:0;width:31%;height:68%;background:linear-gradient(145deg,transparent 49.6%,rgb(255 255 255/.055) 50%,transparent 50.4%);pointer-events:none}.facet-number{position:relative;margin-top:17px;font-size:64px;font-weight:470;line-height:.9;letter-spacing:-.075em}.facet-hero h2{position:relative;margin:9px 0 6px;font-size:17px;font-weight:540;letter-spacing:-.025em}.facet-hero__main>p:last-of-type{position:relative;margin:0;max-width:390px;color:var(--muted);font-size:10.5px}.facet-hero__main>a{position:absolute;bottom:27px;left:31px;display:inline-flex;align-items:center;gap:6px;color:#d9dbe0;font-size:9.5px;text-decoration:none}.facet-stack{display:grid;grid-template-rows:1fr 1fr;gap:11px}.facet-stat{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:19px 20px}.facet-stat::before{content:'';position:absolute;top:0;right:0;width:42%;height:55%;clip-path:polygon(100% 0,100% 100%,0 0);background:color-mix(in srgb,var(--facet-color) 14%,transparent)}.facet-stat--violet{--facet-color:var(--violet)}.facet-stat--cyan{--facet-color:var(--cyan)}.facet-stat span{font-size:27px;font-weight:510;letter-spacing:-.05em}.facet-stat p{margin:7px 0 2px;font-size:10px;font-weight:550}.facet-stat small{color:var(--muted-2);font-size:8.5px}
	@keyframes beam-spin{to{--beam-angle:360deg}}@keyframes row-flow{0%,100%{opacity:0;transform:translateX(-30px)}40%,60%{opacity:.8}70%{transform:translateX(280px);opacity:0}}@keyframes card-signal{0%,20%{opacity:0;transform:translateX(0)}35%{opacity:.8}65%,100%{opacity:0;transform:translateX(550px)}}@keyframes map-flow{to{stroke-dashoffset:-142}}@keyframes facet-drift{to{transform:rotate(-13deg) translate3d(-5%,3%,0);filter:blur(28px) hue-rotate(20deg)}}
	@media(max-width:900px){.lab{grid-template-columns:72px minmax(0,1fr)}.rail{width:72px;padding-inline:9px}.brand{justify-content:center}.brand__word,.brand__lab,.nav__item:not(.nav__item--active){font-size:0}.nav__item{justify-content:center;padding:0}.nav__item--active{font-size:0}.rail__projects,.person>span:last-child{display:none}.person{justify-content:center;padding-inline:0}.topbar,.content{grid-column:2}.signal-overview{grid-template-columns:1fr}.metric-grid{border-top:1px solid var(--line-soft);border-left:0}.overview-copy{display:none}.dashboard-grid{grid-template-columns:1fr}.facet-hero{grid-template-columns:1fr}.facet-stack{grid-template-columns:1fr 1fr;grid-template-rows:auto}.map-node--right,.map-node--right-lower{right:2%}.map-node--source{left:2%}}
	@media(max-width:680px){.lab{display:block}.rail{display:none}.topbar{grid-column:auto;padding:0 15px}.mobile-brand{display:flex}.crumb{display:none}.search{width:30px}.search span,.search kbd{display:none}.search--open{width:160px}.search--open span{display:block}.content{grid-column:auto;padding:28px 14px 100px}.intro{align-items:flex-start}.intro h1{font-size:27px}.period{flex:none}.metric-grid{grid-template-columns:repeat(2,1fr)}.metric-grid>div{min-height:95px;border-top:1px solid var(--line-soft)}.project-grid{grid-template-columns:1fr}.variant-switcher{right:8px;bottom:8px;max-width:calc(100vw - 16px);overflow-x:auto}.variant-switcher>span{display:none}.flow-hero{min-height:390px}.map{height:320px}.map-node{width:132px}.map-node--source{left:5%;top:24px}.map-node--middle{left:auto;right:5%;top:95px}.map-node--lower{left:5%;top:174px}.map-node--right{right:5%;top:245px}.map-node--right-lower{display:none}.map__lines{display:none}.facet-hero__main{min-height:240px}.facet-stack{grid-template-columns:1fr 1fr}.activity-row time{display:none}}
	@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}.signal-overview__beam,.map-node--active::before{opacity:.28}}
</style>
