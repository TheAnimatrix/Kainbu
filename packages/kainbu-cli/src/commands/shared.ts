import { KainbuError } from '../errors.js';

const matchesName = (value: string, query: string) =>
	value.toLowerCase() === query.toLowerCase() || value.toLowerCase().includes(query.toLowerCase());

export const resolveByIdOrName = <T extends { id: string; name: string }>(
	items: T[],
	query: string,
	label: string
) => {
	const trimmed = query.trim();
	const byId = items.find((item) => item.id === trimmed);
	if (byId) return byId;

	const matches = items.filter((item) => matchesName(item.name, trimmed));
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		throw new KainbuError(`Multiple ${label} entries match "${trimmed}".`, {
			hint: 'Use the id instead of the name.'
		});
	}

	throw new KainbuError(`${label} not found: ${trimmed}`);
};
