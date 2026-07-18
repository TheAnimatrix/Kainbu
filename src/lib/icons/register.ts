import { addCollection } from '@iconify/svelte';
import { FLUENT_ICON_COLLECTION } from './fluent-icons';

let registered = false;

export function registerFluentIcons() {
	if (registered) return;
	addCollection(FLUENT_ICON_COLLECTION);
	registered = true;
}
