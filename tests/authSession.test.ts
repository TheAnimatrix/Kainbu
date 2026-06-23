import { describe, expect, it, vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { isStaleAuthError } from '../src/lib/kainbu/authSession.js';

describe('isStaleAuthError', () => {
	it('detects workspace API unauthorized responses', () => {
		const error = new Error('Unauthorized') as Error & { status?: number };
		error.status = 401;
		expect(isStaleAuthError(error)).toBe(true);
	});

	it('detects PocketBase 401 responses', () => {
		const error = new ClientResponseError({
			url: 'http://localhost:8090/api/collections/users/records/me',
			status: 401,
			response: { message: 'Unauthorized.' }
		});
		expect(isStaleAuthError(error)).toBe(true);
	});

	it('detects missing own user record', () => {
		const userId = 'user_abc123';
		const error = new ClientResponseError({
			url: `http://localhost:8090/api/collections/users/records/${userId}`,
			status: 404,
			response: { message: 'Not found.' }
		});
		expect(isStaleAuthError(error, userId)).toBe(true);
	});

	it('ignores unrelated workspace failures', () => {
		const error = new Error('Loading your boards timed out. Please retry.') as Error & {
			status?: number;
		};
		error.status = 500;
		expect(isStaleAuthError(error)).toBe(false);
	});
});
