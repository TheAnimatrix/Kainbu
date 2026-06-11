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
import {
	createProject,
	createProjectBoard,
	createProjectPage,
	deleteProjectBoard,
	deleteProjectPage,
	fetchWorkspace
} from '../src/lib/kainbu/persistence';
import { setPocketBaseClient } from '../src/lib/kainbu/pocketbaseContext';
import { setWorkspaceApiConfig } from '../src/lib/kainbu/workspaceApi';

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

describe('Local Docker — board/page delete', () => {
	let deleteProjectId = '';
	let boardToDeleteId = '';
	let boardToKeepId = '';
	let pageToDeleteId = '';
	let pageToKeepId = '';

	beforeAll(async () => {
		const client = pb();
		await client.collection('users').authWithPassword(email, password);
		setPocketBaseClient(client);
		setWorkspaceApiConfig({
			getApiBaseUrl: () => API,
			getAccessToken: async () => client.authStore.token
		});

		const project = await createProject(userId, 'Delete E2E', undefined, {
			skipWorkspaceFetch: true
		});
		deleteProjectId = project.id;

		const boardA = await createProjectBoard(deleteProjectId, 'tf', 1);
		const boardB = await createProjectBoard(deleteProjectId, 'tf2', 2);
		const pageA = await createProjectPage(deleteProjectId, 'notes-a', 1);
		const pageB = await createProjectPage(deleteProjectId, 'notes-b', 2);
		boardToDeleteId = boardA.id;
		boardToKeepId = boardB.id;
		pageToDeleteId = pageA.id;
		pageToKeepId = pageB.id;

		const workspace = await fetchWorkspace(userId, { fresh: true });
		const loaded = workspace.projects.find((entry) => entry.id === deleteProjectId);
		expect(loaded?.boards.map((board) => board.id)).toEqual(
			expect.arrayContaining([project.boards[0]?.id, boardToDeleteId, boardToKeepId])
		);
		expect(loaded?.pages.map((page) => page.id)).toEqual(
			expect.arrayContaining([project.pages[0]?.id, pageToDeleteId, pageToKeepId])
		);
	});

	it('deleteProjectBoard removes the board from a fresh workspace fetch', async () => {
		await deleteProjectBoard(deleteProjectId, boardToDeleteId);

		const workspace = await fetchWorkspace(userId, { fresh: true });
		const project = workspace.projects.find((entry) => entry.id === deleteProjectId);
		expect(project?.boards.some((board) => board.id === boardToDeleteId)).toBe(false);
		expect(project?.boards.some((board) => board.id === boardToKeepId)).toBe(true);
	});

	it('a second fresh fetch still omits the deleted board', async () => {
		const workspace = await fetchWorkspace(userId, { fresh: true });
		const project = workspace.projects.find((entry) => entry.id === deleteProjectId);
		expect(project?.boards.some((board) => board.id === boardToDeleteId)).toBe(false);
	});

	it('deleteProjectPage removes the page from a fresh workspace fetch', async () => {
		await deleteProjectPage(deleteProjectId, pageToDeleteId);

		const workspace = await fetchWorkspace(userId, { fresh: true });
		const project = workspace.projects.find((entry) => entry.id === deleteProjectId);
		expect(project?.pages.some((page) => page.id === pageToDeleteId)).toBe(false);
		expect(project?.pages.some((page) => page.id === pageToKeepId)).toBe(true);
	});

	it('a second fresh fetch still omits the deleted page', async () => {
		const workspace = await fetchWorkspace(userId, { fresh: true });
		const project = workspace.projects.find((entry) => entry.id === deleteProjectId);
		expect(project?.pages.some((page) => page.id === pageToDeleteId)).toBe(false);
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
