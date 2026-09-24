import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { materializeWorkspace, cleanupMaterializedWorkspace } from '../server/workspace-ai/sync';
import { getAvatarUrlFromClient } from '../src/lib/kainbu/avatarUrl';
import { beforeAll, describe, expect, it } from 'vitest';
import PocketBase, { type RecordModel } from 'pocketbase';
import { retainDeletedTasks, syncBoardWithPb } from '../src/lib/kainbu/boardSyncCore';
import { generateApiToken } from '../server/apiKeys';
import type { Project } from '../src/lib/kainbu/types';
import app from '../server/app';

describe.runIf(process.env.KAINBU_PB_INTEGRATION === '1')(
	'PocketBase security and integrity',
	() => {
		const base = process.env.KAINBU_TEST_PB!;
		const admin = new PocketBase(base);
		const password = 'IntegrationOnlyPassword123!';
		let owner: PocketBase;
		let member: PocketBase;
		let outsider: PocketBase;
		let project: RecordModel;
		let board: RecordModel;
		let settings: RecordModel;
		const createUser = async (email: string, verified = false) => {
			const user = new PocketBase(base);
			await admin
				.collection('users')
				.create({ email, password, passwordConfirm: password, verified });
			await user.collection('users').authWithPassword(email, password);
			return user;
		};
		const request = async (path: string, client?: PocketBase, method = 'GET', body?: unknown) =>
			app.request(path, {
				method,
				headers: {
					'Content-Type': 'application/json',
					...(client ? { Authorization: `Bearer ${client.authStore.token}` } : {})
				},
				...(body ? { body: JSON.stringify(body) } : {})
			});
		beforeAll(async () => {
			await admin
				.collection('_superusers')
				.authWithPassword(
					process.env.POCKETBASE_ADMIN_EMAIL!,
					process.env.POCKETBASE_ADMIN_PASSWORD!
				);
			owner = await createUser('owner@kainbu.test');
			member = await createUser('member@kainbu.test');
			outsider = await createUser('outsider@kainbu.test');
			project = await owner.collection('projects').create({
				client_id: 'test-project',
				owner: owner.authStore.record!.id,
				name: 'Test project'
			});
			await admin
				.collection('project_memberships')
				.create({ project: project.id, user: owner.authStore.record!.id, role: 'owner' });
			await admin
				.collection('project_memberships')
				.create({ project: project.id, user: member.authStore.record!.id, role: 'member' });
			board = await owner
				.collection('project_boards')
				.create({ project: project.id, client_id: 'test-board', name: 'Test board' });
			settings = await admin.collection('app_settings').create({
				singleton: 'main',
				signups_enabled: true,
				mail_provider: 'off',
				openrouter_api_key: 'synthetic-test-secret'
			});
		});
		it('preserves data when applying repairs to an existing database', async () => {
			if (!process.env.KAINBU_TEST_UPGRADE) return;
			expect(
				(await admin.collection('project_tasks').getFirstListItem('client_id = "upgrade-task"'))
					.title
			).toBe('Preserved task');
		});
		it('does not expose global settings to ordinary users', async () => {
			await expect(member.collection('app_settings').getOne(settings.id)).rejects.toMatchObject({
				status: 403
			});
			await expect(
				member.collection('app_settings').update(settings.id, { openrouter_api_key: 'changed' })
			).rejects.toMatchObject({ status: 403 });
		});
		it('rejects self-enrollment and ownership or sharing changes by members', async () => {
			await expect(
				outsider
					.collection('project_memberships')
					.create({ project: project.id, user: outsider.authStore.record!.id, role: 'member' })
			).rejects.toMatchObject({ status: 403 });
			await expect(
				member.collection('projects').update(project.id, { owner: member.authStore.record!.id })
			).rejects.toMatchObject({ status: 404 });
			await expect(
				member.collection('project_boards').update(board.id, { share_public: true })
			).rejects.toMatchObject({ status: 404 });
			await expect(
				owner.collection('project_boards').update(board.id, { share_public: true })
			).resolves.toMatchObject({ share_public: true });
		});
		it('persists repaired fields and prevents self-promotion', async () => {
			await expect(
				owner.collection('users').update(owner.authStore.record!.id, { color_mode: 'dark' })
			).resolves.toMatchObject({ color_mode: 'dark' });
			await expect(
				owner
					.collection('project_boards')
					.update(board.id, { preferences: { defaultShowCheckbox: true } })
			).resolves.toMatchObject({ preferences: { defaultShowCheckbox: true } });
			await expect(
				member.collection('users').update(member.authStore.record!.id, { is_admin: true })
			).rejects.toMatchObject({ status: 404 });
		});
		it('requires email verification for allowlisted administrators', async () => {
			const candidate = await createUser('allowlisted@kainbu.test');
			expect((await request('/api/admin/users', candidate)).status).toBe(403);
			await admin.collection('users').update(candidate.authStore.record!.id, { verified: true });
			expect((await request('/api/admin/users', candidate)).status).toBe(200);
		});
		it('enforces disabled signups in Hono and PocketBase', async () => {
			await admin.collection('app_settings').update(settings.id, { signups_enabled: false });
			try {
				expect(
					(
						await request('/api/auth/signup', undefined, 'POST', {
							email: 'denied-api@kainbu.test',
							password
						})
					).status
				).toBe(403);
				await expect(
					new PocketBase(base)
						.collection('users')
						.create({ email: 'denied-pb@kainbu.test', password, passwordConfirm: password })
				).rejects.toMatchObject({ status: 403 });
			} finally {
				await admin.collection('app_settings').update(settings.id, { signups_enabled: true });
			}
		});

		it('rejects disabled users through old JWTs, API tokens, and direct writes', async () => {
			const disabled = await createUser('disabled@kainbu.test');
			const token = generateApiToken();
			await admin.collection('user_api_tokens').create({
				user: disabled.authStore.record!.id,
				name: 'test',
				token_hash: token.hash,
				prefix: token.prefix
			});
			await admin.collection('users').update(disabled.authStore.record!.id, { disabled: true });
			expect((await request('/api/workspace/snapshot', disabled)).status).toBe(401);
			expect(
				(
					await app.request('/api/workspace/snapshot', {
						headers: { Authorization: 'Bearer ' + token.raw }
					})
				).status
			).toBe(401);
			await expect(disabled.collection('users').authRefresh()).rejects.toMatchObject({
				status: 403
			});
			await expect(
				disabled.collection('users').update(disabled.authStore.record!.id, { disabled: false })
			).rejects.toBeDefined();
			await expect(
				disabled.collection('projects').create({
					client_id: 'disabled-project',
					name: 'No',
					owner: disabled.authStore.record!.id
				})
			).rejects.toBeDefined();
		});
		const initialBoard = (id: string): Project['kanbanData'] => [
			{
				id: id + '-column',
				title: 'Todo',
				tasks: [
					{ id: id + '-task', title: 'Original', description: 'Original description', tags: [] }
				]
			}
		];
		const setupBoard = async (id: string) => {
			const record = await owner
				.collection('project_boards')
				.create({ project: project.id, client_id: id, name: id });
			const data = initialBoard(id);
			await syncBoardWithPb(owner, project.client_id, id, [], data);
			return { record, data };
		};
		it('merges independent edits and rejects conflicting edits atomically', async () => {
			const { data } = await setupBoard('concurrent');
			const title = structuredClone(data);
			title[0].tasks[0].title = 'New title';
			const description = structuredClone(data);
			description[0].tasks[0].description = 'New description';
			await Promise.all([
				syncBoardWithPb(owner, project.client_id, 'concurrent', data, title),
				syncBoardWithPb(member, project.client_id, 'concurrent', data, description)
			]);
			const task = await owner
				.collection('project_tasks')
				.getFirstListItem('client_id="concurrent-task"');
			expect(task).toMatchObject({ title: 'New title', description: 'New description' });
			await expect(
				syncBoardWithPb(owner, project.client_id, 'concurrent', data, title)
			).resolves.toBeUndefined();
			const conflict = structuredClone(data);
			conflict[0].title = 'Should roll back';
			conflict[0].tasks[0].title = 'Conflicting title';
			await expect(
				syncBoardWithPb(owner, project.client_id, 'concurrent', data, conflict)
			).rejects.toMatchObject({ status: 409 });
			expect(
				(
					await owner
						.collection('project_columns')
						.getFirstListItem('client_id="concurrent-column"')
				).title
			).toBe('Todo');
			expect(Date.parse(task.created)).toBeGreaterThan(0);
		});
		it('removes tasks on column deletion and child records on board deletion', async () => {
			const { record } = await setupBoard('delete');
			const column = await owner
				.collection('project_columns')
				.getFirstListItem('client_id="delete-column"');
			await owner.collection('project_columns').delete(column.id);
			expect(
				await owner.collection('project_tasks').getFullList({ filter: 'client_id="delete-task"' })
			).toHaveLength(0);
			await syncBoardWithPb(owner, project.client_id, 'delete', [], initialBoard('delete-again'));
			await owner.collection('project_boards').delete(record.id);
			expect(
				await owner
					.collection('project_tasks')
					.getFullList({ filter: 'client_id="delete-again-task"' })
			).toHaveLength(0);
			expect(
				await owner
					.collection('project_columns')
					.getFullList({ filter: 'client_id="delete-again-column"' })
			).toHaveLength(0);
		});
		it('protects task files, revokes access after leaving, and deletes attachments with tasks', async () => {
			const { record } = await setupBoard('asset');
			const form = new FormData();
			form.set('project', project.id);
			form.set('task_client_id', 'asset-task');
			form.set('uploaded_by', owner.authStore.record!.id);
			form.set('kind', 'attachment');
			form.set('name', 'private.txt');
			form.set('mime_type', 'text/plain');
			form.set('file', new Blob(['private document'], { type: 'text/plain' }), 'private.txt');
			const asset = await owner.collection('project_task_assets').create(form);
			expect((await fetch(owner.files.getURL(asset, asset.file))).status).toBe(404);
			const fileToken = await owner.files.getToken();
			expect(
				(await fetch(owner.files.getURL(asset, asset.file, { token: fileToken }))).status
			).toBe(200);
			const outsiderToken = await outsider.files.getToken();
			expect(
				(await fetch(outsider.files.getURL(asset, asset.file, { token: outsiderToken }))).status
			).toBe(404);
			await owner.collection('project_boards').delete(record.id);
			expect(
				await admin
					.collection('project_task_assets')
					.getFullList({ filter: 'task_client_id="asset-task"' })
			).toHaveLength(0);
		});
		it('accepts only one simultaneous scratchpad revision', async () => {
			const before = await owner.collection('projects').getOne(project.id);
			const result = await Promise.all(
				['first', 'second'].map((content) =>
					request('/api/workspace/projects/scratchpad', owner, 'POST', {
						projectId: project.client_id,
						scratchpadData: content,
						expectedRevision: before.scratchpad_rev
					}).then(async (r) => {
						expect(r.status).toBe(200);
						return r.json();
					})
				)
			);
			expect(result.filter((r) => r.ok)).toHaveLength(1);
			expect((await owner.collection('projects').getOne(project.id)).scratchpad_rev).toBe(
				before.scratchpad_rev + 1
			);
		});
		it('retains conflicting page drafts instead of overwriting remote content', async () => {
			await owner.collection('project_pages').create({
				project: project.id,
				client_id: 'page-conflict',
				name: 'Page',
				content: 'Original'
			});
			const body = {
				projectId: project.client_id,
				pageId: 'page-conflict',
				previousContent: 'Original',
				content: 'First edit'
			};
			await owner.send('/api/kainbu/page', { method: 'POST', body });
			await expect(
				member.send('/api/kainbu/page', {
					method: 'POST',
					body: { ...body, content: 'Second edit' }
				})
			).rejects.toMatchObject({ status: 409 });
		});
		it('accepts invitations idempotently without allowing removed members to rejoin', async () => {
			const invited = await createUser('invited@kainbu.test');
			const invite = await admin.collection('project_invites').create({
				project: project.id,
				invitee: invited.authStore.record!.id,
				invitee_email: 'invited@kainbu.test',
				invited_by: owner.authStore.record!.id,
				status: 'pending'
			});
			const response = () =>
				request('/api/workspace/invites/respond', invited, 'POST', {
					inviteId: invite.id,
					accept: true
				});
			expect((await response()).status).toBe(200);
			expect((await response()).status).toBe(200);
			const memberships = await admin.collection('project_memberships').getFullList({
				filter: admin.filter('project={:project} && user={:user}', {
					project: project.id,
					user: invited.authStore.record!.id
				})
			});
			expect(memberships).toHaveLength(1);
			await admin
				.collection('project_memberships')
				.update(memberships[0].id, { left_at: new Date().toISOString() });
			expect((await response()).status).toBe(200);
			expect(
				await admin.collection('project_memberships').getFullList({
					filter: admin.filter('user={:user} && left_at=""', { user: invited.authStore.record!.id })
				})
			).toHaveLength(0);
		});

		it('materializes untrusted page ids only inside the temporary workspace', async () => {
			await owner.collection('project_pages').create({
				project: project.id,
				client_id: 'safe-first',
				name: 'Active',
				content: 'Safe',
				position: -10
			});
			await owner.collection('project_pages').create({
				project: project.id,
				client_id: '../../outside-test',
				name: 'Untrusted id',
				content: 'Untrusted content',
				position: 10
			});
			const workspace = await materializeWorkspace(
				project.client_id,
				'Bearer ' + owner.authStore.token
			);
			try {
				const page = workspace.pages.find((page) => page.id === '../../outside-test')!;
				const relative = path.relative(workspace.tempDir, page.filePath);
				expect(relative.startsWith('..')).toBe(false);
				expect(path.isAbsolute(relative)).toBe(false);
				expect(await readFile(page.filePath, 'utf8')).toBe('Untrusted content');
			} finally {
				await cleanupMaterializedWorkspace(workspace);
			}
		});
		it('restores persisted chat undo data and its updated outcome through workspace snapshots', async () => {
			const change = {
				id: 'undo-change',
				proposalId: 'undo-proposal',
				projectId: project.client_id,
				sessionId: 'undo-session',
				messageId: 'undo-message',
				target: 'kanban',
				boardId: board.client_id,
				summary: 'Added release checklist',
				appliedAt: Date.now(),
				status: 'applied',
				beforeFingerprint: 'before',
				afterFingerprint: 'after',
				before: { kanbanData: [] },
				after: { kanbanData: [{ id: 'release-column', title: 'Release', tasks: [] }] }
			};
			const message = {
				id: 'undo-message',
				role: 'assistant',
				text: '',
				timestamp: Date.now(),
				appliedProposalChanges: [change]
			};
			const session = await owner.collection('project_ai_sessions').create({
				project: project.id,
				user: owner.authStore.record!.id,
				client_id: 'undo-session',
				title: 'Undo test',
				history: [message]
			});
			const readChange = async () => {
				const response = await request('/api/workspace/snapshot', owner);
				expect(response.status).toBe(200);
				const snapshot = await response.json();
				return snapshot.projects
					.find((entry: Project) => entry.id === project.client_id)
					.aiSessions.find((entry: { id: string }) => entry.id === 'undo-session').history[0]
					.appliedProposalChanges[0];
			};
			expect(await readChange()).toEqual(change);
			await owner.collection('project_ai_sessions').update(session.id, {
				history: [{ ...message, appliedProposalChanges: [{ ...change, status: 'undone' }] }]
			});
			expect(await readChange()).toEqual({ ...change, status: 'undone' });
		});
		it('keeps private chat state private and protects page attachments', async () => {
			for (const collection of ['project_user_state', 'project_ai_sessions']) {
				const record = await owner.collection(collection).create({
					project: project.id,
					user: owner.authStore.record!.id,
					client_id: 'private-session',
					title: 'Private',
					history: []
				});
				await expect(member.collection(collection).getOne(record.id)).rejects.toMatchObject({
					status: 404
				});
				await expect(
					member.collection(collection).update(record.id, { title: 'Changed' })
				).rejects.toMatchObject({ status: 404 });
			}
			const asset = await owner.collection('page_assets').create({
				project: project.id,
				page_client_id: 'safe-first',
				uploaded_by: owner.authStore.record!.id,
				kind: 'attachment',
				name: 'private.txt',
				mime_type: 'text/plain',
				file: new File(['Private page attachment'], 'private.txt', { type: 'text/plain' })
			});
			expect((await fetch(owner.files.getURL(asset, asset.file))).status).toBe(404);
			expect(
				(
					await fetch(
						owner.files.getURL(asset, asset.file, { token: await owner.files.getToken() })
					)
				).status
			).toBe(200);
		});
		it('denies former members while keeping active members able to edit and invite them back', async () => {
			const former = await createUser('former@kainbu.test');
			const membership = await admin.collection('project_memberships').create({
				project: project.id,
				user: former.authStore.record!.id,
				role: 'member',
				left_at: new Date().toISOString()
			});
			await expect(former.collection('project_boards').getOne(board.id)).rejects.toMatchObject({
				status: 404
			});
			const snapshot = await (await request('/api/workspace/snapshot', former)).json();
			expect(snapshot.projects).toEqual([]);
			expect(
				(
					await request('/api/workspace/projects/touch', former, 'POST', {
						projectId: project.client_id
					})
				).status
			).toBe(404);
			await expect(
				materializeWorkspace(project.client_id, 'Bearer ' + former.authStore.token)
			).rejects.toThrow('do not have access');
			await expect(
				former.send('/api/kainbu/scratchpad', {
					method: 'POST',
					body: { projectId: project.client_id, scratchpadData: 'Denied', expectedRevision: 0 }
				})
			).rejects.toMatchObject({ status: 403 });
			await expect(
				owner
					.collection('project_pages')
					.create({ project: project.id, client_id: 'active-after-leave', name: 'Still editable' })
			).resolves.toHaveProperty('id');
			const invite = await admin.collection('project_invites').create({
				project: project.id,
				invitee: former.authStore.record!.id,
				invitee_email: 'former@kainbu.test',
				invited_by: owner.authStore.record!.id,
				status: 'pending'
			});
			expect(
				(
					await request('/api/workspace/invites/respond', former, 'POST', {
						inviteId: invite.id,
						accept: true
					})
				).status
			).toBe(200);
			expect((await admin.collection('project_memberships').getOne(membership.id)).left_at).toBe(
				''
			);
			await expect(former.collection('project_boards').getOne(board.id)).resolves.toHaveProperty(
				'id'
			);
		});
		it('soft-deletes individual tasks idempotently and clears children when removing their column', async () => {
			const { data } = await setupBoard('soft-delete');
			const withoutTask = [{ ...data[0], tasks: [] }];
			await syncBoardWithPb(owner, project.client_id, 'soft-delete', data, withoutTask);
			const removed = await owner
				.collection('project_tasks')
				.getFirstListItem('client_id="soft-delete-task"');
			expect(removed.deleted_at).toBeGreaterThan(0);
			await syncBoardWithPb(owner, project.client_id, 'soft-delete', data, withoutTask);
			expect((await owner.collection('project_tasks').getOne(removed.id)).deleted_at).toBe(
				removed.deleted_at
			);
			await syncBoardWithPb(owner, project.client_id, 'soft-delete', withoutTask, []);
			await expect(admin.collection('project_tasks').getOne(removed.id)).rejects.toMatchObject({
				status: 404
			});
		});
		it('preserves undo after a task deletion has synced without reviving tasks from stale edits', async () => {
			const { data } = await setupBoard('undo-delete');
			const deleted = retainDeletedTasks(data, [{ ...data[0], tasks: [] }]);
			await syncBoardWithPb(owner, project.client_id, 'undo-delete', data, deleted);
			await syncBoardWithPb(owner, project.client_id, 'undo-delete', data, deleted);
			const stale = structuredClone(data);
			stale[0].tasks[0].title = 'Stale edit';
			await expect(
				syncBoardWithPb(member, project.client_id, 'undo-delete', data, stale)
			).rejects.toMatchObject({ status: 409 });
			await syncBoardWithPb(owner, project.client_id, 'undo-delete', deleted, data);
			expect(
				(await owner.collection('project_tasks').getFirstListItem('client_id="undo-delete-task"'))
					.deleted_at
			).toBe(0);
			const tagged = structuredClone(data);
			tagged[0].tasks[0].tags = [{ id: 'tag', color: 'blue', label: 'Review' }];
			await syncBoardWithPb(owner, project.client_id, 'undo-delete', data, tagged);
			await syncBoardWithPb(owner, project.client_id, 'undo-delete', data, tagged);
			await syncBoardWithPb(owner, project.client_id, 'undo-delete', tagged, [
				{ ...tagged[0], tasks: [] }
			]);
		});
		it('builds usable avatar URLs from projected records and a public server origin', () => {
			const projected = { id: owner.authStore.record!.id, avatar: 'profile.png' };
			expect(getAvatarUrlFromClient(owner, projected)).toBe(
				base + '/api/files/users/' + projected.id + '/profile.png'
			);
			expect(getAvatarUrlFromClient(admin, projected, undefined, 'https://kainbu.example/pb')).toBe(
				'https://kainbu.example/pb/api/files/users/' + projected.id + '/profile.png'
			);
		});
		it('rolls back invitation status when membership validation fails, then permits retry', async () => {
			const invited = await createUser('invite-retry@kainbu.test');
			const invite = await admin.collection('project_invites').create({
				project: project.id,
				invitee: invited.authStore.record!.id,
				invitee_email: 'invite-retry@kainbu.test',
				invited_by: owner.authStore.record!.id,
				status: 'pending'
			});
			const collection = await admin.collections.getOne('project_memberships');
			const fields = structuredClone(collection.fields);
			await admin.collections.update(collection.id, {
				fields: fields.map((field) =>
					field.name === 'role' ? { ...field, values: ['owner'] } : field
				)
			});
			try {
				expect(
					(
						await request('/api/workspace/invites/respond', invited, 'POST', {
							inviteId: invite.id,
							accept: true
						})
					).status
				).toBeGreaterThanOrEqual(400);
				expect((await admin.collection('project_invites').getOne(invite.id)).status).toBe(
					'pending'
				);
			} finally {
				await admin.collections.update(collection.id, { fields });
			}
			expect(
				(
					await request('/api/workspace/invites/respond', invited, 'POST', {
						inviteId: invite.id,
						accept: true
					})
				).status
			).toBe(200);
		});
	}
);
