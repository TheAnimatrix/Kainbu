import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import PocketBase from 'pocketbase';

/** Disposable end-to-end users and projects; cleanup runs after failed assertions too. */
export const workspaceSmoke = async (web, inviteFlow = false) => {
	const base = web.replace(/\/$/, '');
	const clients = [];
	const api = async (client, route, body) => {
		const response = await fetch(`${base}/api/workspace/${route}`, {
			method: body ? 'POST' : 'GET',
			headers: {
				Authorization: `Bearer ${client.authStore.token}`,
				'Content-Type': 'application/json'
			},
			...(body ? { body: JSON.stringify(body) } : {})
		});
		const data = await response.json();
		assert.ok(
			response.ok,
			`${route}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`
		);
		return data;
	};
	const account = async (email = `smoke-${randomUUID()}@kainbu.test`) => {
		const client = new PocketBase(`${base}/pb`);
		const password = `Smoke-${randomUUID()}`;
		const record = await client
			.collection('users')
			.create({ email, password, passwordConfirm: password });
		await client.collection('users').authWithPassword(email, password);
		clients.push({ client, id: record.id });
		return client;
	};
	let owner, projectId;
	try {
		owner = await account();
		const created = await api(owner, 'projects/create', { name: 'Disposable workspace smoke' });
		projectId = created.project.id;
		const snapshot = await api(owner, 'snapshot');
		const project = snapshot.projects.find((entry) => entry.id === projectId);
		assert.ok(
			project?.boards.length && project?.pages.length,
			'Created workspace must have a board and page'
		);
		await api(owner, 'projects/touch', { projectId });
		for (const collection of [
			'project_boards',
			'project_pages',
			'project_columns',
			'project_tasks',
			'project_ai_sessions',
			'project_user_state'
		]) {
			await owner
				.collection(collection)
				.getFullList({
					filter: owner.filter('project.client_id={:id}', { id: projectId }),
					requestKey: null
				});
		}
		console.log('OK signup, login, project bootstrap, snapshot, child collections, touch');
		if (inviteFlow) {
			const member = await account();
			const guestEmail = `smoke-guest-${randomUUID()}@kainbu.test`;
			for (const entry of [
				{ email: member.authStore.record.email, client: member },
				{ email: guestEmail }
			]) {
				await api(owner, 'invites/create', { projectId, inviteeEmail: entry.email });
				const invitee = entry.client || (await account(entry.email));
				const invitations = await invitee.collection('project_invites').getFullList({
					filter: invitee.filter('invitee_email={:email} && status="pending"', {
						email: entry.email
					})
				});
				assert.equal(invitations.length, 1);
				await api(invitee, 'invites/respond', { inviteId: invitations[0].id, accept: true });
				assert.ok((await api(invitee, 'snapshot')).projects.some((item) => item.id === projectId));
			}
			console.log('OK existing-user and email-only invite acceptance');
		}
	} finally {
		let cleanupFailed = false;
		if (owner && projectId) {
			try {
				const record = await owner
					.collection('projects')
					.getFirstListItem(owner.filter('client_id={:id}', { id: projectId }));
				await owner.collection('projects').delete(record.id);
			} catch (error) {
				cleanupFailed = true;
				console.error('Project cleanup failed:', error.message);
			}
		}
		for (const { client, id } of clients.reverse()) {
			try {
				await client.collection('users').delete(id);
			} catch (error) {
				cleanupFailed = true;
				console.error(`Account cleanup failed (${id}):`, error.message);
			}
		}
		if (cleanupFailed) process.exitCode = 1;
	}
};
