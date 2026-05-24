#!/usr/bin/env node
/** Simulates createProject() against PocketBase (no Hono API). */
import PocketBase from 'pocketbase';

const base = process.argv[2] || 'https://kainbu.avarnic.com/pb';
const pb = new PocketBase(base);

const email = `create-proj-${Date.now()}@kainbu.test`;
const password = 'testpass123456';

await pb.collection('users').create({ email, password, passwordConfirm: password });
await pb.collection('users').authWithPassword(email, password);
const userId = pb.authStore.record.id;
const projectClientId = crypto.randomUUID();
const boardClientId = crypto.randomUUID();

console.log('user', userId);

const projectRecord = await pb.collection('projects').create({
	client_id: projectClientId,
	owner: userId,
	name: 'Test Project',
	background_theme: null,
	scratchpad_data: '{}',
	scratchpad_rev: 0,
	last_opened_at: new Date().toISOString()
});
console.log('project', projectRecord.id);

try {
	await pb.collection('project_memberships').create({
		project: projectRecord.id,
		user: userId,
		role: 'owner',
		joined_at: new Date().toISOString(),
		last_opened_at: new Date().toISOString()
	});
	console.log('membership ok');
} catch (e) {
	console.log('membership skip', e.message);
}

const boardRecord = await pb.collection('project_boards').create({
	project: projectRecord.id,
	client_id: boardClientId,
	name: 'Board',
	position: 0
});
console.log('board', boardRecord.id);

// This is what applyBoardMutations does today (WRONG - client id as relation)
try {
	await pb.collection('project_columns').create({
		project: projectRecord.id,
		client_id: 'col-todo',
		board: boardClientId,
		title: 'To Do',
		color: null,
		width: 280,
		position: 0
	});
	console.log('column with client board id: UNEXPECTED OK');
} catch (e) {
	console.log('column with client board id FAIL', e.status, e.message, e.data);
}

try {
	await pb.collection('project_columns').create({
		project: projectRecord.id,
		client_id: 'col-todo2',
		board: boardRecord.id,
		title: 'To Do',
		color: null,
		width: 280,
		position: 0
	});
	console.log('column with pb board id: OK');
} catch (e) {
	console.log('column with pb board id FAIL', e.status, e.message, e.data);
}
