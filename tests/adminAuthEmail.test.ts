import { describe, expect, it } from 'vitest';
import { isMailDeliveryReady } from '../server/mailDelivery.js';

describe('mail delivery readiness for auth email', () => {
	it('treats resend as ready only with API key, sender, and app URL', () => {
		expect(
			isMailDeliveryReady({
				provider: 'resend',
				resendApiKey: 're_abc123',
				fromEmail: 'noreply@example.com',
				appUrl: 'https://kainbu.test'
			})
		).toBe(true);
		expect(
			isMailDeliveryReady({
				provider: 'resend',
				resendApiKey: 're_abc123',
				fromEmail: '',
				appUrl: 'https://kainbu.test'
			})
		).toBe(false);
		expect(
			isMailDeliveryReady({
				provider: 'resend',
				resendApiKey: '',
				fromEmail: 'noreply@example.com',
				appUrl: 'https://kainbu.test'
			})
		).toBe(false);
	});

	it('treats smtp as ready only when enabled with sender and app URL', () => {
		expect(
			isMailDeliveryReady({
				provider: 'smtp',
				smtpEnabled: true,
				fromEmail: 'noreply@example.com',
				appUrl: 'https://kainbu.test'
			})
		).toBe(true);
		expect(
			isMailDeliveryReady({
				provider: 'smtp',
				smtpEnabled: false,
				fromEmail: 'noreply@example.com',
				appUrl: 'https://kainbu.test'
			})
		).toBe(false);
	});
});
