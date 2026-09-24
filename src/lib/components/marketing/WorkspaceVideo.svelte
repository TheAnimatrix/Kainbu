<script lang="ts">
	import { onMount, tick } from 'svelte';
	let { feature = 'ai', description = 'A Kainbu workspace demonstration' }: {
		feature?: 'ai' | 'manual' | 'notes' | 'agent';
		description?: string;
	} = $props();
	let player: HTMLDivElement;
	let video: HTMLVideoElement;
	let loaded = $state(false);
	let ready = $state(false);
	let playing = $state(false);
	let failed = $state(false);
	let expanded = $state(false);
	let nativeControls = $state(false);
	let pendingSeek: number | undefined;
	let wantsPlayback = false;
	let visible = false;
	const mediaName = $derived(feature === 'ai' ? 'kainbu-ai-beta' : `kainbu-${feature}`);
	const source = $derived(`/marketing/${mediaName}.mp4`);
	const descriptionId = $derived(`workspace-film-description-${feature}`);

	async function play() {
		loaded = true;
		await tick();
		try {
			await video.play();
		} catch {
			playing = false;
		}
	}
	function syncPlayback() {
		if (visible && !document.hidden && wantsPlayback) void play();
		else video.pause();
	}
	function toggle() {
		wantsPlayback = !playing;
		if (wantsPlayback) void play();
		else video.pause();
	}
	function applyPendingSeek() {
		if (pendingSeek !== undefined && video.readyState >= 1) {
			video.currentTime = pendingSeek;
			pendingSeek = undefined;
		}
	}
	function replay() {
		wantsPlayback = true;
		pendingSeek = 0;
		applyPendingSeek();
		void play();
	}
	async function expand() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (player.requestFullscreen) await player.requestFullscreen();
			else {
				const nativeVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
				if (nativeVideo.webkitEnterFullscreen) nativeVideo.webkitEnterFullscreen();
				else nativeControls = true;
			}
		} catch {
			nativeControls = true;
		}
	}
	onMount(() => {
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		wantsPlayback = !motion.matches;
		const motionChanged = () => {
			wantsPlayback = !motion.matches;
			syncPlayback();
		};
		const fullscreenChanged = () => {
			expanded = document.fullscreenElement === player;
		};
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (visible) loaded = true;
				syncPlayback();
			},
			{ threshold: 0.2 }
		);
		observer.observe(player);
		document.addEventListener('visibilitychange', syncPlayback);
		document.addEventListener('fullscreenchange', fullscreenChanged);
		motion.addEventListener('change', motionChanged);
		return () => {
			observer.disconnect();
			video.pause();
			document.removeEventListener('visibilitychange', syncPlayback);
			document.removeEventListener('fullscreenchange', fullscreenChanged);
			motion.removeEventListener('change', motionChanged);
		};
	});
</script>

<div class="workspace-film" bind:this={player}>
	<video
		bind:this={video}
		src={loaded ? source : undefined}
		width={1440}
		height={864}
		muted
		loop
		playsinline
		controls={nativeControls}
		preload="metadata"
		aria-label={description}
		aria-describedby={descriptionId}
		onloadedmetadata={applyPendingSeek}
		oncanplay={() => {
			ready = true;
			syncPlayback();
		}}
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		onerror={() => {
			failed = true;
			playing = false;
		}}
	></video>
	{#if !ready}
		<picture class="film-poster" aria-hidden="true">
			<img src={`/marketing/${mediaName}-poster.webp`} width="1440" height="864" alt="" />
		</picture>
	{/if}
	{#if failed}<p class="film-error" role="status">The video could not load.</p>{/if}
	<div class="film-controls">
		<button
			onclick={toggle}
			aria-label={playing ? `Pause ${feature} demo` : `Play ${feature} demo`}
			disabled={failed}
		>
			<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
				{#if playing}<path d="M4 3h3v10H4zm5 0h3v10H9z" />{:else}<path d="M4 2.5v11L13 8z" />{/if}
			</svg>
		</button>
		<button onclick={replay} aria-label={`Replay ${feature} demo`} disabled={failed}>
			<svg
				viewBox="0 0 16 16"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.3"
				aria-hidden="true"><path d="M3 6a5 5 0 1 1-.2 3M3 2v4h4" /></svg
			>
		</button>
		<button
			onclick={expand}
			aria-label={expanded ? `Exit fullscreen ${feature} demo` : `Expand ${feature} demo`}
		>
			<svg
				viewBox="0 0 16 16"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.3"
				aria-hidden="true"><path d="M2 6V2h4m4 0h4v4M2 10v4h4m4 0h4v-4" /></svg
			>
		</button>
	</div>
</div>
<p id={descriptionId} class="sr-only">{description} using an example Kainbu project.</p>

<style>
	.workspace-film {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--index-rule);
		border-radius: 8px;
		background: #101012;
		box-shadow: 0 18px 65px #00000024;
	}
	video {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 5 / 3;
		object-fit: contain;
	}
	.film-poster {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.film-poster img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.film-controls {
		position: absolute;
		left: 12px;
		bottom: 12px;
		display: flex;
		align-items: center;
		padding: 2px;
		color: #dfe1e6;
		background: #252529;
		border: 1px solid #414147;
		border-radius: 6px;
		opacity: 0.55;
		transition: opacity 180ms;
	}
	.workspace-film:hover .film-controls,
	.film-controls:focus-within {
		opacity: 1;
	}
	button {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 4px;
		transition:
			color 160ms,
			background 160ms;
	}
	button:hover {
		color: #fff;
		background: #3b3b42;
	}
	.film-error {
		position: absolute;
		inset: 40% 15% auto;
		padding: 16px;
		background: #252529;
		color: #eee;
		text-align: center;
		font-size: 12px;
	}
	.workspace-film:fullscreen {
		border: 0;
		border-radius: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.workspace-film:fullscreen video {
		width: 100%;
		height: 100%;
	}
	@media (max-width: 767px) {
		.film-controls {
			left: 10px;
			bottom: 10px;
			opacity: 0.8;
		}
		button {
			width: 40px;
			height: 40px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button,
		.film-controls {
			transition: none;
		}
	}
</style>
