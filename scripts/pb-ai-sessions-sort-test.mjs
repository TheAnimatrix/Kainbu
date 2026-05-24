#!/usr/bin/env node
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.argv[2] || 'https://kainbu.avarnic.com/pb');
const email = `sort-${Date.now()}@t.com`;
const pw = 'testpass123456';

await pb.collection('users').create({ email, password: pw, passwordConfirm: pw });
const auth = await pb.collection('users').authWithPassword(email, pw);
const uid = auth.record.id;
const cid = crypto.randomUUID();
const project = await pb.collection('projects').create({ client_id: cid, owner: uid, name: 'T' });
await pb.collection('project_memberships').create({ project: project.id, user: uid, role: 'owner' });

const filter = `user = "${uid}" && (project.client_id = "${cid}")`;

for (const [label, opts] of [
	['no sort', { filter }],
	['sort updated', { filter, sort: 'updated' }],
	['sort -updated', { filter, sort: '-updated' }],
	['sort last_message_at', { filter, sort: '-last_message_at' }],
	['expand only', { filter, expand: 'project' }],
	['sort updated + expand', { filter, sort: 'updated', expand: 'project' }]
]) {
	try {
		const rows = await pb.collection('project_ai_sessions').getFullList(opts);
		console.log('OK', label, rows.length);
	} catch (error) {
		console.log('FAIL', label, error.status, error.message);
	}
}
