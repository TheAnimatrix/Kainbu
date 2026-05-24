#!/usr/bin/env node
/**
 * First-run helper: create PocketBase superuser if missing.
 * Requires pocketbase CLI in PATH or running inside the pocketbase container.
 */
import { spawn } from 'node:child_process';

const email = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@kainbu.local';
const password = process.env.POCKETBASE_ADMIN_PASSWORD || 'kainbu-admin-change-me';

const run = (command, args) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit' });
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited with ${code}`));
		});
	});

try {
	await run('pocketbase', ['superuser', 'upsert', email, password]);
	console.log(`PocketBase admin ready: ${email}`);
} catch (error) {
	console.warn('Could not create PocketBase admin automatically:', error.message);
	console.warn('Create one manually at http://localhost:8090/_/');
}
