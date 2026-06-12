/// <reference path="../pb_data/types.d.ts" />

// Shared mail helpers for the pb_hooks handlers.
//
// IMPORTANT: PocketBase runs each hook handler in an isolated, pooled goja VM.
// A handler CANNOT see consts/functions declared at the top level of *.pb.js —
// referencing them throws `ReferenceError: <name> is not defined`.
// That is why this lives in a separate module that every handler require()s:
//   const mail = require(`${__hooks}/mail.js`);
// (This file is NOT named *.pb.js, so PocketBase does not auto-load it as a hook
// entrypoint — it is only reachable via require().)

const APP_SETTINGS_SINGLETON = 'main';

const loadAppSettings = (app) => {
	try {
		const record = app.findFirstRecordByFilter(
			'app_settings',
			'singleton = {:singleton}',
			{ singleton: APP_SETTINGS_SINGLETON }
		);
		app.logger().info(
			`[mail-hook] app_settings loaded provider=${record ? record.get('mail_provider') : '<none>'}`
		);
		return record;
	} catch (err) {
		app.logger().error(
			`[mail-hook] failed to load app_settings: ${err instanceof Error ? err.message : String(err)}`
		);
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

/**
 * POST a fully-formed payload to the Resend API.
 * Logs the HTTP outcome and throws (with detail) on any non-2xx or transport error,
 * so failures are never silent.
 */
const postToResend = (app, apiKey, payload, context) => {
	const to = Array.isArray(payload.to) ? payload.to.join(',') : String(payload.to || '');
	let response;
	try {
		response = $http.send({
			method: 'POST',
			url: 'https://api.resend.com/emails',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});
	} catch (err) {
		app.logger().error(
			`[mail-hook] ${context}: $http.send threw (egress/TLS?) to=${to}: ${err instanceof Error ? err.message : String(err)}`
		);
		throw err;
	}

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
		app.logger().error(
			`[mail-hook] ${context}: Resend returned ${response.statusCode} to=${to} body=${(response.raw || '').slice(0, 500)}`
		);
		throw new Error(
			detail
				? `Resend email failed (${response.statusCode}): ${detail}`
				: `Resend email failed (${response.statusCode})`
		);
	}

	app.logger().info(`[mail-hook] ${context}: sent via Resend (${response.statusCode}) to=${to}`);
	return true;
};

/** Send a PocketBase MailerMessage via Resend. Returns true when handled (caller must not call e.next()). */
const sendViaResend = (app, settings, message, context) => {
	const apiKey = getText(settings, 'resend_api_key');
	if (!apiKey) {
		throw new Error('Resend API key is not configured.');
	}

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

	return postToResend(app, apiKey, payload, context || 'message');
};

const appMeta = (app) => app.settings()?.meta || {};

const getAppUrl = (app) => {
	const meta = appMeta(app);
	return typeof meta.appURL === 'string' ? meta.appURL.trim().replace(/\/+$/, '') : '';
};

const getSender = (app) => {
	const meta = appMeta(app);
	return {
		fromEmail: typeof meta.senderAddress === 'string' ? meta.senderAddress.trim() : '',
		fromName: typeof meta.senderName === 'string' ? meta.senderName.trim() : ''
	};
};

module.exports = {
	APP_SETTINGS_SINGLETON,
	loadAppSettings,
	getText,
	mailProvider,
	htmlEscape,
	addressList,
	postToResend,
	sendViaResend,
	appMeta,
	getAppUrl,
	getSender
};
