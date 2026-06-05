#!/usr/bin/env node
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env', '.env.local']) {
	const envPath = path.join(root, file);
	if (existsSync(envPath)) config({ path: envPath, override: false, quiet: true });
}

const pbUrl = process.env.POCKETBASE_URL || 'https://kainbu.avarnic.com/pb';

const main = async () => {
	const { default: PocketBase } = await import('pocketbase');
	const pb = new PocketBase(pbUrl);

	const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
	const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD?.trim();
	if (!adminEmail || !adminPassword) throw new Error('Missing POCKETBASE_ADMIN_* in .env');

	try {
		await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
	} catch {
		await pb.admins.authWithPassword(adminEmail, adminPassword);
	}

	const usersCollection = await pb.collections.getOne('users');
	const userEmail = `manual-verif-${Date.now()}@kainbu.test`;
	const password = 'TestPass123!@#';

	const user = await pb.collection('users').create({
		email: userEmail,
		emailVisibility: true,
		verified: false,
		password,
		passwordConfirm: password
	});

	const token = crypto.randomBytes(24).toString('base64url');
	console.log('created user', { userId: user.id, verified: user.verified, token: token.slice(0, 16) + '...' });

	// Create an OTP record manually (PocketBase stores tokens in the internal `_otps` collection).
	await pb.collection('_otps').create({
		collectionRef: usersCollection.id,
		recordRef: user.id,
		sentTo: userEmail,
		password: token
	});

	// Confirm verification (this should mark the user as verified if the token matches).
	let confirmResult;
	try {
		confirmResult = await pb.collection('users').confirmVerification(token);
		console.log('confirmVerification result', confirmResult);
	} catch (e) {
		console.error('confirmVerification failed', e?.response?.data || e);
		throw e;
	}

	const updated = await pb.collection('users').getOne(user.id);
	console.log('updated verified', updated.verified);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

