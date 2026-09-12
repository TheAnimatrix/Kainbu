#!/usr/bin/env node
import assert from 'node:assert/strict';
const argument = (process.argv[2] || 'https://kainbu.avarnic.com').replace(/\/$/, '');
const base = argument.endsWith('/pb') ? argument.slice(0, -3) : argument;
for (const endpoint of ['/pb/api/health', '/health', '/api/models']) {
	const response = await fetch(base + endpoint);
	assert.equal(response.status, 200, endpoint + ': HTTP ' + response.status);
	await response.json();
	console.log('OK', endpoint);
}
