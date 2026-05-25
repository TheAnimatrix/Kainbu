import { describe, expect, it } from 'vitest';
import { isPocketBaseRecordId } from '../src/lib/kainbu/recordIds';

describe('isPocketBaseRecordId', () => {
	it('accepts PocketBase user ids', () => {
		expect(isPocketBaseRecordId('ru59c0a145l62gt')).toBe(true);
	});

	it('rejects UUID client ids', () => {
		expect(isPocketBaseRecordId('1ac84cea-2cc5-4f50-9c86-35f7b09bd128')).toBe(false);
	});
});
