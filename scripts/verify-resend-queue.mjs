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
const email = `mail-probe-${Date.now()}@kainbu.test`;
const password = 'TestPass123!@#';

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

const main = async () => {
	const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
	const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD?.trim();
	if (!adminEmail || !adminPassword) throw new Error('Missing POCKETBASE_ADMIN_* in .env');

	// login
	let token = undefined;
	for (const pathSuffix of [
		'/api/collections/_superusers/auth-with-password',
		'/api/admins/auth-with-password'
	]) {
		const r = await json(`${pbBase}${pathSuffix}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ identity: adminEmail, password: adminPassword })
		});
		if (r.status === 200 && r.body?.token) {
			token = r.body.token;
			break;
		}
	}
	if (!token) throw new Error('PocketBase admin login failed');
	const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

	// create user (unverified)
	const created = await json(`${pbBase}/api/collections/users/records`, {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ email, password, passwordConfirm: password })
	});
	if (created.status !== 200) {
		console.error('create user failed', created.status, created.body);
		process.exit(1);
	}

	// request verification
	const requested = await json(`${pbBase}/api/collections/users/request-verification`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ email })
	});
	console.log('request-verification', requested.status);

	// fetch resend_api_key
	const settingsRows = await json(
		`${pbBase}/api/collections/app_settings/records?filter=${encodeURIComponent('singleton = "main"')}&fields=mail_provider,resend_api_key`,
		{ headers: auth }
	);
	const row = settingsRows.body?.items?.[0];
	const resendApiKey = typeof row?.resend_api_key === 'string' ? row.resend_api_key.trim() : '';
	if (!resendApiKey) {
		console.error('missing resend_api_key in app_settings');
		process.exit(1);
	}

	// list recent resend emails
	const list = await json('https://api.resend.com/emails?limit=20', {
		method: 'GET',
		headers: { authorization: `Bearer ${resendApiKey}` }
	});
	if (list.status !== 200) {
		console.error('resend list failed', list.status, list.body);
		process.exit(1);
	}

	const data = list.body?.data || [];
	const hit = data.find((e) => (Array.isArray(e.to) ? e.to.includes(email) : false));
	console.log('probeEmail', email);
	if (!hit) {
		console.log('No recent resend email found for this recipient in last 20');
		process.exit(2);
	}
	console.log('Found resend email:', {
		id: hit.id,
		subject: hit.subject,
		last_event: hit.last_event,
		created_at: hit.created_at,
		from: hit.from,
		to: hit.to
	});
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
