#!/usr/bin/env node
/**
 * Mirrors fetchWorkspace() + touch API against production (or local).
 */
import PocketBase from 'pocketbase';

const WEB = process.argv[2] || 'https://kainbu.avarnic.com';
const PB = process.argv[3] || `${WEB.replace(/\/$/, '')}/pb`;
const API = process.argv[4] || `${WEB.replace(/\/$/, '')}`;

const pb = new PocketBase(PB);
const esc = (v) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const email = `e2e-${Date.now()}@kainbu.test`;
const password = 'testpass123456';

const run = async (label, fn) => {
	try {
		const result = await fn();
		const count = Array.isArray(result) ? result.length : result;
		console.log('OK', label, typeof count === 'object' ? '' : `(${count})`);
		return result;
	} catch (error) {
		console.log('FAIL', label, error?.status, error?.message, JSON.stringify(error?.data)?.slice(0, 300));
		throw error;
	}
};

console.log('PB', PB);
console.log('API', API);

await run('signup', () =>
	pb.collection('users').create({ email, password, passwordConfirm: password })
);
const auth = await run('login', () => pb.collection('users').authWithPassword(email, password));
const userId = auth.record.id;
const token = auth.token;

const ownMembershipRecords = await run('memberships+expand', () =>
	pb.collection('project_memberships').getFullList({
		filter: `user = "${esc(userId)}"`,
		sort: '-last_opened_at',
		expand: 'project'
	})
);

const projectClientByPbId = new Map();
for (const record of ownMembershipRecords) {
	const expanded = record.expand?.project;
	if (expanded?.client_id) {
		projectClientByPbId.set(String(record.project), String(expanded.client_id));
	}
}

const projectClientId = crypto.randomUUID();
const project = await run('create project', () =>
	pb.collection('projects').create({
		client_id: projectClientId,
		owner: userId,
		name: 'E2E Workspace',
		scratchpad_data: '{}',
		scratchpad_rev: 0
	})
);
projectClientByPbId.set(String(project.id), String(project.client_id));

await run('create membership', () =>
	pb.collection('project_memberships').create({
		project: project.id,
		user: userId,
		role: 'owner'
	})
);

const board = await run('create board', () =>
	pb.collection('project_boards').create({
		project: project.id,
		client_id: crypto.randomUUID(),
		name: 'Main',
		position: 0
	})
);

await run('create column', () =>
	pb.collection('project_columns').create({
		project: project.id,
		client_id: 'todo',
		board: board.id,
		title: 'To Do',
		position: 0
	})
);

const accessibleProjectIds = [projectClientId];

const nestedFilter = accessibleProjectIds.map((id) => `project.client_id = "${esc(id)}"`).join(' || ');

await Promise.all([
	run('projects list', () =>
		pb.collection('projects').getFullList({
			filter: accessibleProjectIds.map((id) => `client_id = "${esc(id)}"`).join(' || ')
		})
	),
	run('memberships by project', () =>
		pb.collection('project_memberships').getFullList({ filter: nestedFilter })
	),
	run('boards by project', () =>
		pb.collection('project_boards').getFullList({ filter: nestedFilter, sort: 'position' })
	),
	run('pages by project', () =>
		pb.collection('project_pages').getFullList({ filter: nestedFilter, sort: 'position' })
	),
	run('columns by project', () =>
		pb.collection('project_columns').getFullList({ filter: nestedFilter, sort: 'position' })
	),
	run('tasks by project', () =>
		pb.collection('project_tasks').getFullList({ filter: nestedFilter, sort: 'position' })
	),
	run('user_state', () =>
		pb.collection('project_user_state').getFullList({
			filter: `user = "${esc(userId)}" && (${nestedFilter})`,
			expand: 'project'
		})
	),
	run('ai_sessions', () =>
		pb.collection('project_ai_sessions').getFullList({
			filter: `user = "${esc(userId)}" && (${nestedFilter})`,
			sort: '-last_message_at',
			expand: 'project'
		})
	),
	run('invites incoming', () =>
		pb.collection('project_invites').getFullList({
			filter: `invitee = "${esc(userId)}" && status = "pending"`,
			expand: 'project'
		})
	),
	run('users profiles', () =>
		pb.collection('users').getFullList({ filter: `id = "${esc(userId)}"` })
	)
]);

const touchRes = await fetch(`${API}/api/workspace/projects/touch`, {
	method: 'POST',
	headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
	body: JSON.stringify({ projectId: projectClientId })
});
const touchBody = await touchRes.json().catch(() => ({}));
console.log(touchRes.ok ? 'OK' : 'FAIL', 'workspace touch', touchRes.status, touchBody);

// Realtime subscribe (what the app does on load)
try {
	const unsub = await pb.collection('projects').subscribe('*', () => {});
	unsub();
	console.log('OK realtime subscribe projects');
} catch (error) {
	console.log('FAIL realtime', error?.message || error);
}

console.log('done', { email, userId, projectClientId });
