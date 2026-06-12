/// <reference path="../pb_data/types.d.ts" />

// PocketBase runs each hook handler in an isolated, pooled goja VM. Handlers
// CANNOT access file-scope consts/functions — doing so throws
// `ReferenceError: <name> is not defined`. All shared helpers therefore live in
// ./mail.js and are require()'d INSIDE each handler. See mail.js for details.

/**
 * Auth emails use onMailerRecord* hooks. We build the verification/reset payload
 * from e.record + e.meta + PB settings to avoid relying on event.message
 * structure across PocketBase versions.
 */
const interceptResendVerification = (e) => {
	const mail = require(`${__hooks}/mail.js`);
	e.app.logger().info('[mail-hook] onMailerRecordVerificationSend fired');
	const settings = mail.loadAppSettings(e.app);
	if (mail.mailProvider(settings) !== 'resend') {
		e.app.logger().info('[mail-hook] verification: provider!=resend -> e.next() (PB SMTP)');
		return e.next();
	}

	const { fromEmail, fromName } = mail.getSender(e.app);
	const appUrl = mail.getAppUrl(e.app);
	const token = e.meta?.token || '';
	const recipient = e.record?.get('email') || '';
	e.app.logger().info(
		`[mail-hook] verification: token=${token ? 'present' : 'MISSING'} fromEmail=${fromEmail ? 'present' : 'MISSING'} appUrl=${appUrl ? 'present' : 'MISSING'} recipient=${recipient ? 'present' : 'MISSING'}`
	);
	if (!fromEmail || !appUrl || !token || !recipient) {
		e.app.logger().error('[mail-hook] verification: bailing before send (missing field above)');
		return;
	}

	const link = `${appUrl}/auth/confirm-verification/${encodeURIComponent(token)}`;
	const subject = 'Verify your Kainbu email';
	const html = `<p>Welcome to Kainbu.</p><p><a href="${mail.htmlEscape(
		link
	)}">Verify your email</a></p>`;
	const text = `Welcome to Kainbu. Verify your email: ${link}`;

	mail.postToResend(
		e.app,
		mail.getText(settings, 'resend_api_key'),
		{
			from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
			to: [recipient],
			subject,
			html,
			text
		},
		'verification'
	);
};

const interceptResendPasswordReset = (e) => {
	const mail = require(`${__hooks}/mail.js`);
	e.app.logger().info('[mail-hook] onMailerRecordPasswordResetSend fired');
	const settings = mail.loadAppSettings(e.app);
	if (mail.mailProvider(settings) !== 'resend') {
		e.app.logger().info('[mail-hook] password-reset: provider!=resend -> e.next() (PB SMTP)');
		return e.next();
	}

	const { fromEmail, fromName } = mail.getSender(e.app);
	const appUrl = mail.getAppUrl(e.app);
	const token = e.meta?.token || '';
	const recipient = e.record?.get('email') || '';
	e.app.logger().info(
		`[mail-hook] password-reset: token=${token ? 'present' : 'MISSING'} fromEmail=${fromEmail ? 'present' : 'MISSING'} appUrl=${appUrl ? 'present' : 'MISSING'} recipient=${recipient ? 'present' : 'MISSING'}`
	);
	if (!fromEmail || !appUrl || !token || !recipient) {
		e.app.logger().error('[mail-hook] password-reset: bailing before send (missing field above)');
		return;
	}

	const link = `${appUrl}/auth/confirm-password-reset/${encodeURIComponent(token)}`;
	const subject = 'Reset your Kainbu password';
	const html = `<p>Use this link to set a new Kainbu password.</p><p><a href="${mail.htmlEscape(
		link
	)}">Reset password</a></p>`;
	const text = `Reset your Kainbu password: ${link}`;

	mail.postToResend(
		e.app,
		mail.getText(settings, 'resend_api_key'),
		{
			from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
			to: [recipient],
			subject,
			html,
			text
		},
		'password-reset'
	);
};

/** Fallback for other record mail types (email change): re-send the rendered message via Resend. */
const interceptResendMail = (e) => {
	const mail = require(`${__hooks}/mail.js`);
	e.app.logger().info('[mail-hook] onMailerRecordEmailChangeSend fired');
	const settings = mail.loadAppSettings(e.app);
	if (mail.mailProvider(settings) !== 'resend') {
		e.app.logger().info('[mail-hook] email-change: provider!=resend -> e.next() (PB SMTP)');
		return e.next();
	}
	mail.sendViaResend(e.app, settings, e.message, 'email-change');
};

// PocketBase 0.23+: do not attach hooks to the `users` auth collection (breaks signup).
// Signup disable is enforced in the Hono `/api/auth/signup` route and the app UI.

/** Kainbu: new-device login alerts are disabled (see users.authAlert + migration 1730000023). */
const suppressAuthAlertMail = () => {};

$app.logger().info('[mail-hook] pb_hooks/main.pb.js loaded; registering mailer hooks');

onMailerRecordVerificationSend(interceptResendVerification);
onMailerRecordPasswordResetSend(interceptResendPasswordReset);
onMailerRecordEmailChangeSend(interceptResendMail);
onMailerRecordAuthAlertSend(suppressAuthAlertMail);

// Catch-all for any other mail (e.g. superuser OTP): route to Resend when selected.
onMailerSend((e) => {
	const mail = require(`${__hooks}/mail.js`);
	e.app.logger().info(`[mail-hook] onMailerSend fired subject=${e.message?.subject || ''}`);
	const settings = mail.loadAppSettings(e.app);
	if (mail.mailProvider(settings) !== 'resend') {
		e.app.logger().info('[mail-hook] onMailerSend: provider!=resend -> e.next() (PB SMTP)');
		return e.next();
	}

	mail.sendViaResend(e.app, settings, e.message, 'onMailerSend');
});

onRecordAfterCreateSuccess((e) => {
	const mail = require(`${__hooks}/mail.js`);
	try {
		const settings = mail.loadAppSettings(e.app);
		const provider = mail.mailProvider(settings);
		if (provider === 'off') return;
		// Resend invite mail is sent from the API server after create (clearer errors to UI).
		if (provider === 'resend') return;
		if (provider === 'smtp' && !e.app.settings().smtp.enabled) return;

		const inviteeEmail = mail.getText(e.record, 'invitee_email');
		const projectId = mail.getText(e.record, 'project');
		if (!inviteeEmail || !projectId) return;

		let projectName = 'a Kainbu workspace';
		try {
			const project = e.app.findRecordById('projects', projectId);
			projectName = mail.getText(project, 'name') || projectName;
		} catch (_) {}

		const appUrl = (e.app.settings().meta.appURL || '').replace(/\/+$/, '');
		const link = appUrl || '/';
		const subject = `You were invited to ${projectName}`;
		const html = `<p>You were invited to join <strong>${mail.htmlEscape(projectName)}</strong> on Kainbu.</p><p><a href="${mail.htmlEscape(link)}">Open Kainbu</a> and sign up or sign in with this email address to accept the invite.</p>`;

		const message = new MailerMessage({
			from: {
				address: e.app.settings().meta.senderAddress,
				name: e.app.settings().meta.senderName
			},
			to: [{ address: inviteeEmail }],
			subject,
			html,
			text: `You were invited to join ${projectName} on Kainbu. Open ${link} and sign up or sign in with this email address to accept the invite.`
		});
		e.app.newMailClient().send(message);
	} catch (err) {
		e.app.logger().error(
			`project_invites invite email failed: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}, 'project_invites');
