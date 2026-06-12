import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { formatPocketBaseError } from '../src/lib/pocketbaseErrors.js';

const pbError = (body: Record<string, unknown>) =>
	new ClientResponseError({
		url: 'http://localhost:8090/api/collections/users/records',
		status: 400,
		response: body
	});

describe('formatPocketBaseError', () => {
	it('formats signup password length validation instead of generic create failure', () => {
		const error = pbError({
			message: 'Failed to create record.',
			data: {
				password: {
					code: 'validation_min_text_constraint',
					message: 'Must be at least 8 character(s).'
				}
			}
		});

		expect(formatPocketBaseError(error, 'Signup failed.')).toBe(
			'Password must be at least 8 character(s).'
		);
	});

	it('formats blank auth fields with readable labels', () => {
		const error = pbError({
			message: 'An error occurred while validating the submitted data.',
			data: {
				identity: { code: 'validation_required', message: 'Cannot be blank.' },
				password: { code: 'validation_required', message: 'Cannot be blank.' }
			}
		});

		expect(formatPocketBaseError(error, 'Unable to authenticate.')).toBe(
			'Email cannot be blank. Password cannot be blank.'
		);
	});

	it('keeps credential failures when PocketBase hides field details', () => {
		const error = pbError({
			message: 'Failed to authenticate.',
			data: {}
		});

		expect(formatPocketBaseError(error, 'Unable to authenticate.')).toBe('Failed to authenticate.');
	});

	it('maps duplicate email errors to a sign-in hint', () => {
		const error = pbError({
			message: 'Failed to create record.',
			data: {
				email: { code: 'validation_not_unique', message: 'Value must be unique.' }
			}
		});

		expect(formatPocketBaseError(error, 'Signup failed.')).toBe(
			'An account with that email already exists. Sign in instead.'
		);
	});

	it('returns API error text thrown from signup fetch', () => {
		expect(
			formatPocketBaseError(
				new Error('Password must be at least 8 character(s).'),
				'Unable to authenticate right now.'
			)
		).toBe('Password must be at least 8 character(s).');
	});
});
