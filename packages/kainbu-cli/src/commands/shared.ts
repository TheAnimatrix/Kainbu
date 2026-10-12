import { KainbuError } from '../errors.js';

export type MatchMode = {
	/** Writes require an ID or an exact (case-insensitive) name; reads also accept a unique substring. */
	exact?: boolean;
};

export const resolveByIdOrName = <T extends { id: string; name: string }>(
	items: T[],
	query: string,
	label: string,
	mode: MatchMode = {}
) => {
	const trimmed = query.trim();
	if (!trimmed)
		throw new KainbuError(`${label} target cannot be empty.`, {
			code: 'invalid_arguments',
			exitCode: 2
		});
	const byId = items.find((item) => item.id === trimmed);
	if (byId) return byId;

	const lower = trimmed.toLowerCase();
	const exact = items.filter((item) => item.name.toLowerCase() === lower);
	const matches =
		exact.length || mode.exact
			? exact
			: items.filter((item) => item.name.toLowerCase().includes(lower));
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		throw new KainbuError(`Multiple ${label} entries match "${trimmed}".`, {
			code: 'ambiguous_target',
			exitCode: 2,
			hint: 'Use the id instead of the name.'
		});
	}

	const partial = mode.exact ? items.filter((item) => item.name.toLowerCase().includes(lower)) : [];
	throw new KainbuError(`${label} not found: ${trimmed}`, {
		code: 'not_found',
		exitCode: 4,
		...(partial.length
			? {
					hint: `Changes need an id or the exact name. Partial matches: ${partial
						.slice(0, 5)
						.map((item) => `"${item.name}" (${item.id})`)
						.join(', ')}`
				}
			: {})
	});
};

export const splitCsv = (value?: string) =>
	(value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
