#!/usr/bin/env node
const base = process.argv[2] || 'https://kainbu.avarnic.com/pb';
const email = `test-${Date.now()}@kainbu.test`;
const password = 'testpass123456';

const json = async (path, opts = {}) => {
	const res = await fetch(`${base}${path}`, opts);
	const body = await res.json().catch(() => ({}));
	return { status: res.status, body };
};

const auth = await json('/api/collections/users/auth-with-password', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ identity: email, password })
});
if (auth.status !== 200) {
	await json('/api/collections/users/records', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password, passwordConfirm: password })
	});
}
const login = await json('/api/collections/users/auth-with-password', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ identity: email, password })
});
const token = login.body?.token;
const userId = login.body?.record?.id;
console.log('login', login.status, userId);

const project = await json('/api/collections/projects/records', {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	body: JSON.stringify({ client_id: `proj-${Date.now()}`, owner: userId, name: 'Test Project' })
});
console.log('project', project.status, project.body?.id || project.body);

const membership = await json('/api/collections/project_memberships/records', {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	body: JSON.stringify({
		project: project.body?.id,
		user: userId,
		role: 'owner'
	})
});
console.log('membership', membership.status, membership.body?.message || membership.body);

const board = await json('/api/collections/project_boards/records', {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	body: JSON.stringify({
		project: project.body?.id,
		client_id: `board-${Date.now()}`,
		name: 'Main',
		position: 0
	})
});
console.log('board', board.status, board.body?.message || board.body?.id);
