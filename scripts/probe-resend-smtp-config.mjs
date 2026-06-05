#!/usr/bin/env node
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env', '.env.local']) {
	const envPath = path.join(root, file);
	if (existsSync(envPath)) config({ path: envPath, override: false, quiet: true });
}

const pbBase = (process.env.POCKETBASE_URL || 'https://kainbu.avarnic.com/pb').replace(/\/+$/, '');

const SMTP_PORT = Number(process.env.SMTP_PORT || '587');
const SMTP_TLS = (process.env.SMTP_TLS || 'false').toLowerCase() === 'true';

const json = async (url, opts = {}) => {
	const res = await fetch(url, opts);
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	return { status: res.status, body };
};

const loginAdmin = async () => {
	const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
	const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD?.trim();
	if (!adminEmail || !adminPassword) throw new Error('Missing POCKETBASE_ADMIN_* in .env');

	for (const pathSuffix of [
		'/api/collections/_superusers/auth-with-password',
		'/api/admins/auth-with-password'
	]) {
		const r = await json(`${pbBase}${pathSuffix}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ identity: adminEmail, password: adminPassword })
		});
		if (r.status === 200 && r.body?.token) return r.body.token;
	}
	throw new Error('PocketBase admin login failed');
};

const main = async () => {
	const token = await loginAdmin();
	const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

	const email = `mail-smtp-probe-${Date.now()}@kainbu.test`;
	const password = 'TestPass123!@#';

	const settingsRows = await json(
		`${pbBase}/api/collections/app_settings/records?filter=${encodeURIComponent('singleton = "main"')}&fields=mail_provider,resend_api_key`,
		{ headers: auth }
	);
	const row = settingsRows.body?.items?.[0];
	const resendApiKey = typeof row?.resend_api_key === 'string' ? row.resend_api_key.trim() : '';
	if (!resendApiKey) throw new Error('Missing resend_api_key in app_settings');

	// Patch PocketBase SMTP settings to Resend SMTP.
	const current = await json(`${pbBase}/api/settings`, { headers: auth });
	const currentMeta = current.body?.smtp || {};

	const update = await json(`${pbBase}/api/settings`, {
		method: 'PATCH',
		headers: auth,
		body: JSON.stringify({
			...current.body,
			smtp: {
				...currentMeta,
				enabled: true,
				host: 'smtp.resend.com',
				port: SMTP_PORT,
				username: 'resend',
				password: resendApiKey,
				tls: SMTP_TLS,
				authMethod: 'PLAIN'
			}
		})
	});
	if (update.status !== 200) throw new Error(`settings patch failed: ${update.status}`);

	// Create user + request verification and password reset.
	const created = await json(`${pbBase}/api/collections/users/records`, {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ email, password, passwordConfirm: password })
	});
	if (created.status !== 200) throw new Error(`create user failed: ${created.status}`);

	const ver = await json(`${pbBase}/api/collections/users/request-verification`, {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ email })
	});

	const reset = await json(`${pbBase}/api/collections/users/request-password-reset`, {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ email })
	});

	console.log('request-verification', ver.status, 'request-password-reset', reset.status);

	// Give mailer a moment.
	await new Promise((r) => setTimeout(r, 1500));

	// Check Resend last 50 emails for our recipient.
	const list = await json('https://api.resend.com/emails?limit=50', {
		method: 'GET',
		headers: { authorization: `Bearer ${resendApiKey}` }
	});
	if (list.status !== 200) throw new Error(`Resend list failed: ${list.status}`);

	const data = list.body?.data || [];
	const hits = data.filter((e) => Array.isArray(e.to) && e.to.includes(email));
	console.log('probeEmail', email);
	console.log('resend hits', hits.length);
	if (hits[0]) {
		console.log('first hit', {
			id: hits[0].id,
			subject: hits[0].subject,
			last_event: hits[0].last_event,
			created_at: hits[0].created_at,
			to: hits[0].to
		});
	}
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

