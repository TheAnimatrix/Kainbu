#!/usr/bin/env node
/**
 * Merge keys into remote Dokploy compose env without replacing secrets.
 *
 * Usage:
 *   node scripts/dokploy-merge-env.mjs KAINBU_ADMIN_EMAILS=you@example.com
 *   node scripts/dokploy-merge-env.mjs --composeId evWgekC2HifgtmImPvuxh KEY=value
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultComposeId = 'evWgekC2HifgtmImPvuxh';

const args = process.argv.slice(2);
let composeId = defaultComposeId;
const pairs = [];

for (const arg of args) {
	if (arg.startsWith('--composeId')) {
		const next = args[args.indexOf(arg) + 1];
		if (arg.includes('=')) composeId = arg.split('=')[1];
		else if (next && !next.startsWith('--')) composeId = next;
		continue;
	}
	if (arg.startsWith('--composeId=')) {
		composeId = arg.slice('--composeId='.length);
		continue;
	}
	if (arg.includes('=')) pairs.push(arg);
}

if (!pairs.length) {
	console.error('Usage: node scripts/dokploy-merge-env.mjs KEY=value [KEY2=value2 ...]');
	process.exit(1);
}

const configCandidates = [
	path.join(process.env.USERPROFILE || process.env.HOME || '', 'AppData/Local/Volta/tools/image/packages/@dokploy/cli/node_modules/@dokploy/cli/config.json'),
	path.join(process.env.HOME || '', '.config/dokploy/config.json')
];

const configPath = configCandidates.find((candidate) => fs.existsSync(candidate));
if (!configPath) {
	console.error('Dokploy CLI config not found. Log in with: dokploy login');
	process.exit(1);
}

const { url, token } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const trpcQuery = async (procedure, json) => {
	const input = encodeURIComponent(JSON.stringify({ json }));
	const response = await fetch(`${url}/api/trpc/${procedure}?input=${input}`, {
		headers: { 'x-api-key': token }
	});
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`${procedure} failed ${response.status}: ${body}`);
	}
	const parsed = JSON.parse(body);
	return parsed?.result?.data?.json ?? parsed?.result?.data ?? parsed;
};

const trpcMutation = async (procedure, json) => {
	const response = await fetch(`${url}/api/trpc/${procedure}`, {
		method: 'POST',
		headers: {
			'x-api-key': token,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ json })
	});
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`${procedure} failed ${response.status}: ${body}`);
	}
	const parsed = JSON.parse(body);
	return parsed?.result?.data?.json ?? parsed?.result?.data ?? parsed;
};

const parseEnv = (raw) => {
	const map = new Map();
	for (const line of (raw || '').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf('=');
		if (idx === -1) continue;
		map.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
	}
	return map;
};

const serializeEnv = (map) =>
	[...map.entries()]
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');

const compose = await trpcQuery('compose.one', { composeId });
const envMap = parseEnv(compose.env || '');

for (const pair of pairs) {
	const idx = pair.indexOf('=');
	const key = pair.slice(0, idx);
	const value = pair.slice(idx + 1);
	if (!key) {
		console.error(`Invalid pair: ${pair}`);
		process.exit(1);
	}
	const had = envMap.has(key);
	envMap.set(key, value);
	console.log(`${had ? 'Updated' : 'Added'} ${key}`);
}

const nextEnv = serializeEnv(envMap);
const updated = await trpcMutation('compose.update', { composeId, env: nextEnv });

console.log('Remote env updated. Length:', updated?.env?.length ?? nextEnv.length);
console.log('Has KAINBU_ADMIN_EMAILS:', envMap.has('KAINBU_ADMIN_EMAILS'));
