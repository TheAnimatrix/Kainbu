/// <reference path="../pb_data/types.d.ts" />

const APP_SETTINGS_SINGLETON = 'main';

const loadAppSettings = (app) => {
	try {
		return app.findFirstRecordByFilter(
			'app_settings',
			'singleton = {:singleton}',
			{ singleton: APP_SETTINGS_SINGLETON }
		);
	} catch (_) {
		return null;
	}
};

const getText = (record, name) => {
	const value = record ? record.get(name) : '';
	return typeof value === 'string' ? value.trim() : '';
};

const mailProvider = (record) => {
	const provider = getText(record, 'mail_provider').toLowerCase();
	return provider === 'smtp' || provider === 'resend' ? provider : 'off';
};

const htmlEscape = (value) =>
	String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const addressList = (items) =>
	(items || [])
		.map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address))
		.filter(Boolean);

// PocketBase 0.23+: do not attach hooks to the `users` auth collection (breaks signup).
// Signup disable is enforced in the Hono `/api/auth/signup` route and the app UI.

onMailerSend((e) => {
	const settings = loadAppSettings(e.app);
	if (mailProvider(settings) !== 'resend') {
		return e.next();
	}

	const apiKey = getText(settings, 'resend_api_key');
	if (!apiKey) {
		throw new Error('Resend API key is not configured.');
	}

	const message = e.message;
	const payload = {
		from: message.from.name
			? `${message.from.name} <${message.from.address}>`
			: message.from.address,
		to: addressList(message.to),
		cc: addressList(message.cc),
		bcc: addressList(message.bcc),
		subject: message.subject,
		html: message.html,
		text: message.text
	};

	const response = $http.send({
		method: 'POST',
		url: 'https://api.resend.com/emails',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (response.statusCode < 200 || response.statusCode >= 300) {
		let detail = '';
		try {
			const parsed = JSON.parse(response.raw || '{}');
			detail =
				typeof parsed.message === 'string'
					? parsed.message
					: typeof parsed.error === 'string'
						? parsed.error
						: '';
		} catch (_) {}
		throw new Error(
			detail
				? `Resend email failed (${response.statusCode}): ${detail}`
				: `Resend email failed (${response.statusCode})`
		);
	}
});

onRecordAfterCreateSuccess((e) => {
	try {
		const settings = loadAppSettings(e.app);
		const provider = mailProvider(settings);
		if (provider === 'off') return;
		// Resend invite mail is sent from the API server after create (clearer errors to UI).
		if (provider === 'resend') return;
		if (provider === 'smtp' && !e.app.settings().smtp.enabled) return;

		const inviteeEmail = getText(e.record, 'invitee_email');
		const projectId = getText(e.record, 'project');
		if (!inviteeEmail || !projectId) return;

		let projectName = 'a Kainbu workspace';
		try {
			const project = e.app.findRecordById('projects', projectId);
			projectName = getText(project, 'name') || projectName;
		} catch (_) {}

		const appUrl = (e.app.settings().meta.appURL || '').replace(/\/+$/, '');
		const link = appUrl || '/';
		const subject = `You were invited to ${projectName}`;
		const html = `<p>You were invited to join <strong>${htmlEscape(projectName)}</strong> on Kainbu.</p><p><a href="${htmlEscape(link)}">Open Kainbu</a> and sign in with this email address to accept the invite.</p>`;

		const message = new MailerMessage({
			from: {
				address: e.app.settings().meta.senderAddress,
				name: e.app.settings().meta.senderName
			},
			to: [{ address: inviteeEmail }],
			subject,
			html,
			text: `You were invited to join ${projectName} on Kainbu. Open ${link} and sign in with this email address to accept the invite.`
		});
		e.app.newMailClient().send(message);
	} catch (err) {
		e.app.logger().error(
			`project_invites invite email failed: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}, 'project_invites');
