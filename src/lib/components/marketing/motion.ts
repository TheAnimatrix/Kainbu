type RevealOptions = {
	kind?: 'words' | 'rise' | 'panel' | 'landscape';
	delay?: number;
	stagger?: number;
	selector?: string;
};

const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Progressive enhancement: SSR and reduced-motion content are always readable. */
export function reveal(node: HTMLElement, options: RevealOptions = {}) {
	const media = window.matchMedia('(prefers-reduced-motion: reduce)');
	const { kind = 'rise', delay = 0, stagger = 70, selector } = options;
	const parts = selector ? Array.from(node.querySelectorAll<HTMLElement>(selector)) : [node];
	let animations: Animation[] = [];
	let started = false;
	let observer: IntersectionObserver | undefined;

	function clear() {
		animations.forEach((animation) => {
			animation.onfinish = null;
			animation.cancel();
		});
		animations = [];
	}

	function play() {
		if (started || document.hidden) return;
		started = true;
		node.dataset.motionState = 'playing';
		animations.forEach((animation) => animation.play());
		observer?.unobserve(node);
	}

	function prepare() {
		clear();
		observer?.disconnect();
		started = false;
		if (media.matches || !node.animate) {
			node.dataset.motionState = 'settled';
			return;
		}
		const from: Keyframe =
			kind === 'words'
				? { opacity: 0, transform: 'translate3d(0, 112%, 0) rotate(3deg)' }
				: kind === 'landscape'
					? { opacity: 0.5, transform: 'scale(1.065)' }
					: kind === 'panel'
						? { opacity: 0, transform: 'translate3d(0, 44px, 0) scale(.975)' }
						: { opacity: 0, transform: 'translate3d(0, 22px, 0)' };
		let completed = 0;
		animations = parts.map((part, index) => {
			const animation = part.animate([from, { opacity: 1, transform: 'none' }], {
				duration: kind === 'landscape' ? 1600 : kind === 'words' ? 900 : 800,
				delay: delay + Math.min(index * stagger, 420),
				easing: ease,
				fill: 'both'
			});
			animation.pause();
			animation.onfinish = () => {
				animation.cancel();
				animations = animations.filter((active) => active !== animation);
				if (++completed === parts.length) node.dataset.motionState = 'settled';
			};
			return animation;
		});
		node.dataset.motionState = 'waiting';
		observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) play();
			},
			{ rootMargin: '0px 0px -32px 0px', threshold: 0.08 }
		);
		observer.observe(node);
	}

	function onVisibility() {
		if (document.hidden) {
			animations.forEach((animation) => animation.pause());
		} else if (started) {
			animations.forEach((animation) => {
				if (animation.playState === 'paused') animation.play();
			});
		} else {
			const rect = node.getBoundingClientRect();
			if (rect.top < window.innerHeight - 32 && rect.bottom > 0) play();
		}
	}

	function onFocus() {
		clear();
		started = true;
		node.dataset.motionState = 'settled';
		observer?.disconnect();
	}

	prepare();
	media.addEventListener('change', prepare);
	window.addEventListener('landing:replay', prepare);
	document.addEventListener('visibilitychange', onVisibility);
	node.addEventListener('focusin', onFocus);
	return {
		destroy() {
			clear();
			observer?.disconnect();
			media.removeEventListener('change', prepare);
			window.removeEventListener('landing:replay', prepare);
			document.removeEventListener('visibilitychange', onVisibility);
			node.removeEventListener('focusin', onFocus);
		}
	};
}
