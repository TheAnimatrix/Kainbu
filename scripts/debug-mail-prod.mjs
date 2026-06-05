#!/usr/bin/env node
/**
 * Inspect production mail config and probe Resend delivery (no secrets printed).
 */
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
const apiBase = (process.env.KAINBU_PUBLIC_URL || 'https://kainbu.avarnic.com').replace(/\/+$/, '');
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
		if (result.status === 200 && result.body?.token) {
			return result.body.token;
		}
	}
	throw new Error('Admin login failed — check POCKETBASE_ADMIN_EMAIL/PASSWORD in .env');
};

const main = async () => {
	console.log('PB:', pbBase);
	console.log('API:', apiBase);

	const authSettings = await json(`${apiBase}/api/auth/settings`);
	console.log('\n/api/auth/settings', authSettings.status, authSettings.body);

	if (!adminEmail || !adminPassword) {
		console.log('\nSkip admin probes (no POCKETBASE_ADMIN_* in .env)');
		return;
	}

	const token = await loginAdmin();
	const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

	const settingsRows = await json(
		`${pbBase}/api/collections/app_settings/records?filter=${encodeURIComponent('singleton = "main"')}&fields=mail_provider,resend_api_key`,
		{ headers: auth }
	);
	console.log('\napp_settings row', settingsRows.status, {
		count: settingsRows.body?.items?.length,
		mail_provider: settingsRows.body?.items?.[0]?.mail_provider,
		has_resend_key: Boolean(settingsRows.body?.items?.[0]?.resend_api_key)
	});

	const pbSettings = await json(`${pbBase}/api/settings`, { headers: auth });
	console.log('\nPB settings meta', pbSettings.body?.meta);
	console.log('PB smtp.enabled', pbSettings.body?.smtp?.enabled);

	const usersCollection = await json(`${pbBase}/api/collections/users`, { headers: auth });
	console.log('\nusers verification template subject:', usersCollection.body?.verificationTemplate?.subject);
	console.log(
		'users verification link snippet:',
		(usersCollection.body?.verificationTemplate?.body || '').slice(0, 160).replace(/\s+/g, ' ')
	);

	const resendKey = settingsRows.body?.items?.[0]?.resend_api_key;
	const fromEmail = pbSettings.body?.meta?.senderAddress;
	if (resendKey && fromEmail && process.argv.includes('--send-test')) {
		const to = process.argv[process.argv.indexOf('--send-test') + 1];
		if (!to) throw new Error('Usage: --send-test you@example.com');
		const res = await json('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${resendKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				from: `Kainbu <${fromEmail}>`,
				to: [to],
				subject: 'Kainbu mail probe',
				html: '<p>If you received this, Resend delivery works.</p>',
				text: 'If you received this, Resend delivery works.'
			})
		});
		console.log('\nResend direct probe', res.status, res.body);
	} else if (process.argv.includes('--send-test')) {
		console.log('\nSkip Resend probe: missing resend_api_key or senderAddress');
	}

	const verifyProbe = await json(`${pbBase}/api/collections/users/request-verification`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: 'mail-probe-nonexistent@kainbu.test' })
	});
	console.log('\nrequest-verification (fake email)', verifyProbe.status, verifyProbe.body);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
