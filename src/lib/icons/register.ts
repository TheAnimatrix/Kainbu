import { addCollection } from '@iconify/svelte';
import { icons as fluentIcons } from '@iconify-json/fluent';

let registered = false;

export function registerFluentIcons() {
	if (registered) return;
	addCollection(fluentIcons);
	registered = true;
}
