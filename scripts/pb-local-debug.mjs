#!/usr/bin/env node
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');
const email = `proj-${Date.now()}@test.com`;
const pw = 'testpass123456';

await pb.collection('users').create({ email, password: pw, passwordConfirm: pw });
const auth = await pb.collection('users').authWithPassword(email, pw);
console.log('auth valid', pb.authStore.isValid, auth.record.id);

const clientId = crypto.randomUUID();
let projectId = clientId;
try {
	const p = await pb.collection('projects').create({
		client_id: clientId,
		owner: auth.record.id,
		name: 'T'
	});
	projectId = p.client_id;
	console.log('project ok', p.id, 'client', p.client_id);
	await pb.collection('project_memberships').create({
		project: p.id,
		user: auth.record.id,
		role: 'owner'
	});
	console.log('membership ok');
} catch (e) {
	console.log('project fail', e.status, e.message, e.data);
}

const token = pb.authStore.token;
const touch = await fetch('http://127.0.0.1:8788/api/workspace/projects/touch', {
	method: 'POST',
	headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
	body: JSON.stringify({ projectId })
});
console.log('touch', touch.status, await touch.text());
