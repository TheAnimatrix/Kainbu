#!/usr/bin/env node
import PocketBase from 'pocketbase';

const base = process.argv[2] || 'https://kainbu.avarnic.com/pb';
const pb = new PocketBase(base);

const email = `filter-test-${Date.now()}@kainbu.test`;
const password = 'testpass123456';

await pb.collection('users').create({ email, password, passwordConfirm: password });
await pb.collection('users').authWithPassword(email, password);
const userId = pb.authStore.record.id;

const project = await pb.collection('projects').create({
	client_id: `proj-${Date.now()}`,
	owner: userId,
	name: 'Filter test'
});
const clientId = project.client_id;

await pb.collection('project_memberships').create({
	project: project.id,
	user: userId,
	role: 'owner'
});

const tests = [
	['project_memberships user', () => pb.collection('project_memberships').getFullList({ filter: `user = "${userId}"`, expand: 'project' })],
	['project_boards project.client_id', () => pb.collection('project_boards').getFullList({ filter: `project.client_id = "${clientId}"` })],
	['project_user_state nested', () =>
		pb.collection('project_user_state').getFullList({
			filter: `user = "${userId}" && (project.client_id = "${clientId}")`,
			expand: 'project'
		})],
	['project_invites pending', () =>
		pb.collection('project_invites').getFullList({
			filter: `invitee = "${userId}" && status = "pending"`,
			expand: 'project'
		})],
	['users profiles', () => pb.collection('users').getFullList({ filter: `id = "${userId}"` })],
	['project_columns board.client_id', async () => {
		const board = await pb.collection('project_boards').create({
			project: project.id,
			client_id: crypto.randomUUID(),
			name: 'B2',
			position: 1
		});
		return pb.collection('project_columns').getFullList({
			filter: `project = "${project.id}" && board.client_id = "${board.client_id}"`
		});
	}]
];

for (const [name, run] of tests) {
	try {
		const rows = await run();
		console.log('OK', name, 'count=', rows.length);
	} catch (error) {
		console.log('FAIL', name, error?.status, error?.message, error?.data);
	}
}
