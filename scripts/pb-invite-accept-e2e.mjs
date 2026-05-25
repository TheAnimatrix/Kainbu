#!/usr/bin/env node
/**
 * E2E: owner invites member, member accepts via API.
 * Usage: node scripts/pb-invite-accept-e2e.mjs [WEB_URL]
 */
import PocketBase from 'pocketbase';

const WEB = process.argv[2] || 'http://127.0.0.1:3000';
const PB = `${WEB.replace(/\/$/, '')}/pb`;
const API = WEB.replace(/\/$/, '');

const ownerEmail = `owner-${Date.now()}@kainbu.test`;
const memberEmail = `member-${Date.now()}@kainbu.test`;
const password = 'testpass123456';

const pb = (token) => {
	const client = new PocketBase(PB);
	if (token) client.authStore.save(token, null);
	return client;
};

const api = async (path, token, body) => {
	const res = await fetch(`${API}${path}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
	}
	return json;
};

console.log('PB', PB);
console.log('API', API);

const ownerPb = pb();
await ownerPb.collection('users').create({
	email: ownerEmail,
	password,
	passwordConfirm: password
});
const ownerAuth = await ownerPb.collection('users').authWithPassword(ownerEmail, password);
const ownerId = ownerAuth.record.id;
const ownerToken = ownerAuth.token;

const memberPb = pb();
await memberPb.collection('users').create({
	email: memberEmail,
	password,
	passwordConfirm: password,
	username: `mem${Date.now().toString(36).slice(-6)}`
});
const memberAuth = await memberPb.collection('users').authWithPassword(memberEmail, password);
const memberId = memberAuth.record.id;
const memberToken = memberAuth.token;

const projectClientId = crypto.randomUUID();
const ownerClient = pb(ownerToken);
const project = await ownerClient.collection('projects').create({
	client_id: projectClientId,
	owner: ownerId,
	name: 'Invite E2E',
	scratchpad_data: '{}',
	scratchpad_rev: 0
});
await ownerClient.collection('project_memberships').create({
	project: project.id,
	user: ownerId,
	role: 'owner'
});

await api('/api/workspace/invites/create', ownerToken, {
	projectId: projectClientId,
	inviteeEmail: memberEmail
});

const memberClient = pb(memberToken);
const invites = await memberClient.collection('project_invites').getFullList({
	filter: `invitee = "${memberId}" && status = "pending"`,
	expand: 'project'
});
if (!invites.length) throw new Error('No pending invite found for member');
const inviteId = invites[0].id;
console.log('invite', inviteId, 'project', invites[0].expand?.project?.client_id);

await api('/api/workspace/invites/respond', memberToken, { inviteId, accept: true });
console.log('OK accept invite');

const memberships = await memberClient.collection('project_memberships').getFullList({
	filter: `user = "${memberId}"`,
	expand: 'project'
});
const joined = memberships.some(
	(m) => m.expand?.project?.client_id === projectClientId || m.project === project.id
);
if (!joined) throw new Error('Member was not added to project_memberships');
console.log('OK membership created');

const guestEmail = `guest-${Date.now()}@kainbu.test`;
await api('/api/workspace/invites/create', ownerToken, {
	projectId: projectClientId,
	inviteeEmail: guestEmail
});
console.log('OK email-only invite created');

const guestPb = pb();
const signupRes = await fetch(`${API}/api/auth/signup`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email: guestEmail, password })
});
if (signupRes.ok) {
	console.log('OK guest signup via API');
} else {
	await guestPb.collection('users').create({
		email: guestEmail,
		password,
		passwordConfirm: password,
		username: `gst${Date.now().toString(36).slice(-6)}`
	});
	console.log('OK guest signup via PB (API signup unavailable)');
}
const guestAuth = await guestPb.collection('users').authWithPassword(guestEmail, password);
const guestId = guestAuth.record.id;
const guestToken = guestAuth.token;
const guestClient = pb(guestToken);

const guestInvites = await guestClient.collection('project_invites').getFullList({
	filter: `(invitee = "${guestId}" || invitee_email = "${guestEmail}") && status = "pending"`,
	expand: 'project'
});
if (!guestInvites.length) throw new Error('No pending email-only invite for guest');
const guestInviteId = guestInvites[0].id;
await api('/api/workspace/invites/respond', guestToken, { inviteId: guestInviteId, accept: true });
console.log('OK email-only invite accepted after signup');

const guestMemberships = await guestClient.collection('project_memberships').getFullList({
	filter: `user = "${guestId}"`,
	expand: 'project'
});
const guestJoined = guestMemberships.some(
	(m) => m.expand?.project?.client_id === projectClientId || m.project === project.id
);
if (!guestJoined) throw new Error('Guest was not added to project_memberships after email-only invite');
console.log('OK guest membership created');

console.log('done');
