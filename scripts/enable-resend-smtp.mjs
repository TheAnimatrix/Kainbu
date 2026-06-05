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
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD?.trim();

const json = async (url, opts = {}) => {
	const res = await fetch(url, opts);
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text.slice(0, 500);
	}
	return { status: res.status, body };
};

const loginAdmin = async () => {
	for (const pathSuffix of [
		'/api/collections/_superusers/auth-with-password',
		'/api/admins/auth-with-password'
	]) {
		const result = await json(`${pbBase}${pathSuffix}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ identity: adminEmail, password: adminPassword })
		});
		if (result.status === 200 && result.body?.token) return result.body.token;
	}
	throw new Error('Admin login failed');
};

const main = async () => {
	if (!adminEmail || !adminPassword) throw new Error('Missing POCKETBASE_ADMIN_* in .env');

	const token = await loginAdmin();
	const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

	const settingsRows = await json(
		`${pbBase}/api/collections/app_settings/records?filter=${encodeURIComponent('singleton = "main"')}&fields=mail_provider,resend_api_key`,
		{ headers: auth }
	);
	const row = settingsRows.body?.items?.[0];
	const apiKey = typeof row?.resend_api_key === 'string' ? row.resend_api_key.trim() : '';
	if (row?.mail_provider !== 'resend' || !apiKey) {
		throw new Error('mail_provider is not resend or resend_api_key missing');
	}

	const current = await json(`${pbBase}/api/settings`, { headers: auth });
	const meta = current.body?.meta || {};

	const update = await json(`${pbBase}/api/settings`, {
		method: 'PATCH',
		headers: auth,
		body: JSON.stringify({
			meta,
			smtp: {
				enabled: true,
				host: 'smtp.resend.com',
				port: 465,
				username: 'resend',
				password: apiKey,
				tls: true,
				authMethod: 'PLAIN'
			}
		})
	});
	console.log('settings update', update.status, update.body);

	const after = await json(`${pbBase}/api/settings`, { headers: auth });
	console.log('smtp after', {
		enabled: after.body?.smtp?.enabled,
		host: after.body?.smtp?.host,
		port: after.body?.smtp?.port,
		username: after.body?.smtp?.username,
		passwordConfigured: Boolean(after.body?.smtp?.password)
	});
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
