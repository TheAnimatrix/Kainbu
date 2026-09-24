<script lang="ts">
	import { onMount } from 'svelte';
	const command = 'kainbu ls --checked false';
	let terminal: HTMLDivElement;
	let count = $state(command.length);
	let output = $state(true);
	let started = false;
	let reduced = false;
	let timer: ReturnType<typeof setTimeout>;
	function replay() {
		clearTimeout(timer);
		count = reduced ? command.length : 0;
		output = reduced;
		const type = () => {
			if (count < command.length) {
				count += 1;
				timer = setTimeout(type, 38);
			} else
				timer = setTimeout(() => {
					output = true;
				}, 230);
		};
		if (!reduced) timer = setTimeout(type, 380);
	}
	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduced = media.matches;
		if (!reduced) {
			count = 0;
			output = false;
		}
		const motionChanged = () => {
			reduced = media.matches;
			if (reduced) {
				clearTimeout(timer);
				count = command.length;
				output = true;
			}
		};
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !started) {
					started = true;
					replay();
				}
			},
			{ threshold: 0.35 }
		);
		observer.observe(terminal);
		media.addEventListener('change', motionChanged);
		return () => {
			clearTimeout(timer);
			observer.disconnect();
			media.removeEventListener('change', motionChanged);
		};
	});
</script>

<div class="terminal" bind:this={terminal}>
	<div class="terminal-title">
		<span aria-hidden="true">⌘</span><span>Kainbu / Website launch</span><button
			onclick={replay}
			aria-label="Replay CLI animation">Replay <span aria-hidden="true">↻</span></button
		>
	</div>
	<div class="terminal-body" aria-hidden="true">
		<div class="command">
			<span class="prompt">❯</span> <span>{command.slice(0, count)}</span><span
				class="cursor"
				class:finished={output}
			></span>
		</div>
		<div class="output" class:visible={output}>
			<div class="column"><span>C1</span> To do</div>
			<div class="task"><span>T1</span> <i>[ ]</i> Write the launch story <small>story</small></div>
			<div class="task">
				<span>T2</span> <i>[ ]</i> Check the small screens <small>screens</small>
			</div>
			<div class="column"><span>C2</span> In progress</div>
			<div class="task"><span>T3</span> <i>[ ]</i> Design the homepage <small>homepage</small></div>
			<div class="task">
				<span>T4</span> <i>[ ]</i> Build the navigation <small>navigation</small>
			</div>
			<div class="next-prompt"><span class="prompt">❯</span><span class="cursor"></span></div>
		</div>
	</div>
	<p class="sr-only">
		Run kainbu ls --checked false to list the open tasks on your active board, grouped by column.
		This example lists four tasks in To do and In progress.
	</p>
</div>

<style>
	.terminal {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--index-rule);
		border-radius: 6px;
		background: #131517;
		color: #d7dedc;
		font-size: 11px;
	}
	.terminal-title {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 44px;
		padding: 0 17px;
		border-bottom: 1px solid #2b3032;
		color: #939e9c;
		font-size: 10px;
	}
	.terminal-title > span:first-child {
		color: #c7d3cd;
		font-size: 15px;
	}
	.terminal-title button {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-left: auto;
		min-height: 40px;
		font-size: 10px;
		transition: color 160ms;
	}
	.terminal-title button:hover {
		color: #f0f5f1;
	}
	.terminal-body {
		padding: 24px 22px 13px;
		font-family: 'JetBrains Mono', Consolas, monospace;
		font-size: 11px;
		line-height: 1.85;
	}
	.command {
		display: flex;
		align-items: center;
		gap: 7px;
		min-height: 22px;
		white-space: pre;
		color: #edf2ed;
	}
	.prompt {
		color: #a5c9af;
	}
	.cursor {
		display: inline-block;
		width: 6px;
		height: 13px;
		background: #b6c6bd;
		vertical-align: middle;
	}
	.cursor.finished {
		opacity: 0;
	}
	.output {
		opacity: 0;
		transform: translateY(5px);
		transition:
			opacity 420ms ease,
			transform 420ms ease;
	}
	.output.visible {
		opacity: 1;
		transform: translateY(0);
	}
	.column {
		margin-top: 15px;
		color: #dce8e1;
	}
	.column > span,
	.task > span {
		color: #a2bbb0;
	}
	.task {
		padding-left: 12px;
		white-space: nowrap;
	}
	.task i {
		font-style: normal;
		color: #819089;
	}
	.task small {
		margin-left: 7px;
		color: #75827d;
		font-size: 9px;
	}
	.next-prompt {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 22px;
	}
	@media (max-width: 600px) {
		.terminal-body {
			padding: 19px 14px 9px;
			font-size: 10px;
		}
		.task {
			padding-left: 7px;
		}
		.task small {
			display: none;
		}
		.terminal-title {
			padding-inline: 13px;
		}
	}
	@media (max-width: 350px) {
		.terminal-body {
			padding-inline: 10px;
			font-size: 9px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.output,
		.terminal-title button {
			transition: none;
		}
	}
</style>
