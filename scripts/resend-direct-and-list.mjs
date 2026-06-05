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

	const settingsRows = await json(
		`${pbBase}/api/collections/app_settings/records?filter=${encodeURIComponent('singleton = "main"')}&fields=mail_provider,resend_api_key`,
		{ headers: auth }
	);
	const row = settingsRows.body?.items?.[0];
	const resendApiKey = typeof row?.resend_api_key === 'string' ? row.resend_api_key.trim() : '';
	if (!resendApiKey) throw new Error('Missing resend_api_key in app_settings');

	const pbSettings = await json(`${pbBase}/api/settings`, { headers: auth });
	const fromEmail = pbSettings.body?.meta?.senderAddress;
	if (typeof fromEmail !== 'string' || !fromEmail) throw new Error('Missing senderAddress in PB meta');

	const to = `resend-direct-probe-${Date.now()}@kainbu.test`;
	const subject = 'Kainbu mail probe (direct)';
	const response = await json('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: `Kainbu <${fromEmail}>`,
			to: [to],
			subject,
			html: '<p>direct probe</p>',
			text: 'direct probe'
		})
	});
	if (response.status !== 200) throw new Error(`Resend send failed: ${response.status}`);
	const id = response.body?.id;

	// List and find by recipient.
	const list = await json('https://api.resend.com/emails?limit=20', {
		method: 'GET',
		headers: { Authorization: `Bearer ${resendApiKey}` }
	});
	if (list.status !== 200) throw new Error(`Resend list failed: ${list.status}`);
	const data = list.body?.data || [];
	const hit = data.find((e) => Array.isArray(e.to) && e.to.includes(to));

	console.log(JSON.stringify({ id, to, found: Boolean(hit), hitId: hit?.id, last_event: hit?.last_event }, null, 2));
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

