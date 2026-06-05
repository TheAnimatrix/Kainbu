// Run the frontend (Vite) + API server (Hono) locally while pointing both at a
// remote PocketBase. Only the database is remote — web app and API stay local.
//
// Usage:
//   npm run dev:remote
//   REMOTE_POCKETBASE_URL=https://other-host/pb npm run dev:remote
//
// Both the browser (VITE_POCKETBASE_URL) and the API server (POCKETBASE_URL) are
// pointed at the same remote URL. Admin credentials are still read from your
// local .env (POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD) — they must
// match a superuser on the REMOTE instance.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const REMOTE_POCKETBASE_URL = (
	process.env.REMOTE_POCKETBASE_URL || 'https://kainbu.avarnic.com/pb'
)
	.trim()
	.replace(/\/+$/, '');

// Surface a clear warning if the remote admin credentials aren't configured —
// the API server will otherwise fail on its first admin call.
for (const envFile of ['.env', '.env.local']) {
	const envPath = path.join(projectRoot, envFile);
	if (existsSync(envPath)) loadEnv({ path: envPath, override: false, quiet: true });
}
const missingCreds = ['POCKETBASE_ADMIN_EMAIL', 'POCKETBASE_ADMIN_PASSWORD'].filter(
	(key) => !process.env[key]?.trim()
);
if (missingCreds.length) {
	console.warn(
		`[dev:remote] Warning: ${missingCreds.join(' and ')} not set in .env. ` +
			`The API server needs remote superuser credentials to read/write PocketBase.`
	);
}

console.log(`[dev:remote] PocketBase (remote): ${REMOTE_POCKETBASE_URL}`);
console.log('[dev:remote] Web app: http://127.0.0.1:3001  |  API: http://127.0.0.1:8788');

const child = spawn('npm', ['run', 'dev:full'], {
	cwd: projectRoot,
	stdio: 'inherit',
	shell: true,
	env: {
		...process.env,
		// Server-side (Hono API). server/env.ts loads .env with override:false, so
		// these injected values win over any POCKETBASE_URL in the .env file.
		POCKETBASE_URL: REMOTE_POCKETBASE_URL,
		// Browser-side. Vite's loadEnv exposes VITE_-prefixed process.env vars to
		// import.meta.env, so this reaches the client without touching .env files.
		VITE_POCKETBASE_URL: REMOTE_POCKETBASE_URL
	}
});

child.on('exit', (code) => process.exit(code ?? 0));
