import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getAdminAllowlistEmails,
	isEmailOnAdminAllowlist,
	isUserAppAdmin,
	maskApiKey
} from '../server/adminAuth.js';

describe('adminAuth helpers', () => {
	const original = process.env.KAINBU_ADMIN_EMAILS;

	beforeEach(() => {
		process.env.KAINBU_ADMIN_EMAILS = 'Admin@Example.com, other@test.io';
	});

	afterEach(() => {
		if (original === undefined) {
			delete process.env.KAINBU_ADMIN_EMAILS;
		} else {
			process.env.KAINBU_ADMIN_EMAILS = original;
		}
	});

	it('parses allowlist emails case-insensitively', () => {
		const emails = getAdminAllowlistEmails();
		expect(emails.has('admin@example.com')).toBe(true);
		expect(emails.has('other@test.io')).toBe(true);
		expect(emails.size).toBe(2);
	});

	it('detects allowlisted email', () => {
		expect(isEmailOnAdminAllowlist('OTHER@test.io')).toBe(true);
		expect(isEmailOnAdminAllowlist('nope@example.com')).toBe(false);
	});

	it('treats is_admin and allowlist as admin', () => {
		expect(
			isUserAppAdmin({
				id: '1',
				email: 'nope@example.com',
				is_admin: true,
				disabled: false
			} as never)
		).toBe(true);
		expect(
			isUserAppAdmin({
				id: '2',
				email: 'admin@example.com',
				is_admin: false,
				disabled: false
			} as never)
		).toBe(true);
		expect(
			isUserAppAdmin({
				id: '3',
				email: 'admin@example.com',
				is_admin: true,
				disabled: true
			} as never)
		).toBe(false);
	});

	it('masks api keys without exposing full value', () => {
		expect(maskApiKey('sk-or-v1-abcdefghijklmnop')).toBe('...mnop');
		expect(maskApiKey('ab')).toBe('****');
	});
});
