import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PocketBase, { type RecordModel } from 'pocketbase';

const PB = process.env.KAINBU_TEST_PB || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.KAINBU_TEST_SUPERUSER_EMAIL || 'admin@kainbu.local';
const SUPERUSER_PASSWORD = process.env.KAINBU_TEST_SUPERUSER_PASSWORD || 'kainbu-admin-change-me';

const password = 'security-p0-pass123456';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let ownerId = '';
let ownerEmail = '';
let attackerId = '';
let ownerToken = '';
let attackerToken = '';
let attackerEmail = '';
let attackerRecord: RecordModel | null = null;
let projectId = '';
let adminProjectId = '';
let adminProjectClientId = '';
let membershipId = '';
let ownerMembershipId = '';
let rejoinInviteId = '';
let privateMembershipId = '';
let appSettingsId = '';

const pb = () => new PocketBase(PB);

const expectPocketBaseStatus = async (operation: Promise<unknown>, status: number) => {
	try {
		await operation;
		throw new Error(`Expected PocketBase request to fail with ${status}`);
	} catch (error) {
		expect((error as { status?: number }).status).toBe(status);
	}
};

beforeAll(async () => {
	const health = await fetch(`${PB}/api/health`);
	expect(health.status).toBe(200);

	const ownerClient = pb();
	ownerEmail = `security-owner-${runId}@kainbu.test`;
	const owner = await ownerClient.collection('users').create({
		email: ownerEmail,
		password,
		passwordConfirm: password
	});
	ownerId = owner.id;
	ownerToken = (await ownerClient.collection('users').authWithPassword(ownerEmail, password)).token;

	const attackerClient = pb();
	attackerEmail = `security-attacker-${runId}@kainbu.test`;
	const attacker = await attackerClient.collection('users').create({
		email: attackerEmail,
		password,
		passwordConfirm: password
	});
	attackerId = attacker.id;
	attackerRecord = attacker;
	attackerToken = (await attackerClient.collection('users').authWithPassword(attackerEmail, password)).token;

	const ownerAuthed = pb();
	ownerAuthed.authStore.save(ownerToken, owner);
	const project = await ownerAuthed.collection('projects').create({
		client_id: `security-p0-${runId}`,
		owner: ownerId,
		name: 'Security P0 private project'
	});
	projectId = project.id;

	const adminProject = await ownerAuthed.collection('projects').create({
		client_id: `security-p0-admin-${runId}`,
		owner: ownerId,
		name: 'Security P0 server-admin flow project'
	});
	adminProjectId = adminProject.id;
	adminProjectClientId = adminProject.client_id;

	const superuser = pb();
	await superuser.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
	const privateMembership = await superuser.collection('project_memberships').create({
		project: projectId,
		user: ownerId,
		role: 'owner'
	});
	privateMembershipId = privateMembership.id;
	const membership = await superuser.collection('project_memberships').create({
		project: adminProjectId,
		user: attackerId,
		role: 'member'
	});
	membershipId = membership.id;
	const ownerMembership = await superuser.collection('project_memberships').create({
		project: adminProjectId,
		user: ownerId,
		role: 'owner',
		left_at: ''
	});
	ownerMembershipId = ownerMembership.id;

	const settings = await superuser.collection('app_settings').create({
		singleton: `p0-${runId}`,
		openrouter_api_key: `security-marker-${runId}`
	});
	appSettingsId = settings.id;
});

afterAll(async () => {
	const superuser = pb();
	await superuser.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);

	for (const id of [membershipId, ownerMembershipId, privateMembershipId]) {
		if (id) await superuser.collection('project_memberships').delete(id);
	}
	if (rejoinInviteId) await superuser.collection('project_invites').delete(rejoinInviteId);
	if (appSettingsId) await superuser.collection('app_settings').delete(appSettingsId);
	for (const id of [adminProjectId, projectId]) {
		if (id) await superuser.collection('projects').delete(id);
	}
	for (const id of [attackerId, ownerId]) {
		if (id) await superuser.collection('users').delete(id);
	}
});

