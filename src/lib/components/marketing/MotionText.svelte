<script lang="ts">
	import { reveal } from './motion';
	let {
		text = '',
		lines,
		delay = 180,
		italic = ''
	}: { text?: string; lines?: string[]; delay?: number; italic?: string } = $props();
	const textLines = $derived(lines ?? [text]);
</script>

<span
	class="motion-text"
	use:reveal={{ kind: 'words', delay, selector: '[data-word]', stagger: 65 }}
>
	<span class="sr-only">{textLines.join(' ')}</span>
	<span aria-hidden="true">
		<!-- eslint-disable svelte/no-useless-mustaches -- Keep an explicit word space between the masked inline elements. -->
		{#each textLines as line, lineIndex (lineIndex)}
			<span class="motion-line" class:secondary={lineIndex > 0}>
				{#each line.split(' ') as word, index (index)}{#if index > 0}{' '}{/if}<span
						class="word-mask"><span data-word class:italic={word === italic}>{word}</span></span
					>{/each}
			</span>
		{/each}
		<!-- eslint-enable svelte/no-useless-mustaches -->
	</span>
</span>

<style>
	.motion-text {
		display: block;
	}
	.motion-line {
		display: block;
	}
	.secondary {
		color: var(--motion-secondary, inherit);
	}
	.word-mask {
		display: inline-block;
		overflow: clip;
		vertical-align: top;
		padding-block: 0.12em;
		margin-block: -0.12em;
	}
	[data-word] {
		display: inline-block;
		transform-origin: left bottom;
	}
	.italic {
		font-style: italic;
		color: var(--motion-italic, inherit);
	}
</style>
