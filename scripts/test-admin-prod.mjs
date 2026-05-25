#!/usr/bin/env node
/**
 * Smoke-test admin panel APIs on production (or any deployed host).
 *
 * Usage:
 *   KAINBU_PROD_URL=https://kainbu.avarnic.com \
 *   KAINBU_PROD_EMAIL=you@example.com \
 *   KAINBU_PROD_PASSWORD=secret \
 *   node scripts/test-admin-prod.mjs
 */
const BASE = (process.env.KAINBU_PROD_URL || 'https://kainbu.avarnic.com').replace(/\/+$/, '');
const email = process.env.KAINBU_PROD_EMAIL;
const password = process.env.KAINBU_PROD_PASSWORD;

if (!email || !password) {
	console.error('Set KAINBU_PROD_EMAIL and KAINBU_PROD_PASSWORD');
	process.exit(1);
}

const authJson = async (path, token, init = {}) => {
	const response = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...(init.headers || {})
		}
	});
	const body = await response.json().catch(() => ({}));
	return { response, body };
};

const main = async () => {
	const authRes = await fetch(`${BASE}/pb/api/collections/users/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: email, password })
	});
	const authBody = await authRes.json();
	if (!authRes.ok) {
		throw new Error(`Auth failed ${authRes.status}: ${JSON.stringify(authBody)}`);
	}
	const token = authBody.token;
	console.log('Authenticated as', authBody.record?.id);

	const checks = [
		['GET', '/api/admin/me', null, (b) => b.isAdmin === true],
		['GET', '/api/admin/settings/ai', null, (b) => typeof b.configured === 'boolean'],
		['GET', '/api/admin/usage/summary?days=30', null, (b) => typeof b.requestCount === 'number'],
		['GET', '/api/admin/usage/by-user?days=30', null, (b) => Array.isArray(b.users)],
		['GET', '/api/admin/users?page=1', null, (b) => Array.isArray(b.items)]
	];

	let failed = 0;
	for (const [method, path, body, assert] of checks) {
		const { response, body: resBody } = await authJson(path, token, {
			method,
			...(body ? { body: JSON.stringify(body) } : {})
		});
		const ok = response.ok && assert(resBody);
		console.log(ok ? 'PASS' : 'FAIL', response.status, method, path);
		if (!ok) {
			failed += 1;
			console.log(' ', JSON.stringify(resBody).slice(0, 300));
		}
	}

	const webAdmin = await fetch(`${BASE}/admin`);
	console.log(webAdmin.ok ? 'PASS' : 'FAIL', webAdmin.status, 'GET /admin (SPA)');

	if (failed > 0) process.exit(1);
	console.log('All admin API checks passed.');
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
