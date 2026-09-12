import { KainbuError } from '../errors.js';

const matchesName = (value: string, query: string) =>
	value.toLowerCase() === query.toLowerCase() || value.toLowerCase().includes(query.toLowerCase());

export const resolveByIdOrName = <T extends { id: string; name: string }>(
	items: T[],
	query: string,
	label: string
) => {
	const trimmed = query.trim();
	if (!trimmed)
		throw new KainbuError(`${label} target cannot be empty.`, {
			code: 'invalid_arguments',
			exitCode: 2
		});
	const byId = items.find((item) => item.id === trimmed);
	if (byId) return byId;

	const exact = items.filter((item) => item.name.toLowerCase() === trimmed.toLowerCase());
	const matches = exact.length ? exact : items.filter((item) => matchesName(item.name, trimmed));
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		throw new KainbuError(`Multiple ${label} entries match "${trimmed}".`, {
			code: 'ambiguous_target',
			exitCode: 2,
			hint: 'Use the id instead of the name.'
		});
	}

	throw new KainbuError(`${label} not found: ${trimmed}`, { code: 'not_found', exitCode: 4 });
};
