import { createHash } from 'node:crypto';
import { KainbuError } from './errors.js';

const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, v]) => v !== undefined)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, canonical(v)])
		);
	return value;
};
export const revisionOf = (value: unknown) =>
	createHash('sha256')
		.update(JSON.stringify(canonical(value)))
		.digest('hex');
export const assertRevision = (expected: string | undefined, value: unknown) => {
	if (expected !== undefined && expected !== revisionOf(value))
		throw new KainbuError('Resource changed since the supplied revision.', {
			code: 'conflict',
			exitCode: 5,
			hint: 'Read the resource again, review the changes, and use its latest revision.'
		});
};
