import type PocketBase from 'pocketbase';

const APP_SETTINGS_SINGLETON = 'main';

export type MailDeliveryConfig = {
	provider: 'off' | 'smtp' | 'resend';
	ready: boolean;
	resendApiKey: string;
	fromEmail: string;
	fromName: string;
	appUrl: string;
	smtpEnabled: boolean;
};

export type MailDeliveryResult = {
	sent: boolean;
	configured: boolean;
	error?: string;
};

const settingsText = (record: Record<string, unknown> | undefined, key: string) => {
	const value = record?.[key];
	return typeof value === 'string' ? value.trim() : '';
};

const normalizeMailProvider = (value: unknown): 'off' | 'smtp' | 'resend' => {
	const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
	return normalized === 'smtp' || normalized === 'resend' ? normalized : 'off';
};

export const loadMailDeliveryConfig = async (admin: PocketBase): Promise<MailDeliveryConfig> => {
	let record: Record<string, unknown> | undefined;
	try {
		const rows = await admin.collection('app_settings').getFullList({
			filter: `singleton = "${APP_SETTINGS_SINGLETON}"`,
			fields: 'mail_provider,resend_api_key'
		});
		record = rows[0] as Record<string, unknown> | undefined;
	} catch {
		record = undefined;
	}

	const pbSettings = await admin.settings.getAll();
	const meta = (pbSettings.meta || {}) as Record<string, unknown>;
	const smtp = (pbSettings.smtp || {}) as Record<string, unknown>;
	const provider = normalizeMailProvider(record?.mail_provider);
	const resendApiKey = settingsText(record, 'resend_api_key');
	const fromEmail = typeof meta.senderAddress === 'string' ? meta.senderAddress.trim() : '';
	const fromName = typeof meta.senderName === 'string' ? meta.senderName.trim() : 'Kainbu';
	const appUrl = typeof meta.appURL === 'string' ? meta.appURL.trim().replace(/\/+$/, '') : '';
	const smtpEnabled = smtp.enabled === true;

	const ready =
		provider === 'resend'
			? Boolean(resendApiKey && fromEmail && appUrl)
			: provider === 'smtp'
				? Boolean(smtpEnabled && fromEmail && appUrl)
				: false;

	return {
		provider,
		ready,
		resendApiKey,
		fromEmail,
		fromName,
		appUrl,
		smtpEnabled
	};
};

const htmlEscape = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const buildInviteEmail = (projectName: string, appUrl: string) => {
	const link = appUrl || '/';
	const subject = `You were invited to ${projectName}`;
	const html = `<p>You were invited to join <strong>${htmlEscape(projectName)}</strong> on Kainbu.</p><p><a href="${htmlEscape(link)}">Open Kainbu</a> and sign in with this email address to accept the invite.</p>`;
	const text = `You were invited to join ${projectName} on Kainbu. Open ${link} and sign in with this email address to accept the invite.`;
	return { subject, html, text, link };
};

const formatFromAddress = (fromName: string, fromEmail: string) =>
	fromName ? `${fromName} <${fromEmail}>` : fromEmail;

const sendViaResend = async (
	config: MailDeliveryConfig,
	inviteeEmail: string,
	projectName: string
): Promise<MailDeliveryResult> => {
	if (!config.ready || config.provider !== 'resend') {
		return { sent: false, configured: config.provider === 'resend' && config.ready };
	}

	const { subject, html, text } = buildInviteEmail(projectName, config.appUrl);
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.resendApiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: formatFromAddress(config.fromName, config.fromEmail),
			to: [inviteeEmail],
			subject,
			html,
			text
		})
	});

	const bodyText = await response.text();
	let bodyJson: Record<string, unknown> = {};
	try {
		bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
	} catch {
		bodyJson = { raw: bodyText.slice(0, 500) };
	}

	if (!response.ok) {
		const message =
			typeof bodyJson.message === 'string'
				? bodyJson.message
				: typeof bodyJson.error === 'string'
					? bodyJson.error
					: `Resend returned ${response.status}`;
		console.error('[mail] Resend invite email failed', {
			status: response.status,
			to: inviteeEmail,
			from: config.fromEmail,
			body: bodyJson
		});
		return { sent: false, configured: true, error: message };
	}

	return { sent: true, configured: true };
};

/** SMTP invite delivery stays on the PocketBase after-create hook (MailerMessage). */
export const sendProjectInviteEmail = async (
	admin: PocketBase,
	inviteeEmail: string,
	projectName: string
): Promise<MailDeliveryResult> => {
	const config = await loadMailDeliveryConfig(admin);

	if (config.provider === 'off' || !config.ready) {
		return { sent: false, configured: false };
	}

	if (config.provider === 'resend') {
		return sendViaResend(config, inviteeEmail, projectName);
	}

	// SMTP: hook sends on record create; API cannot confirm delivery here.
	return { sent: false, configured: true };
};
