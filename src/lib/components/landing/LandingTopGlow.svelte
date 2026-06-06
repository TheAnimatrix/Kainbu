<script lang="ts">
	import { browser } from '$app/environment';
	import { DEFAULT_BACKGROUND_THEME, getChatOrbStyle } from '$lib/kainbu/backgrounds';
	import type { ColorMode } from '$lib/kainbu/types';

	let colorMode = $state<ColorMode>('dark');

	const orbStyle = $derived(getChatOrbStyle(DEFAULT_BACKGROUND_THEME, '', colorMode));

	const syncColorMode = () => {
		if (!browser) return;
		colorMode = document.documentElement.dataset.colorMode === 'light' ? 'light' : 'dark';
	};

	$effect(() => {
		if (!browser) return;

		syncColorMode();
		const observer = new MutationObserver(syncColorMode);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-color-mode']
		});
		return () => observer.disconnect();
	});
</script>

<div class="landing-top-glow" style={orbStyle} aria-hidden="true">
	<svg class="landing-top-glow__filters" aria-hidden="true">
		<filter id="landing-smoke-turbulence" x="-30%" y="-30%" width="160%" height="160%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.004 0.009"
				numOctaves="2"
				seed="2"
				result="noise"
			>
				<animate
					attributeName="baseFrequency"
					dur="32s"
					values="0.004 0.009;0.007 0.014;0.003 0.006;0.005 0.011;0.004 0.009"
					repeatCount="indefinite"
				/>
				<animate attributeName="seed" dur="48s" values="2;6;11;4;2" repeatCount="indefinite" />
			</feTurbulence>
			<feDisplacementMap in="SourceGraphic" in2="noise" scale="48" xChannelSelector="R" yChannelSelector="G" />
		</filter>
	</svg>

	<div class="landing-top-glow__field">
		<div class="landing-top-glow__plume landing-top-glow__plume--warm-a"></div>
		<div class="landing-top-glow__plume landing-top-glow__plume--warm-b"></div>
		<div class="landing-top-glow__plume landing-top-glow__plume--cool-a"></div>
		<div class="landing-top-glow__plume landing-top-glow__plume--cool-b"></div>
		<div class="landing-top-glow__plume landing-top-glow__plume--violet"></div>
		<div class="landing-top-glow__plume landing-top-glow__plume--mist"></div>
	</div>
</div>

