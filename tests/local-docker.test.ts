/**
 * End-to-end checks for the local Docker stack.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
 *   API is published on host port 8789 (avoids conflict with local `npm run dev:full` on 8788).
 *
 * Run:
 *   npx vitest run tests/local-docker.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import PocketBase from 'pocketbase';

const WEB = process.env.KAINBU_TEST_WEB || 'http://127.0.0.1:3000';
const PB = process.env.KAINBU_TEST_PB || 'http://127.0.0.1:8090';
const API = process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8789';

const email = `e2e-${Date.now()}@kainbu.test`;
const password = 'testpass123456';
const username = `user${Date.now().toString(36).slice(-6)}`;

let token = '';
let userId = '';
let projectClientId = '';

const pb = () => new PocketBase(PB);

beforeAll(async () => {
	const health = await fetch(`${API}/health`);
	expect(health.status).toBe(200);

	const pbHealth = await fetch(`${PB}/api/health`);
	expect(pbHealth.status).toBe(200);
});

describe('Local Docker — auth & profile', () => {
	it('signs up without email verification', async () => {
		const client = pb();
		const record = await client.collection('users').create({
			email,
			password,
			passwordConfirm: password
		});
		expect(record.id).toBeTruthy();
		userId = record.id;

		const auth = await client.collection('users').authWithPassword(email, password);
		expect(auth.token).toBeTruthy();
		token = auth.token;
	});

	it('claims a username', async () => {
		const client = pb();
		await client.collection('users').authWithPassword(email, password);
		const updated = await client.collection('users').update(userId, { username });
		expect(updated.username).toBe(username);
	});

	it('loads profile via users collection', async () => {
		const client = pb();
		await client.collection('users').authWithPassword(email, password);
		const profile = await client.collection('users').getOne(userId);
		expect(profile.email).toBe(email);
		expect(profile.username).toBe(username);
	});
});

describe('Local Docker — workspace data', () => {
	it('creates a project with membership and board', async () => {
		const client = pb();
		await client.collection('users').authWithPassword(email, password);
		projectClientId = crypto.randomUUID();

		const project = await client.collection('projects').create({
			client_id: projectClientId,
			owner: userId,
			name: 'E2E Board',
			scratchpad_data: '{}',
			scratchpad_rev: 0
		});

		await client.collection('project_memberships').create({
			project: project.id,
			user: userId,
			role: 'owner'
		});

		const board = await client.collection('project_boards').create({
			project: project.id,
			client_id: crypto.randomUUID(),
			name: 'Main',
			position: 0
		});

		const column = await client.collection('project_columns').create({
			project: project.id,
			client_id: 'todo',
			board: board.id,
			title: 'To Do',
			position: 0
		});

		expect(column.id).toBeTruthy();
	});

	it('lists workspace collections for the user', async () => {
		const client = pb();
		await client.collection('users').authWithPassword(email, password);

		const memberships = await client.collection('project_memberships').getFullList({
			filter: `user = "${userId}"`,
			expand: 'project'
		});
		expect(memberships.length).toBeGreaterThan(0);

		const projects = await client.collection('projects').getFullList({
			filter: `client_id = "${projectClientId}"`
		});
		expect(projects.length).toBe(1);
	});
});

describe('Local Docker — workspace API', () => {
	it('POST /api/workspace/projects/touch accepts bearer token', async () => {
		const res = await fetch(`${API}/api/workspace/projects/touch`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ projectId: projectClientId })
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});

	it('proxies /api through nginx on the web port', async () => {
		const res = await fetch(`${WEB}/api/health`);
		expect(res.status).toBe(200);
	});

	it('proxies /pb through nginx on the web port', async () => {
		const res = await fetch(`${WEB}/pb/api/health`);
		expect(res.status).toBe(200);
	});
});
