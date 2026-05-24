import { describe, expect, it } from 'vitest';

const formatUserCode = (value: string) => {
	const compact = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
	if (compact.length <= 4) return compact;
	return `${compact.slice(0, 4)}-${compact.slice(4)}`;
};

describe('CLI device code formatting', () => {
	it('normalizes dashed codes', () => {
		expect(formatUserCode('abcd-1234')).toBe('ABCD-1234');
	});

	it('truncates long input', () => {
		expect(formatUserCode('ABCDEFGH1234')).toBe('ABCD-EFGH');
	});
});