<style>
	.landing-top-glow {
		position: absolute;
		inset: 0 0 auto;
		z-index: 0;
		height: min(54rem, 82vh);
		overflow: hidden;
		pointer-events: none;
		-webkit-mask-image: linear-gradient(
			to bottom,
			rgb(0 0 0 / 1) 0%,
			rgb(0 0 0 / 0.94) 38%,
			rgb(0 0 0 / 0.42) 68%,
			transparent 100%
		);
		mask-image: linear-gradient(
			to bottom,
			rgb(0 0 0 / 1) 0%,
			rgb(0 0 0 / 0.94) 38%,
			rgb(0 0 0 / 0.42) 68%,
			transparent 100%
		);
	}

	.landing-top-glow__filters {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	.landing-top-glow__field {
		position: absolute;
		inset: -12% -8% 0;
		filter: url(#landing-smoke-turbulence);
	}

	.landing-top-glow__plume {
		position: absolute;
		mix-blend-mode: screen;
		opacity: 0.82;
		will-change: transform, opacity, border-radius, filter;
	}

	.landing-top-glow__plume--warm-a {
		top: -8%;
		right: -4%;
		width: min(44rem, 78vw);
		height: min(30rem, 48vh);
		border-radius: 58% 42% 64% 36% / 48% 56% 44% 52%;
		background: radial-gradient(
			ellipse at 42% 38%,
			rgb(var(--chat-orb-lines-center) / 0.5) 0%,
			rgb(var(--chat-orb-highlight) / 0.34) 28%,
			rgb(var(--chat-orb-primary) / 0.22) 54%,
			transparent 78%
		);
		filter: blur(58px);
	}

	.landing-top-glow__plume--warm-b {
		top: 6%;
		right: 18%;
		width: min(32rem, 58vw);
		height: min(22rem, 36vh);
		border-radius: 44% 56% 38% 62% / 52% 44% 56% 48%;
		background: radial-gradient(
			ellipse at 60% 45%,
			rgb(var(--chat-orb-primary) / 0.34) 0%,
			rgb(var(--chat-orb-ball) / 0.2) 48%,
			transparent 76%
		);
		filter: blur(52px);
		opacity: 0.58;
	}

	.landing-top-glow__plume--cool-a {
		top: -4%;
		left: -6%;
		width: min(40rem, 72vw);
		height: min(28rem, 44vh);
		border-radius: 62% 38% 54% 46% / 42% 58% 42% 58%;
		background: radial-gradient(
			ellipse at 38% 42%,
			rgb(var(--chat-orb-secondary) / 0.42) 0%,
			rgb(var(--chat-orb-tertiary) / 0.26) 46%,
			transparent 74%
		);
		filter: blur(62px);
	}

	.landing-top-glow__plume--cool-b {
		top: 14%;
		left: 22%;
		width: min(26rem, 48vw);
		height: min(18rem, 30vh);
		border-radius: 48% 52% 60% 40% / 58% 42% 58% 42%;
		background: radial-gradient(
			ellipse at 50% 50%,
			rgb(var(--chat-orb-ring-start) / 0.28) 0%,
			rgb(var(--chat-orb-secondary) / 0.18) 52%,
			transparent 78%
		);
		filter: blur(48px);
		opacity: 0.55;
	}

	.landing-top-glow__plume--violet {
		top: 2%;
		left: 38%;
		width: min(36rem, 64vw);
		height: min(24rem, 40vh);
		border-radius: 50% 50% 42% 58% / 46% 54% 46% 54%;
		background: radial-gradient(
			ellipse at 50% 40%,
			rgb(var(--chat-orb-highlight) / 0.26) 0%,
			rgb(var(--chat-orb-tertiary) / 0.22) 40%,
			rgb(var(--chat-orb-primary) / 0.14) 62%,
			transparent 80%
		);
		filter: blur(70px);
		opacity: 0.64;
	}

	.landing-top-glow__plume--mist {
		top: -14%;
		left: 28%;
		width: min(52rem, 96vw);
		height: min(20rem, 34vh);
		border-radius: 46% 54% 52% 48% / 40% 60% 40% 60%;
		background: linear-gradient(
			118deg,
			rgb(var(--chat-orb-ring-start) / 0.1) 0%,
			rgb(var(--chat-orb-highlight) / 0.16) 32%,
			rgb(var(--chat-orb-secondary) / 0.12) 58%,
			transparent 88%
		);
		filter: blur(80px);
		opacity: 0.5;
	}

	@media (prefers-reduced-motion: no-preference) {
		.landing-top-glow__plume--warm-a {
			animation:
				landing-smoke-drift-a 26s ease-in-out infinite,
				landing-smoke-morph-a 18s ease-in-out infinite,
				landing-smoke-breathe 11s ease-in-out infinite;
		}

		.landing-top-glow__plume--warm-b {
			animation:
				landing-smoke-drift-b 31s ease-in-out infinite,
				landing-smoke-morph-b 22s ease-in-out infinite,
				landing-smoke-breathe 13s ease-in-out infinite reverse;
		}

		.landing-top-glow__plume--cool-a {
			animation:
				landing-smoke-drift-c 28s ease-in-out infinite,
				landing-smoke-morph-c 20s ease-in-out infinite,
				landing-smoke-breathe 12s ease-in-out infinite;
		}

		.landing-top-glow__plume--cool-b {
			animation:
				landing-smoke-drift-d 34s ease-in-out infinite,
				landing-smoke-morph-d 24s ease-in-out infinite,
				landing-smoke-breathe 15s ease-in-out infinite reverse;
		}

		.landing-top-glow__plume--violet {
			animation:
				landing-smoke-drift-e 30s ease-in-out infinite,
				landing-smoke-morph-e 19s ease-in-out infinite,
				landing-smoke-breathe 10s ease-in-out infinite;
		}

		.landing-top-glow__plume--mist {
			animation:
				landing-smoke-drift-f 36s ease-in-out infinite,
				landing-smoke-morph-f 26s ease-in-out infinite,
				landing-smoke-breathe 14s ease-in-out infinite;
		}
	}

	@keyframes landing-smoke-drift-a {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
		}
		25% {
			transform: translate3d(-6%, 5%, 0) rotate(-4deg) scale(1.06);
		}
		50% {
			transform: translate3d(-2%, 9%, 0) rotate(2deg) scale(1.1);
		}
		75% {
			transform: translate3d(5%, 3%, 0) rotate(5deg) scale(1.03);
		}
	}

	@keyframes landing-smoke-drift-b {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
		}
		33% {
			transform: translate3d(7%, -4%, 0) rotate(6deg) scale(1.08);
		}
		66% {
			transform: translate3d(-4%, 6%, 0) rotate(-3deg) scale(1.04);
		}
	}

	@keyframes landing-smoke-drift-c {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
		}
		20% {
			transform: translate3d(5%, 4%, 0) rotate(3deg) scale(1.05);
		}
		55% {
			transform: translate3d(9%, 8%, 0) rotate(-5deg) scale(1.12);
		}
		80% {
			transform: translate3d(2%, 2%, 0) rotate(2deg) scale(1.02);
		}
	}

	@keyframes landing-smoke-drift-d {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
		}
		40% {
			transform: translate3d(-8%, 5%, 0) rotate(-6deg) scale(1.09);
		}
		70% {
			transform: translate3d(-3%, -3%, 0) rotate(4deg) scale(1.03);
		}
	}

	@keyframes landing-smoke-drift-e {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
		}
		30% {
			transform: translate3d(-5%, -6%, 0) rotate(-7deg) scale(1.07);
		}
		60% {
			transform: translate3d(6%, 4%, 0) rotate(5deg) scale(1.11);
		}
		85% {
			transform: translate3d(1%, 7%, 0) rotate(-2deg) scale(1.04);
		}
	}

	@keyframes landing-smoke-drift-f {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(0deg) scaleX(1);
		}
		50% {
			transform: translate3d(-4%, 6%, 0) rotate(2deg) scaleX(1.08);
		}
	}

	@keyframes landing-smoke-morph-a {
		0%,
		100% {
			border-radius: 58% 42% 64% 36% / 48% 56% 44% 52%;
		}
		50% {
			border-radius: 44% 56% 38% 62% / 58% 42% 58% 42%;
		}
	}

	@keyframes landing-smoke-morph-b {
		0%,
		100% {
			border-radius: 44% 56% 38% 62% / 52% 44% 56% 48%;
		}
		50% {
			border-radius: 62% 38% 54% 46% / 44% 56% 42% 58%;
		}
	}

	@keyframes landing-smoke-morph-c {
		0%,
		100% {
			border-radius: 62% 38% 54% 46% / 42% 58% 42% 58%;
		}
		50% {
			border-radius: 48% 52% 60% 40% / 54% 46% 54% 46%;
		}
	}

	@keyframes landing-smoke-morph-d {
		0%,
		100% {
			border-radius: 48% 52% 60% 40% / 58% 42% 58% 42%;
		}
		50% {
			border-radius: 56% 44% 42% 58% / 46% 54% 48% 52%;
		}
	}

	@keyframes landing-smoke-morph-e {
		0%,
		100% {
			border-radius: 50% 50% 42% 58% / 46% 54% 46% 54%;
		}
		50% {
			border-radius: 40% 60% 52% 48% / 58% 42% 56% 44%;
		}
	}

	@keyframes landing-smoke-morph-f {
		0%,
		100% {
			border-radius: 46% 54% 52% 48% / 40% 60% 40% 60%;
		}
		50% {
			border-radius: 54% 46% 44% 56% / 52% 48% 58% 42%;
		}
	}

	@keyframes landing-smoke-breathe {
		0%,
		100% {
			opacity: 0.62;
			filter: blur(56px);
		}
		50% {
			opacity: 0.92;
			filter: blur(84px);
		}
	}

	:global(:root[data-color-mode='light']) .landing-top-glow__plume {
		mix-blend-mode: multiply;
		opacity: 0.48;
	}

	@media (prefers-reduced-motion: reduce) {
		.landing-top-glow__field {
			filter: none;
		}
	}
</style>
