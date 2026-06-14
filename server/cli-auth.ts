import { randomBytes, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { createAdminPb, resolveAuthenticatedUserId } from './pocketbase.js';
import { pbEscapeFilter } from './pbWorkspace.js';

const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_HINT_SEC = 3;

const normalizeDeviceId = (value: unknown) => {
	if (typeof value !== 'string' || !value.trim()) return '';
	const trimmed = value.trim();
	return /^[0-9a-f-]{36}$/i.test(trimmed) ? trimmed : '';
};

const normalizeUserCode = (value: unknown) => {
	if (typeof value !== 'string') return '';
	return value.trim().replace(/\s+/g, '').toUpperCase();
};

const formatUserCode = (raw: string) => {
	const compact = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
	if (compact.length <= 4) return compact;
	return `${compact.slice(0, 4)}-${compact.slice(4)}`;
};

const generateUserCode = () => {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let raw = '';
	for (let index = 0; index < 8; index += 1) {
		raw += alphabet[randomBytes(1)[0]! % alphabet.length];
	}
	return formatUserCode(raw);
};

const generateExchangeToken = () => randomBytes(32).toString('hex');

const getVerificationBaseUrl = () => {
	const configured =
		process.env.KAINBU_PUBLIC_URL ||
		process.env.VITE_PUBLIC_APP_URL ||
		process.env.PUBLIC_APP_URL ||
		'http://localhost:3000';
	return configured.replace(/\/+$/, '');
};

const expireStaleDevices = async (admin: Awaited<ReturnType<typeof createAdminPb>>) => {
	const now = new Date().toISOString();
	const stale = await admin.collection('cli_device_auth').getFullList({
		filter: `status = "pending" && expires_at < "${now}"`
	});
	await Promise.all(
		stale.map((record) =>
			admin.collection('cli_device_auth').update(record.id, { status: 'expired' })
		)
	);
};

export const handleCliDeviceStart = async (c: Context) => {
	const body = (await c.req.json().catch(() => ({}))) as { deviceId?: string };
	let deviceId = normalizeDeviceId(body.deviceId);
	if (!deviceId) {
		deviceId = randomUUID();
	}

	const admin = await createAdminPb();
	await expireStaleDevices(admin);

	const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS).toISOString();
	let userCode = generateUserCode();

	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			await admin.collection('cli_device_auth').create({
				device_id: deviceId,
				user_code: userCode,
				status: 'pending',
				expires_at: expiresAt
			});
			break;
		} catch {
			userCode = generateUserCode();
			if (attempt === 4) {
				return c.json({ error: 'Unable to start CLI login.' }, 500);
			}
		}
	}

	const verificationUrl = `${getVerificationBaseUrl()}/cli/authorize?code=${encodeURIComponent(userCode)}`;

	return c.json({
		deviceId,
		userCode,
		verificationUrl,
		expiresIn: Math.floor(DEVICE_CODE_TTL_MS / 1000),
		interval: POLL_INTERVAL_HINT_SEC
	});
};

export const handleCliDevicePoll = async (c: Context) => {
	const body = (await c.req.json().catch(() => ({}))) as { deviceId?: string };
	const deviceId = normalizeDeviceId(body.deviceId);
	if (!deviceId) {
		return c.json({ error: 'deviceId is required.' }, 400);
	}

	const admin = await createAdminPb();
	await expireStaleDevices(admin);

	let data;
	try {
		data = await admin
			.collection('cli_device_auth')
			.getFirstListItem(`device_id = "${pbEscapeFilter(deviceId)}"`);
	} catch {
		return c.json({ status: 'expired' });
	}

	if (data.status === 'pending' && new Date(String(data.expires_at)).getTime() < Date.now()) {
		await admin.collection('cli_device_auth').update(data.id, { status: 'expired' });
		return c.json({ status: 'expired' });
	}

	if (data.status === 'approved' && data.exchange_token) {
		return c.json({ status: 'approved', exchangeToken: data.exchange_token });
	}

	return c.json({ status: data.status === 'consumed' ? 'consumed' : 'pending' });
};

export const handleCliDeviceExchange = async (c: Context) => {
	const body = (await c.req.json().catch(() => ({}))) as { exchangeToken?: string };
	const exchangeToken =
		typeof body.exchangeToken === 'string' && body.exchangeToken.trim()
			? body.exchangeToken.trim()
			: '';

	if (!exchangeToken) {
		return c.json({ error: 'exchangeToken is required.' }, 400);
	}

	const admin = await createAdminPb();

	let data;
	try {
		data = await admin.collection('cli_device_auth').getFirstListItem(
			`exchange_token = "${pbEscapeFilter(exchangeToken)}" && status = "approved"`
		);
	} catch {
		return c.json({ error: 'Invalid or expired exchange token.' }, 401);
	}

	if (!data.auth_token || new Date(String(data.expires_at)).getTime() < Date.now()) {
		return c.json({ error: 'Invalid or expired exchange token.' }, 401);
	}

	const userId = typeof data.user === 'string' ? data.user : data.expand?.user?.id;
	const userRecord = userId ? await admin.collection('users').getOne(String(userId)) : null;

	await admin.collection('cli_device_auth').update(data.id, {
		status: 'consumed',
		exchange_token: ''
	});

	return c.json({
		accessToken: data.auth_token,
		refreshToken: data.auth_token,
		expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
		user: userRecord
	});
};

export const handleCliDeviceApprove = async (c: Context) => {
	const authorization = c.req.header('Authorization');
	const body = (await c.req.json().catch(() => ({}))) as { userCode?: string };
	const userCode = formatUserCode(normalizeUserCode(body.userCode));

	if (!userCode) {
		return c.json({ error: 'userCode is required.' }, 400);
	}

	let userId: string;
	try {
		userId = (await resolveAuthenticatedUserId(authorization)).userId;
	} catch {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
	if (!token) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const admin = await createAdminPb();
	await expireStaleDevices(admin);

	let data;
	try {
		data = await admin.collection('cli_device_auth').getFirstListItem(
			`user_code = "${pbEscapeFilter(userCode)}" && status = "pending"`
		);
	} catch {
		return c.json({ error: 'Invalid or expired code.' }, 404);
	}

	if (new Date(String(data.expires_at)).getTime() < Date.now()) {
		return c.json({ error: 'Invalid or expired code.' }, 404);
	}

	const exchangeToken = generateExchangeToken();
	await admin.collection('cli_device_auth').update(data.id, {
		status: 'approved',
		user: userId,
		exchange_token: exchangeToken,
		auth_token: token
	});

	return c.json({ ok: true });
};
