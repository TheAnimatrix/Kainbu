import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	VERIFICATION_RESEND_COOLDOWN_SECONDS,
	getVerificationResendCooldownRemaining,
	markVerificationResendSent,
	normalizeVerificationEmail
} from '../src/lib/auth/verificationResend';

describe('verificationResend', () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
			removeItem: (key: string) => {
				storage.delete(key);
			},
			clear: () => {
				storage.clear();
			}
		});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('normalizes email addresses', () => {
		expect(normalizeVerificationEmail('  User@Example.COM ')).toBe('user@example.com');
	});

	it('tracks resend cooldown per email', () => {
		markVerificationResendSent('user@example.com');
		expect(getVerificationResendCooldownRemaining('user@example.com')).toBe(
			VERIFICATION_RESEND_COOLDOWN_SECONDS
		);
		expect(getVerificationResendCooldownRemaining('other@example.com')).toBe(0);
	});

	it('expires cooldown after 120 seconds', () => {
		markVerificationResendSent('user@example.com');
		vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000);
		expect(getVerificationResendCooldownRemaining('user@example.com')).toBe(0);
	});
});
