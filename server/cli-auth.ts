import { randomBytes, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { createAdminSupabaseClient, getAuthenticatedUserId } from './supabase.js';

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
		'https://kainbu.vercel.app';
	return configured.replace(/\/+$/, '');
};

const expireStaleDevices = async (admin: ReturnType<typeof createAdminSupabaseClient>) => {
	const now = new Date().toISOString();
	await admin
		.from('cli_device_auth')
		.update({ status: 'expired', updated_at: now })
		.eq('status', 'pending')
		.lt('expires_at', now);
};

export const handleCliDeviceStart = async (c: Context) => {
	const body = (await c.req.json().catch(() => ({}))) as { deviceId?: string };
	let deviceId = normalizeDeviceId(body.deviceId);
	if (!deviceId) {
		deviceId = randomUUID();
	}

	const admin = createAdminSupabaseClient();
	await expireStaleDevices(admin);

	const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS).toISOString();
	let userCode = generateUserCode();

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const { error } = await admin.from('cli_device_auth').insert({
			device_id: deviceId,
			user_code: userCode,
			status: 'pending',
			expires_at: expiresAt
		});

		if (!error) break;
		userCode = generateUserCode();
		if (attempt === 4) {
			return c.json({ error: 'Unable to start CLI login.' }, 500);
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

	const admin = createAdminSupabaseClient();
	await expireStaleDevices(admin);

	const { data, error } = await admin
		.from('cli_device_auth')
		.select('status,exchange_token,expires_at')
		.eq('device_id', deviceId)
		.maybeSingle();

	if (error) {
		return c.json({ error: 'Unable to poll CLI login.' }, 500);
	}

	if (!data) {
		return c.json({ status: 'expired' });
	}

	if (data.status === 'pending' && new Date(data.expires_at).getTime() < Date.now()) {
		await admin
			.from('cli_device_auth')
			.update({ status: 'expired', updated_at: new Date().toISOString() })
			.eq('device_id', deviceId);
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

	const admin = createAdminSupabaseClient();

	const { data, error } = await admin
		.from('cli_device_auth')
		.select('device_id,status,user_id,expires_at')
		.eq('exchange_token', exchangeToken)
		.eq('status', 'approved')
		.maybeSingle();

	if (error) {
		return c.json({ error: 'Unable to exchange CLI login.' }, 500);
	}

	if (!data?.user_id || new Date(data.expires_at).getTime() < Date.now()) {
		return c.json({ error: 'Invalid or expired exchange token.' }, 401);
	}

	const { data: userData, error: userError } = await admin.auth.admin.getUserById(data.user_id);
	const email = userData.user?.email;
	if (userError || !email) {
		return c.json({ error: 'Unable to load user for CLI session.' }, 500);
	}

	const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
		type: 'magiclink',
		email
	});

	if (linkError || !linkData?.properties?.hashed_token) {
		return c.json({ error: 'Unable to create CLI session.' }, 500);
	}

	const { data: sessionData, error: sessionError } = await admin.auth.verifyOtp({
		token_hash: linkData.properties.hashed_token,
		type: 'email'
	});

	if (sessionError || !sessionData.session) {
		return c.json({ error: 'Unable to finalize CLI session.' }, 500);
	}

	await admin
		.from('cli_device_auth')
		.update({
			status: 'consumed',
			exchange_token: null,
			updated_at: new Date().toISOString()
		})
		.eq('device_id', data.device_id);

	return c.json({
		accessToken: sessionData.session.access_token,
		refreshToken: sessionData.session.refresh_token,
		expiresAt: sessionData.session.expires_at,
		user: sessionData.user
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
		userId = await getAuthenticatedUserId(authorization);
	} catch {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const admin = createAdminSupabaseClient();
	await expireStaleDevices(admin);

	const { data, error } = await admin
		.from('cli_device_auth')
		.select('device_id,status,expires_at')
		.eq('user_code', userCode)
		.eq('status', 'pending')
		.maybeSingle();

	if (error) {
		return c.json({ error: 'Unable to approve CLI login.' }, 500);
	}

	if (!data || new Date(data.expires_at).getTime() < Date.now()) {
		return c.json({ error: 'Invalid or expired code.' }, 404);
	}

	const exchangeToken = generateExchangeToken();
	const { error: updateError } = await admin
		.from('cli_device_auth')
		.update({
			status: 'approved',
			user_id: userId,
			exchange_token: exchangeToken,
			updated_at: new Date().toISOString()
		})
		.eq('device_id', data.device_id)
		.eq('status', 'pending');

	if (updateError) {
		return c.json({ error: 'Unable to approve CLI login.' }, 500);
	}

	return c.json({ ok: true });
};
