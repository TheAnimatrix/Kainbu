<div class="landing-hero-backdrop" aria-hidden="true">
	<div class="landing-hero-backdrop__grid"></div>
	<div class="landing-hero-backdrop__glow landing-hero-backdrop__glow--teal"></div>
	<div class="landing-hero-backdrop__glow landing-hero-backdrop__glow--indigo"></div>
	<div class="landing-hero-backdrop__fade"></div>
</div>

<style>
	.landing-hero-backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.landing-hero-backdrop__grid {
		position: absolute;
		inset: -1px;
		background-image:
			linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px),
			linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px);
		background-size: 30px 30px;
		-webkit-mask-image: radial-gradient(
			ellipse 80% 75% at 32% 30%,
			rgb(0 0 0 / 0.9) 0%,
			rgb(0 0 0 / 0.35) 55%,
			transparent 85%
		);
		mask-image: radial-gradient(
			ellipse 80% 75% at 32% 30%,
			rgb(0 0 0 / 0.9) 0%,
			rgb(0 0 0 / 0.35) 55%,
			transparent 85%
		);
	}

	:global(:root[data-color-mode='light']) .landing-hero-backdrop__grid {
		background-image:
			linear-gradient(to right, rgb(0 0 0 / 0.045) 1px, transparent 1px),
			linear-gradient(to bottom, rgb(0 0 0 / 0.045) 1px, transparent 1px);
	}

	.landing-hero-backdrop__glow {
		position: absolute;
		border-radius: 9999px;
		filter: blur(120px);
	}

	.landing-hero-backdrop__glow--teal {
		top: -10%;
		right: -4%;
		height: 30rem;
		width: 30rem;
		background: radial-gradient(circle, rgb(34 211 238 / 0.16), transparent 70%);
	}

	.landing-hero-backdrop__glow--indigo {
		bottom: -22%;
		left: -8%;
		height: 26rem;
		width: 26rem;
		background: radial-gradient(circle, rgb(99 102 241 / 0.14), transparent 70%);
	}

	:global(:root[data-color-mode='light']) .landing-hero-backdrop__glow--teal {
		background: radial-gradient(circle, rgb(34 211 238 / 0.22), transparent 70%);
	}

	:global(:root[data-color-mode='light']) .landing-hero-backdrop__glow--indigo {
		background: radial-gradient(circle, rgb(99 102 241 / 0.18), transparent 70%);
	}

	.landing-hero-backdrop__fade {
		position: absolute;
		inset: auto 0 0;
		height: 40%;
		background: linear-gradient(to bottom, transparent, var(--color-app-bg));
	}

	@media (prefers-reduced-motion: no-preference) {
		.landing-hero-backdrop__glow--teal {
			animation: landing-hero-glow-a 18s ease-in-out infinite;
		}

		.landing-hero-backdrop__glow--indigo {
			animation: landing-hero-glow-b 22s ease-in-out infinite;
		}
	}

	@keyframes landing-hero-glow-a {
		0%,
		100% {
			transform: translate3d(0, 0, 0) scale(1);
			opacity: 0.9;
		}
		50% {
			transform: translate3d(-4%, 5%, 0) scale(1.08);
			opacity: 1;
		}
	}

	@keyframes landing-hero-glow-b {
		0%,
		100% {
			transform: translate3d(0, 0, 0) scale(1);
			opacity: 0.85;
		}
		50% {
			transform: translate3d(5%, -4%, 0) scale(1.1);
			opacity: 1;
		}
	}
</style>
