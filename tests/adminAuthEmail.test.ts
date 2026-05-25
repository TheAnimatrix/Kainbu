import { describe, expect, it } from 'vitest';

const normalizeMailProvider = (value: unknown): 'off' | 'smtp' | 'resend' => {
	const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
	return normalized === 'smtp' || normalized === 'resend' ? normalized : 'off';
};

const settingsText = (record: Record<string, unknown> | null | undefined, name: string) => {
	const value = record?.[name];
	return typeof value === 'string' ? value.trim() : '';
};

const isMailConfiguredRecord = (
	record: Record<string, unknown> | null | undefined,
	smtp?: Record<string, unknown>
) => {
	const provider = normalizeMailProvider(record?.mail_provider);
	if (provider === 'off') return false;
	if (provider === 'resend') {
		return Boolean(settingsText(record, 'resend_api_key'));
	}
	if (provider === 'smtp') {
		return (
			smtp?.enabled === true &&
			typeof smtp.host === 'string' &&
			smtp.host.trim().length > 0
		);
	}
	return false;
};

describe('admin auth email configured state', () => {
	it('treats resend as configured only when API key is stored', () => {
		expect(
			isMailConfiguredRecord({ mail_provider: 'resend', resend_api_key: 're_abc123' })
		).toBe(true);
		expect(isMailConfiguredRecord({ mail_provider: 'resend', resend_api_key: '' })).toBe(false);
		expect(isMailConfiguredRecord({ mail_provider: 'resend' })).toBe(false);
	});

	it('treats smtp as configured only when PB SMTP is enabled with a host', () => {
		expect(
			isMailConfiguredRecord(
				{ mail_provider: 'smtp' },
				{ enabled: true, host: 'smtp.example.com' }
			)
		).toBe(true);
		expect(
			isMailConfiguredRecord({ mail_provider: 'smtp' }, { enabled: false, host: 'smtp.example.com' })
		).toBe(false);
	});
});
