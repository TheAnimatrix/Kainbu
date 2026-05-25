/**
 * End-to-end checks for the admin panel against the local Docker stack.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
 *   API is published on host port 8789 (avoids conflict with local `npm run dev:full` on 8788).
 *
 * Run:
 *   npm run test:admin-docker
 */
import { describe, it, expect, beforeAll } from 'vitest';
import PocketBase from 'pocketbase';

const WEB = process.env.KAINBU_TEST_WEB || 'http://127.0.0.1:3000';
const PB = process.env.KAINBU_TEST_PB || 'http://127.0.0.1:8090';
const API = process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8789';
const ADMIN_EMAIL = process.env.KAINBU_TEST_ADMIN_EMAIL || 'admin-e2e@kainbu.test';

const adminPassword = 'adminpass123456';
const memberPassword = 'memberpass123456';
const memberEmail = `member-${Date.now()}@kainbu.test`;

let adminToken = '';
let adminUserId = '';
let memberToken = '';
let memberUserId = '';

const pb = () => new PocketBase(PB);

const authJson = async (path: string, token: string, init: RequestInit = {}) => {
	const response = await fetch(`${API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...(init.headers || {})
		}
	});
	const body = await response.json().catch(() => ({}));
	return { response, body };
};

beforeAll(async () => {
	const health = await fetch(`${API}/health`);
	expect(health.status).toBe(200);

	const pbHealth = await fetch(`${PB}/api/health`);
	expect(pbHealth.status).toBe(200);

	const adminClient = pb();
	try {
		const adminRecord = await adminClient.collection('users').create({
			email: ADMIN_EMAIL,
			password: adminPassword,
			passwordConfirm: adminPassword
		});
		adminUserId = adminRecord.id;
	} catch {
		// User already exists from a prior test run.
	}
	const adminAuth = await adminClient.collection('users').authWithPassword(ADMIN_EMAIL, adminPassword);
	adminToken = adminAuth.token;
	adminUserId = adminAuth.record.id;

	const memberClient = pb();
	const memberRecord = await memberClient.collection('users').create({
		email: memberEmail,
		password: memberPassword,
		passwordConfirm: memberPassword
	});
	memberUserId = memberRecord.id;
	const memberAuth = await memberClient.collection('users').authWithPassword(memberEmail, memberPassword);
	memberToken = memberAuth.token;
});

describe('Local Docker — admin auth', () => {
	it('GET /api/admin/me returns isAdmin for allowlisted user', async () => {
		const { response, body } = await authJson('/api/admin/me', adminToken);
		expect(response.status).toBe(200);
		expect(body.isAdmin).toBe(true);
		expect(body.email).toBe(ADMIN_EMAIL);
	});

	it('syncs is_admin on admin user after admin API call', async () => {
		const { response } = await authJson('/api/admin/users', adminToken);
		expect(response.status).toBe(200);

		const adminClient = pb();
		await adminClient.collection('users').authWithPassword(ADMIN_EMAIL, adminPassword);
		const record = await adminClient.collection('users').getOne(adminUserId);
		expect(record.is_admin).toBe(true);
	});

	it('non-admin cannot access admin user list', async () => {
		const { response, body } = await authJson('/api/admin/users', memberToken);
		expect(response.status).toBe(403);
		expect(body.error).toBeTruthy();
	});

	it('non-admin me returns isAdmin false', async () => {
		const { response, body } = await authJson('/api/admin/me', memberToken);
		expect(response.status).toBe(200);
		expect(body.isAdmin).toBe(false);
	});
});

describe('Local Docker — admin concurrency', () => {
	it('parallel overview requests all return 200', async () => {
		const paths = [
			'/api/admin/usage/summary?days=30',
			'/api/admin/users?page=1',
			'/api/admin/settings/ai'
		];

		for (let round = 0; round < 5; round += 1) {
			const results = await Promise.all(
				paths.map((path) => authJson(path, adminToken))
			);
			for (const { response } of results) {
				expect(response.status).toBe(200);
			}
		}
	});
});

describe('Local Docker — admin AI settings', () => {
	it('PUT then GET masks stored API key', async () => {
		const put = await authJson('/api/admin/settings/ai', adminToken, {
			method: 'PUT',
			body: JSON.stringify({ apiKey: 'sk-or-test-key-12345678' })
		});
		expect(put.response.status).toBe(200);
		expect(put.body.configured).toBe(true);
		expect(put.body.keyHint).toBe('...5678');
		expect(JSON.stringify(put.body)).not.toContain('sk-or-test-key-12345678');

		const get = await authJson('/api/admin/settings/ai', adminToken);
		expect(get.response.status).toBe(200);
		expect(get.body.configured).toBe(true);
		expect(get.body.keyHint).toBe('...5678');
		expect(JSON.stringify(get.body)).not.toContain('sk-or-test-key-12345678');
	});
});

describe('Local Docker — admin users', () => {
	it('lists users and toggles member admin flag', async () => {
		const list = await authJson('/api/admin/users', adminToken);
		expect(list.response.status).toBe(200);
		expect(Array.isArray(list.body.items)).toBe(true);
		expect(list.body.items.some((row: { id: string }) => row.id === memberUserId)).toBe(true);

		const promote = await authJson(`/api/admin/users/${memberUserId}`, adminToken, {
			method: 'PATCH',
			body: JSON.stringify({ is_admin: true })
		});
		expect(promote.response.status).toBe(200);
		expect(promote.body.user.is_admin).toBe(true);

		const demote = await authJson(`/api/admin/users/${memberUserId}`, adminToken, {
			method: 'PATCH',
			body: JSON.stringify({ is_admin: false })
		});
		expect(demote.response.status).toBe(200);
		expect(demote.body.user.is_admin).toBe(false);
	});

	it('cannot demote allowlisted admin email', async () => {
		const patch = await authJson(`/api/admin/users/${adminUserId}`, adminToken, {
			method: 'PATCH',
			body: JSON.stringify({ is_admin: false })
		});
		expect(patch.response.status).toBe(403);
	});
});

describe('Local Docker — admin usage', () => {
	it('returns usage summary and by-user payloads', async () => {
		const summary = await authJson('/api/admin/usage/summary?days=30', adminToken);
		expect(summary.response.status).toBe(200);
		expect(typeof summary.body.requestCount).toBe('number');

		const byUser = await authJson('/api/admin/usage/by-user?days=30', adminToken);
		expect(byUser.response.status).toBe(200);
		expect(Array.isArray(byUser.body.users)).toBe(true);

		const byModel = await authJson('/api/admin/usage/by-model?days=30', adminToken);
		expect(byModel.response.status).toBe(200);
		expect(Array.isArray(byModel.body.models)).toBe(true);
	});
});

describe('Local Docker — admin model settings', () => {
	it('GET and PUT model catalog', async () => {
		const get = await authJson('/api/admin/settings/models', adminToken);
		expect(get.response.status).toBe(200);
		expect(get.body.catalog?.models?.length).toBeGreaterThan(0);

		const catalog = get.body.catalog;
		const marker = `e2e-model-${Date.now()}`;
		const putCatalog = {
			...catalog,
			models: [
				{
					...catalog.models[0],
					id: marker,
					openrouterModel: catalog.models[0].openrouterModel,
					enabled: true,
					thinkingLevels: ['none'],
					defaultThinkingLevel: 'none',
					position: 0
				}
			],
			defaultModelId: marker
		};
		const put = await authJson('/api/admin/settings/models', adminToken, {
			method: 'PUT',
			body: JSON.stringify({ catalog: putCatalog })
		});
		expect(put.response.status).toBe(200);
		expect(put.body.persisted).toBe(true);
		expect(put.body.catalog?.defaultModelId).toBe(marker);

		const reload = await authJson('/api/admin/settings/models', adminToken);
		expect(reload.response.status).toBe(200);
		expect(reload.body.persisted).toBe(true);
		expect(reload.body.catalog?.defaultModelId).toBe(marker);

		const models = await fetch(`${API}/api/models`).then((res) => res.json());
		expect(Array.isArray(models)).toBe(true);
		expect(models.length).toBeGreaterThan(0);
	});
});

describe('Local Docker — user list privacy', () => {
	it('non-admin only sees their own user record in PocketBase', async () => {
		const memberClient = pb();
		await memberClient.collection('users').authWithPassword(memberEmail, memberPassword);
		const users = await memberClient.collection('users').getFullList();
		expect(users.length).toBe(1);
		expect(users[0]?.id).toBe(memberUserId);
	});
});

describe('Local Docker — admin web routes', () => {
	it('serves /admin HTML via nginx', async () => {
		const response = await fetch(`${WEB}/admin`);
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html.toLowerCase()).toContain('html');
	});

	it('proxies /api/admin/me through nginx', async () => {
		const { response, body } = await authJson('/api/admin/me', adminToken);
		expect(response.status).toBe(200);
		expect(body.isAdmin).toBe(true);

		const viaWeb = await fetch(`${WEB}/api/admin/me`, {
			headers: { Authorization: `Bearer ${adminToken}` }
		});
		expect(viaWeb.status).toBe(200);
		const webBody = await viaWeb.json();
		expect(webBody.isAdmin).toBe(true);
	});
});

const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());

describe.skipIf(!hasOpenRouter)('Local Docker — admin usage with AI', () => {
	it('records ai_usage_events after workspace-ai call', async () => {
		const adminClient = pb();
		await adminClient.collection('users').authWithPassword(ADMIN_EMAIL, adminPassword);

		const projectClientId = crypto.randomUUID();
		const project = await adminClient.collection('projects').create({
			client_id: projectClientId,
			owner: adminUserId,
			name: 'Admin AI E2E',
			scratchpad_data: '{}',
			scratchpad_rev: 0
		});

		await adminClient.collection('project_memberships').create({
			project: project.id,
			user: adminUserId,
			role: 'owner'
		});

		const boardClientId = crypto.randomUUID();
		const board = await adminClient.collection('project_boards').create({
			project: project.id,
			client_id: boardClientId,
			name: 'Main',
			position: 0
		});

		await adminClient.collection('project_columns').create({
			project: project.id,
			client_id: 'todo',
			board: board.id,
			title: 'To Do',
			position: 0
		});

		await adminClient.collection('project_pages').create({
			project: project.id,
			client_id: crypto.randomUUID(),
			name: 'Notes',
			content: '# Notes',
			position: 0
		});

		const models = await fetch(`${API}/api/models`).then((res) => res.json());
		const modelId = models[0]?.id;
		expect(modelId).toBeTruthy();

		const aiResponse = await fetch(`${API}/api/workspace-ai`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${adminToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				projectId: projectClientId,
				sessionId: 'admin-docker-ai',
				modelId,
				history: [
					{
						id: 'message-1',
						role: 'user',
						text: 'Say hello in one short sentence.',
						timestamp: Date.now()
					}
				],
				scope: {
					currentTab: 'chat',
					activeBoardId: boardClientId,
					selectedTaskIds: [],
					selectedColumnIds: [],
					queuedTaskCards: [],
					revisions: { kanban: 0, scratchpad: 0 },
					workspaceSummary: {
						columnCount: 1,
						taskCount: 0,
						padCount: 1,
						memberCount: 1,
						kanbanFullAllowed: true,
						scratchpadAllAllowed: true
					}
				}
			})
		});
		expect(aiResponse.status).toBe(200);

		const byUser = await authJson('/api/admin/usage/by-user?days=1', adminToken);
		expect(byUser.response.status).toBe(200);
		const adminRow = byUser.body.users.find(
			(row: { userId: string }) => row.userId === adminUserId
		);
		expect(adminRow?.requestCount).toBeGreaterThan(0);
	});
});
