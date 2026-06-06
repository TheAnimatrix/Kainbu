/**
 * Share API checks for the local Docker stack.
 *
 * Run: npx vitest run tests/shareApi.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import PocketBase from 'pocketbase';
import { createShareSlug } from '../src/lib/kainbu/shareSlug';

const API = process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8789';
const PB = process.env.KAINBU_TEST_PB || 'http://127.0.0.1:8090';

const ownerEmail = `share-owner-${Date.now()}@kainbu.test`;
const memberEmail = `share-member-${Date.now()}@kainbu.test`;
const outsiderEmail = `share-outsider-${Date.now()}@kainbu.test`;
const password = 'testpass123456';

let ownerToken = '';
let memberToken = '';
let outsiderToken = '';
let ownerId = '';
let projectClientId = '';
let boardClientId = '';
let privateSlug = '';
let publicSlug = '';

const pb = () => new PocketBase(PB);

const apiHealthOk = async () => {
	try {
		const health = await fetch(`${API}/health`);
		return health.status === 200;
	} catch {
		return false;
	}
};

describe.skipIf(!(await apiHealthOk()))('Share API', () => {
	beforeAll(async () => {
		const createUser = async (email: string) => {
			const client = pb();
			const record = await client.collection('users').create({
				email,
				password,
				passwordConfirm: password
			});
			const auth = await client.collection('users').authWithPassword(email, password);
			return { id: record.id, token: auth.token };
		};

		const owner = await createUser(ownerEmail);
		ownerId = owner.id;
		ownerToken = owner.token;

		const member = await createUser(memberEmail);
		memberToken = member.token;

		const outsider = await createUser(outsiderEmail);
		outsiderToken = outsider.token;

		const client = pb();
		await client.collection('users').authWithPassword(ownerEmail, password);
		projectClientId = crypto.randomUUID();
		boardClientId = crypto.randomUUID();

		const project = await client.collection('projects').create({
			client_id: projectClientId,
			owner: ownerId,
			name: 'Share API Project',
			scratchpad_data: '{}',
			scratchpad_rev: 0
		});

		await client.collection('project_memberships').create({
			project: project.id,
			user: ownerId,
			role: 'owner'
		});

		await client.collection('project_memberships').create({
			project: project.id,
			user: member.id,
			role: 'member'
		});

		const board = await client.collection('project_boards').create({
			project: project.id,
			client_id: boardClientId,
			name: 'Shared Board',
			position: 0,
			share_slug: (privateSlug = createShareSlug()),
			share_public: false
		});

		await client.collection('project_columns').create({
			project: project.id,
			client_id: 'todo',
			board: board.id,
			title: 'To Do',
			position: 0
		});

		publicSlug = createShareSlug();
		await client.collection('project_boards').create({
			project: project.id,
			client_id: crypto.randomUUID(),
			name: 'Public Board',
			position: 1,
			share_slug: publicSlug,
			share_public: true
		});
	});

	it('returns 403 for anonymous access to a private share slug', async () => {
		const response = await fetch(`${API}/api/share/${privateSlug}`);
		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.requiresAuth).toBe(true);
	});

	it('returns read-only data for anonymous access to a public share slug', async () => {
		const response = await fetch(`${API}/api/share/${publicSlug}`);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.canEdit).toBe(false);
		expect(body.sharePublic).toBe(true);
		expect(body.boardName).toBe('Public Board');
	});

	it('allows members to access a private share slug with edit rights', async () => {
		const response = await fetch(`${API}/api/share/${privateSlug}`, {
			headers: { Authorization: `Bearer ${memberToken}` }
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.canEdit).toBe(true);
		expect(body.redirectTo).toContain(`project=${encodeURIComponent(projectClientId)}`);
	});

	it('blocks non-members from owner share settings updates', async () => {
		const response = await fetch(`${API}/api/workspace/boards/share`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${memberToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				projectId: projectClientId,
				boardId: boardClientId,
				sharePublic: true
			})
		});
		expect(response.status).toBe(403);
	});

	it('allows owners to update share settings', async () => {
		const response = await fetch(`${API}/api/workspace/boards/share`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${ownerToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				projectId: projectClientId,
				boardId: boardClientId,
				sharePublic: true
			})
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.sharePublic).toBe(true);
		expect(body.shareSlug).toBe(privateSlug);
		expect(body.shareUrl).toContain(`/b/${privateSlug}`);
	});

	it('keeps outsiders read-only on public shares', async () => {
		const response = await fetch(`${API}/api/share/${publicSlug}`, {
			headers: { Authorization: `Bearer ${outsiderToken}` }
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.canEdit).toBe(false);
	});
});
