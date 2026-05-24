import { describe, expect, it } from 'vitest';
import { resolveByIdOrName } from '../packages/kainbu-cli/src/commands/shared.js';

describe('resolveByIdOrName', () => {
	const items = [
		{ id: 'p1', name: 'Alpha' },
		{ id: 'p2', name: 'Beta Project' }
	];

	it('resolves exact id', () => {
		expect(resolveByIdOrName(items, 'p2', 'project').name).toBe('Beta Project');
	});

	it('resolves unique name match', () => {
		expect(resolveByIdOrName(items, 'alpha', 'project').id).toBe('p1');
	});

	it('throws on ambiguous name', () => {
		expect(() => resolveByIdOrName(items, 'a', 'project')).toThrow(/Multiple/);
	});
});
