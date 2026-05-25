/**
 * Integration: restore multi-board project via createProject() against local PocketBase.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import PocketBase from 'pocketbase';
import { parseProjectsImport } from '../src/lib/kainbu/backup';
import { createProject, fetchWorkspace } from '../src/lib/kainbu/persistence';
import { setPocketBaseClient } from '../src/lib/kainbu/pocketbaseContext';
import { setWorkspaceApiConfig } from '../src/lib/kainbu/workspaceApi';

const PB = process.env.KAINBU_TEST_PB || 'http://127.0.0.1:8090';
const API = process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8788';
const BACKUP_PATH =
	process.env.KAINBU_TEST_BACKUP || 'k:/Downloads/kainbu-backup-2026-05-25.json';

class MockFile {
	constructor(private content: string) {}

	text() {
		return Promise.resolve(this.content);
	}
}

describe.runIf(process.env.KAINBU_TEST_PB || true)('backup restore integration', () => {
	const email = `restore-${Date.now()}@kainbu.test`;
	const password = 'testpass123456';
	let userId = '';

	beforeAll(async () => {
		const pbHealth = await fetch(`${PB}/api/health`);
		if (!pbHealth.ok) {
			throw new Error(`PocketBase not reachable at ${PB}`);
		}

		const pb = new PocketBase(PB);
		const record = await pb.collection('users').create({
			email,
			password,
			passwordConfirm: password
		});
		userId = record.id;
		await pb.collection('users').authWithPassword(email, password);
		setPocketBaseClient(pb);
		setWorkspaceApiConfig({
			getApiBaseUrl: () => API,
			getAccessToken: async () => pb.authStore.token
		});
	});

	it('creates every board from a multi-board backup project', async () => {
		const raw = readFileSync(BACKUP_PATH, 'utf8');
		const imported = await parseProjectsImport(new MockFile(raw) as unknown as File, userId);
		const calur = imported.find((project) => project.name === 'Calur');
		expect(calur).toBeTruthy();
		expect(calur!.boards.length).toBe(2);

		const created = await createProject(userId, calur!.name, calur, { skipWorkspaceFetch: true });
		expect(created.boards.length).toBe(2);

		const pb = new PocketBase(PB);
		await pb.collection('users').authWithPassword(email, password);
		const projectPb = await pb
			.collection('projects')
			.getFirstListItem(`client_id = "${created.id}"`);
		const boardRecords = await pb.collection('project_boards').getFullList({
			filter: `project = "${projectPb.id}"`
		});
		expect(boardRecords).toHaveLength(2);

		const workspace = await fetchWorkspace(userId, { fresh: true });
		const restored = workspace.projects.find((project) => project.id === created.id);
		expect(restored?.boards.length).toBe(2);
		expect(restored?.boards.map((board) => board.name).sort()).toEqual(['Board', 'Board 2']);
	});

	it(
		'restores every project from a full workspace backup',
		async () => {
			const raw = readFileSync(BACKUP_PATH, 'utf8');
			const imported = await parseProjectsImport(new MockFile(raw) as unknown as File, userId);
			expect(imported).toHaveLength(8);

			const createdIds: string[] = [];
			for (const project of imported) {
				const created = await createProject(userId, project.name, project, {
					skipWorkspaceFetch: true
				});
				createdIds.push(created.id);
				expect(created.boards.length).toBe(project.boards.length);
			}

			const workspace = await fetchWorkspace(userId, { fresh: true });
			for (let index = 0; index < createdIds.length; index += 1) {
				const restored = workspace.projects.find((project) => project.id === createdIds[index]);
				expect(restored?.boards.length).toBe(imported[index]?.boards.length);
			}
		},
		60_000
	);
});
