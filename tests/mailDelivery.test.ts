import { describe, expect, it } from 'vitest';

describe('mail delivery config', () => {
	it('treats resend as ready only with key, sender, and app URL', async () => {
		const { loadMailDeliveryConfig } = await import('../server/mailDelivery.js');
		const admin = {
			collection: () => ({
				getFullList: async () => [
					{ mail_provider: 'resend', resend_api_key: 're_test_key' }
				]
			}),
			settings: {
				getAll: async () => ({
					meta: { senderAddress: 'noreply@example.com', senderName: 'Kainbu', appURL: 'https://kainbu.test' },
					smtp: { enabled: false }
				})
			}
		};
		const config = await loadMailDeliveryConfig(admin as never);
		expect(config.provider).toBe('resend');
		expect(config.ready).toBe(true);
	});
});