describe('PocketBase P0 authorization regressions', () => {
	it('allows server-admin project membership creation while blocking ordinary users', async () => {
		const attacker = pb();
		attacker.authStore.save(attackerToken, attackerRecord!);
		await expectPocketBaseStatus(
			attacker.collection('project_memberships').create({
				project: projectId,
				user: attackerId,
				role: 'member'
			}),
			403
		);

		const member = await attacker.collection('project_memberships').getOne(membershipId);
		expect(member.user).toBe(attackerId);
	});

	it('blocks ordinary users from mutating or deleting membership rows directly', async () => {
		const attacker = pb();
		attacker.authStore.save(attackerToken, attackerRecord!);

		for (const mutation of [
			{ role: 'owner' },
			{ project: projectId },
			{ user: ownerId },
			{ left_at: new Date().toISOString() }
		]) {
			await expectPocketBaseStatus(
				attacker.collection('project_memberships').update(membershipId, mutation),
				403
			);
		}
		await expectPocketBaseStatus(
			attacker.collection('project_memberships').delete(membershipId),
			403
		);

		const unchanged = await attacker.collection('project_memberships').getOne(membershipId);
		expect(unchanged.project).toBe(adminProjectId);
		expect(unchanged.user).toBe(attackerId);
		expect(unchanged.role).toBe('member');
		expect(unchanged.left_at).toBeFalsy();
	});

	it('does not let an ordinary user read another private project', async () => {
		const attacker = pb();
		attacker.authStore.save(attackerToken, attackerRecord!);

		await expectPocketBaseStatus(attacker.collection('projects').getOne(projectId), 404);
		await expectPocketBaseStatus(
			attacker.collection('project_memberships').getOne(privateMembershipId),
			404
		);
	});

	it('denies ordinary-user app_settings list, view, create, update, and delete', async () => {
		const attacker = pb();
		attacker.authStore.save(attackerToken, attackerRecord!);
		const expectedStatus = 403;

		await expectPocketBaseStatus(attacker.collection('app_settings').getList(1, 20), expectedStatus);
		await expectPocketBaseStatus(attacker.collection('app_settings').getOne(appSettingsId), expectedStatus);
		await expectPocketBaseStatus(
			attacker.collection('app_settings').create({
				singleton: `a-${runId}`,
				openrouter_api_key: `attacker-marker-${runId}`
			}),
			expectedStatus
		);
		await expectPocketBaseStatus(
			attacker.collection('app_settings').update(appSettingsId, {
				openrouter_api_key: `attacker-update-marker-${runId}`
			}),
			expectedStatus
		);
		await expectPocketBaseStatus(attacker.collection('app_settings').delete(appSettingsId), expectedStatus);
	});

	it('allows the superuser to manage app_settings', async () => {
		const superuser = pb();
		await superuser.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
		const record = await superuser.collection('app_settings').getOne(appSettingsId);
		expect(record.id).toBe(appSettingsId);
		await superuser.collection('app_settings').update(appSettingsId, {
			openrouter_api_key: `server-marker-${runId}`
		});
	});

	it('reactivates the existing membership on legitimate invite rejoin', async () => {
		const admin = pb();
		await admin.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
		await admin.collection('project_memberships').update(membershipId, { left_at: new Date().toISOString() });
		const rejoinInvite = await admin.collection('project_invites').create({
				project: adminProjectId,
				invitee: attackerId,
				invitee_email: attackerEmail,
				invited_by: ownerId,
				status: 'pending'
			});
		rejoinInviteId = rejoinInvite.id;
		const response = await fetch(`${process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8789'}/api/workspace/invites/respond`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${attackerToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ inviteId: rejoinInviteId, accept: true })
		});
		expect(response.status).toBe(200);

		const superuser = pb();
		await superuser.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
		const memberships = await superuser.collection('project_memberships').getFullList({
			filter: `project = "${adminProjectId}" && user = "${attackerId}"`
		});
		expect(memberships).toHaveLength(1);
		expect(memberships[0].id).toBe(membershipId);
		expect(memberships[0].left_at).toBeFalsy();

		await superuser.collection('project_memberships').update(membershipId, { left_at: new Date().toISOString() });
		const departed = pb();
		departed.authStore.save(attackerToken, attackerRecord!);
		await expectPocketBaseStatus(departed.collection('projects').getOne(adminProjectId), 404);
		await expectPocketBaseStatus(departed.collection('project_memberships').getOne(membershipId), 404);

		const ownerResponse = await fetch(`${process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8789'}/api/workspace/projects/touch`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${ownerToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ projectId: adminProjectClientId })
		});
		expect(ownerResponse.status).toBe(200);
	});
});
