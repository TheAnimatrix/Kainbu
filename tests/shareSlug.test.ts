import { describe, expect, it } from 'vitest';
import {
	buildBoardShareUrl,
	createShareSlug,
	isValidShareSlug
} from '../src/lib/kainbu/shareSlug';

describe('shareSlug', () => {
	it('creates 8-character slugs from the allowed alphabet', () => {
		const slug = createShareSlug();
		expect(slug).toHaveLength(8);
		expect(isValidShareSlug(slug)).toBe(true);
	});

	it('builds board share URLs', () => {
		expect(buildBoardShareUrl('Ab12Cd34', 'https://kainbu.example')).toBe(
			'https://kainbu.example/b/Ab12Cd34'
		);
	});

	it('rejects invalid slugs', () => {
		expect(() => buildBoardShareUrl('bad slug')).toThrow(/Invalid share slug/);
	});
});
