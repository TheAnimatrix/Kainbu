<script lang="ts">
	import { afterUpdate } from 'svelte';
	import { renderMarkdown } from '$lib/kainbu/markdown';

	export let value = '';
	export let className = '';
	export let onCheckboxToggle: ((index: number, checked: boolean) => void) | undefined = undefined;

	$: html = renderMarkdown(value || '');

	let container: HTMLElement;

	afterUpdate(() => {
		if (!container) return;
		const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		checkboxes.forEach((cb, i) => {
			if (onCheckboxToggle) {
				cb.disabled = false;
				cb.style.cursor = 'pointer';
				cb.onclick = (e) => {
					e.preventDefault();
					onCheckboxToggle!(i, !cb.checked);
				};
			} else {
				cb.disabled = true;
				cb.style.cursor = '';
				cb.onclick = null;
			}
		});
	});
</script>

<div class={className} bind:this={container}>{@html html}</div>
