import { FLUENT_ICON_MAP, type FluentIconName } from './fluent-map';
import { FLUENT_ICON_COLLECTION } from './fluent-icons';

export function fluentIconSvg(name: FluentIconName, size = 24): string {
	const iconId = FLUENT_ICON_MAP[name];
	const icon = (FLUENT_ICON_COLLECTION.icons as Record<
		string,
		{ body: string; width?: number; height?: number }
	>)[iconId];
	if (!icon) return '';

	const width = icon.width ?? 24;
	const height = icon.height ?? 24;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${width} ${height}" aria-hidden="true" fill="currentColor">${icon.body}</svg>`;
}
