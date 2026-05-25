import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { isPocketBaseAbort, shouldIgnorePocketBaseError } from '../src/lib/kainbu/pbRequest';

describe('isPocketBaseAbort', () => {
	it('detects autocancelled PocketBase requests', () => {
		const error = new ClientResponseError({ isAbort: true } as never);
		expect(isPocketBaseAbort(error)).toBe(true);
	});

	it('ignores other errors', () => {
		expect(isPocketBaseAbort(new Error('nope'))).toBe(false);
	});

	it('detects autocancelled message text', () => {
		expect(isPocketBaseAbort(new Error('The request was autocancelled.'))).toBe(true);
		expect(shouldIgnorePocketBaseError(new Error('The request was autocancelled.'))).toBe(true);
	});
});
