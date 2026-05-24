#!/usr/bin/env node
/**
 * Mirrors fetchWorkspace() PocketBase calls for debugging 400s.
 */
import PocketBase from 'pocketbase';

const base = process.argv[2] || 'https://kainbu.avarnic.com/pb';
const userId = process.argv[3];

const pb = new PocketBase(base);

const esc = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const run = async (label, fn) => {
	try {
		const result = await fn();
		const count = Array.isArray(result) ? result.length : 1;
		console.log('OK', label, 'count=', count);
		return result;
	} catch (error) {
		console.log('FAIL', label, error?.status, error?.message, error?.data);
		throw error;
	}
};

if (!userId) {
	const email = `ws-${Date.now()}@kainbu.test`;
	const password = 'testpass123456';
	await pb.collection('users').create({ email, password, passwordConfirm: password });
	await pb.collection('users').authWithPassword(email, password);
	console.log('Created test user', pb.authStore.record.id);
}

const uid = userId || pb.authStore.record.id;
if (!pb.authStore.isValid && userId) {
	console.error('Pass auth token or use fresh test user only');
	process.exit(1);
}

const ownMembershipRecords = await run('memberships', () =>
	pb.collection('project_memberships').getFullList({
		filter: `user = "${esc(uid)}"`,
		sort: '-last_opened_at',
		expand: 'project'
	})
);

const accessibleProjectIds = ownMembershipRecords.map((record) => {
	const expanded = record.expand?.project;
	return String(expanded?.client_id || record.project);
});

console.log('accessibleProjectIds', accessibleProjectIds);

if (!accessibleProjectIds.length) {
	await run('invites only', () =>
		pb.collection('project_invites').getFullList({
			filter: `invitee = "${esc(uid)}" && status = "pending"`,
			expand: 'project'
		})
	);
	process.exit(0);
}

const projectFilter = accessibleProjectIds.map((id) => `client_id = "${esc(id)}"`).join(' || ');
const nestedFilter = accessibleProjectIds
	.map((id) => `project.client_id = "${esc(id)}"`)
	.join(' || ');

await Promise.all([
	run('projects', () => pb.collection('projects').getFullList({ filter: projectFilter })),
	run('all memberships', () =>
		pb.collection('project_memberships').getFullList({ filter: nestedFilter })
	),
	run('boards', () => pb.collection('project_boards').getFullList({ filter: nestedFilter })),
	run('user_state', () =>
		pb.collection('project_user_state').getFullList({
			filter: `user = "${esc(uid)}" && (${nestedFilter})`,
			expand: 'project'
		})
	),
	run('ai_sessions', () =>
		pb.collection('project_ai_sessions').getFullList({
			filter: `user = "${esc(uid)}" && (${nestedFilter})`,
			sort: 'updated',
			expand: 'project'
		})
	),
	run('invites', () =>
		pb.collection('project_invites').getFullList({
			filter: `invitee = "${esc(uid)}" && status = "pending"`,
			expand: 'project'
		})
	)
]);
