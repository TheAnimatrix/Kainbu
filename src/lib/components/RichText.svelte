<script lang="ts">
	import { afterUpdate } from 'svelte';
	import { renderMarkdown } from '$lib/kainbu/markdown';
	import type { TaskReferenceKind, TaskReferenceOption } from '$lib/kainbu/taskMarkdown';

	export let value = '';
	export let className = '';
	export let assetUrls: Record<string, string> = {};
	export let referenceLookup: Record<string, TaskReferenceOption> = {};
	export let onCheckboxToggle: ((index: number, checked: boolean) => void) | undefined = undefined;
	export let onReferenceNavigate:
		| ((reference: TaskReferenceOption) => void)
		| undefined = undefined;

	$: html = renderMarkdown(value || '', {
		assetUrls,
		referenceLookup
	});

	let container: HTMLElement;
	const getReferenceKey = (kind: TaskReferenceKind, id: string) => `${kind}:${id}`;

	afterUpdate(() => {
		if (!container) return;
		const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		checkboxes.forEach((cb, i) => {
			cb.onclick = (event) => {
				event.stopPropagation();
			};
			if (onCheckboxToggle) {
				cb.disabled = false;
				cb.style.cursor = 'pointer';
				cb.onchange = (event) => {
					event.stopPropagation();
					const target = event.currentTarget as HTMLInputElement;
					onCheckboxToggle!(i, target.checked);
				};
			} else {
				cb.disabled = true;
				cb.style.cursor = '';
				cb.onchange = null;
			}
		});

		const referenceChips = container.querySelectorAll<HTMLElement>('.kainbu-ref-chip[data-ref-kind][data-ref-id]');
		referenceChips.forEach((chip) => {
			const kind = chip.dataset.refKind as TaskReferenceKind | undefined;
			const id = chip.dataset.refId;
			const reference = kind && id ? referenceLookup[getReferenceKey(kind, id)] : undefined;
			if (onReferenceNavigate && reference) {
				chip.tabIndex = 0;
				chip.setAttribute('role', 'link');
				chip.setAttribute('aria-label', `Open ${reference.label} in kanban`);
				chip.onclick = (event) => {
					event.preventDefault();
					event.stopPropagation();
					onReferenceNavigate(reference);
				};
				chip.onkeydown = (event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					event.stopPropagation();
					onReferenceNavigate(reference);
				};
			} else {
				chip.removeAttribute('role');
				chip.removeAttribute('tabindex');
				chip.removeAttribute('aria-label');
				chip.onclick = null;
				chip.onkeydown = null;
			}
		});
	});
</script>

<div class={className} bind:this={container}>{@html html}</div>
