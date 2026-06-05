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
const testEmail = process.env.TEST_EMAIL || `otp-probe-${Date.now()}@kainbu.test`;
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
	const { default: PocketBase } = await import('pocketbase');
	const pb = new PocketBase(pbBase);
	const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
	const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD?.trim();
	if (!adminEmail || !adminPassword) throw new Error('Missing POCKETBASE_ADMIN_* in .env');

	try {
		await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
	} catch {
		await pb.admins.authWithPassword(adminEmail, adminPassword);
	}

	const created = await pb.collection('users').create({
		email: testEmail,
		password,
		passwordConfirm: password,
		emailVisibility: true,
		verified: false
	});

	await pb.collection('users').requestVerification(testEmail);

	const updated = await pb.collection('users').getOne(created.id);
	const keys = Object.keys(updated.record || updated);
	console.log('userKeys', keys.filter((k) => /verif|token|otp|mail/i.test(k)).slice(0, 30));

	// If any hidden token fields exist, they may not be enumerable in SDK.
	// Still print a small sample of values for likely names.
	for (const k of keys) {
		if (/verif|token|otp|mail/i.test(k)) {
			const v = updated[k];
			const t = typeof v === 'string' ? v : '';
			console.log('sampleField', k, typeof v, t ? t.slice(0, 12) : null);
		}
	}
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

