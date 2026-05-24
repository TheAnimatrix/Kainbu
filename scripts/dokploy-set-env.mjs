#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const composeId = process.argv[2] || 'evWgekC2HifgtmImPvuxh';
const envFile = process.argv[3] || 'deploy/dokploy.env.example';

const configPath = path.join(
	process.env.USERPROFILE || process.env.HOME,
	'AppData/Local/Volta/tools/image/packages/@dokploy/cli/node_modules/@dokploy/cli/config.json'
);
const { url, token } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const env = fs
	.readFileSync(envFile, 'utf8')
	.split('\n')
	.filter((line) => line.trim() && !line.trim().startsWith('#'))
	.join('\n');

const response = await fetch(`${url}/api/trpc/compose.update`, {
	method: 'POST',
	headers: {
		'x-api-key': token,
		'content-type': 'application/json'
	},
	body: JSON.stringify({ json: { composeId, env } })
});

const body = await response.text();
if (!response.ok) {
	console.error('compose.update failed', response.status, body);
	process.exit(1);
}

const parsed = JSON.parse(body);
const saved = parsed?.result?.data?.json ?? parsed;
console.log('env length:', saved?.env?.length ?? '(see response)');
console.log(JSON.stringify(saved, null, 2));
