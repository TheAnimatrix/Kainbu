import type { Context } from 'hono';
import { createAdminPb, mapPocketBaseError } from './pocketbase.js';
import {
	APP_SETTINGS_SINGLETON,
	getAdminAllowlistEmails,
	getAdminMe,
	isEmailOnAdminAllowlist,
	isUserAppAdmin,
	maskApiKey,
	requireAppAdmin
} from './adminAuth.js';
import { invalidateOpenRouterKeyCache } from './openrouter-key.js';
import { getEnv } from './env.js';

const parseDays = (value: string | undefined, fallback = 30) => {
	const parsed = Number.parseInt(value || '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const adminError = (error: unknown) => {
	const mapped = mapPocketBaseError(error);
	if (mapped.message.includes('Missing collection context')) {
		return {
			status: 503,
			message:
				'Admin PocketBase collections are missing. Restart the pocketbase service so migrations can run.'
		};
	}
	return mapped;
};

const getSettingsRecord = async () => {
	const pb = await createAdminPb();
	const rows = await pb.collection('app_settings').getFullList({
		filter: `singleton = "${APP_SETTINGS_SINGLETON}"`
	});
	return rows[0] ?? null;
};

const upsertSettingsRecord = async (data: Record<string, unknown>) => {
	const pb = await createAdminPb();
	const existing = await getSettingsRecord();
	if (existing) {
		return pb.collection('app_settings').update(existing.id, data);
	}
	return pb.collection('app_settings').create({
		singleton: APP_SETTINGS_SINGLETON,
		...data
	});
};

export const handleAdminMe = async (c: Context) => {
	try {
		const payload = await getAdminMe(c.req.header('Authorization'));
		return c.json(payload);
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminGetAiSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const record = await getSettingsRecord();
		const stored =
			typeof record?.openrouter_api_key === 'string' ? record.openrouter_api_key.trim() : '';
		const envKey = getEnv('OPENROUTER_API_KEY', '');
		const effective = stored || envKey;
		return c.json({
			configured: Boolean(effective),
			source: stored ? 'database' : envKey ? 'environment' : 'none',
			keyHint: effective ? maskApiKey(effective) : ''
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminPutAiSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const body = (await c.req.json()) as { apiKey?: string };
		const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
		if (!apiKey) {
			return c.json({ error: 'apiKey is required' }, 400);
		}

		await upsertSettingsRecord({ openrouter_api_key: apiKey });
		invalidateOpenRouterKeyCache();

		return c.json({
			ok: true,
			configured: true,
			keyHint: maskApiKey(apiKey)
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminUsageSummary = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const days = parseDays(c.req.query('days'));
		const pb = await createAdminPb();
		const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
		const events = (await pb.collection('ai_usage_events').getFullList()).filter((event) => {
			const created = typeof event.created === 'string' ? Date.parse(event.created) : NaN;
			return Number.isFinite(created) && created >= sinceMs;
		});

		let promptTokens = 0;
		let completionTokens = 0;
		let cachedTokens = 0;
		let costUsd = 0;
		let costKnown = 0;

		for (const event of events) {
			promptTokens += Number(event.prompt_tokens) || 0;
			completionTokens += Number(event.completion_tokens) || 0;
			cachedTokens += Number(event.cached_tokens) || 0;
			if (event.cost_usd != null && Number.isFinite(Number(event.cost_usd))) {
				costUsd += Number(event.cost_usd);
				costKnown += 1;
			}
		}

		return c.json({
			days,
			requestCount: events.length,
			promptTokens,
			completionTokens,
			cachedTokens,
			costUsd: costKnown > 0 ? costUsd : null,
			costEventsWithValue: costKnown
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminUsageByUser = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const days = parseDays(c.req.query('days'));
		const pb = await createAdminPb();
		const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
		const events = (
			await pb.collection('ai_usage_events').getFullList({
				expand: 'user'
			})
		).filter((event) => {
			const created = typeof event.created === 'string' ? Date.parse(event.created) : NaN;
			return Number.isFinite(created) && created >= sinceMs;
		});

		const byUser = new Map<
			string,
			{
				userId: string;
				email: string;
				username: string;
				requestCount: number;
				promptTokens: number;
				completionTokens: number;
				cachedTokens: number;
				costUsd: number;
				costEventsWithValue: number;
				lastActivity: string;
			}
		>();

		for (const event of events) {
			const userId = String(event.user || '');
			if (!userId) continue;

			const expanded =
				event.expand && typeof event.expand === 'object'
					? (event.expand as Record<string, unknown>).user
					: null;
			const userRecord =
				expanded && typeof expanded === 'object' ? (expanded as Record<string, unknown>) : null;

			const entry =
				byUser.get(userId) ||
				({
					userId,
					email: typeof userRecord?.email === 'string' ? userRecord.email : '',
					username: typeof userRecord?.username === 'string' ? userRecord.username : '',
					requestCount: 0,
					promptTokens: 0,
					completionTokens: 0,
					cachedTokens: 0,
					costUsd: 0,
					costEventsWithValue: 0,
					lastActivity: ''
				} as const);

			const mutable = { ...entry };
			mutable.requestCount += 1;
			mutable.promptTokens += Number(event.prompt_tokens) || 0;
			mutable.completionTokens += Number(event.completion_tokens) || 0;
			mutable.cachedTokens += Number(event.cached_tokens) || 0;
			if (event.cost_usd != null && Number.isFinite(Number(event.cost_usd))) {
				mutable.costUsd += Number(event.cost_usd);
				mutable.costEventsWithValue += 1;
			}
			const created = typeof event.created === 'string' ? event.created : '';
			if (!mutable.lastActivity || created > mutable.lastActivity) {
				mutable.lastActivity = created;
			}
			byUser.set(userId, mutable);
		}

		const users = [...byUser.values()].sort(
			(left, right) => right.requestCount - left.requestCount || right.lastActivity.localeCompare(left.lastActivity)
		);

		return c.json({ days, users });
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminListUsers = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const pb = await createAdminPb();
		const page = Number.parseInt(c.req.query('page') || '1', 10);
		const perPage = Math.min(Number.parseInt(c.req.query('perPage') || '50', 10), 100);
		const result = await pb.collection('users').getList(page, perPage, {
			sort: '-created',
			fields: 'id,email,username,is_admin,disabled,created'
		});

		return c.json({
			page: result.page,
			perPage: result.perPage,
			totalItems: result.totalItems,
			totalPages: result.totalPages,
			items: result.items.map((user) => ({
				id: user.id,
				email: user.email,
				username: user.username,
				is_admin: isUserAppAdmin(user),
				is_admin_field: user.is_admin === true,
				disabled: user.disabled === true,
				created: user.created,
				on_allowlist: isEmailOnAdminAllowlist(
					typeof user.email === 'string' ? user.email : undefined
				)
			}))
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminPatchUser = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const userId = c.req.param('id');
		const body = (await c.req.json()) as { is_admin?: boolean; disabled?: boolean };
		const pb = await createAdminPb();
		const target = await pb.collection('users').getOne(userId);
		const email = typeof target.email === 'string' ? target.email : '';

		if (body.is_admin === false && isEmailOnAdminAllowlist(email)) {
			return c.json({ error: 'Cannot demote an email on KAINBU_ADMIN_EMAILS' }, 403);
		}

		const patch: Record<string, unknown> = {};
		if (typeof body.is_admin === 'boolean') patch.is_admin = body.is_admin;
		if (typeof body.disabled === 'boolean') patch.disabled = body.disabled;

		if (!Object.keys(patch).length) {
			return c.json({ error: 'No supported fields to update' }, 400);
		}

		const updated = await pb.collection('users').update(userId, patch);
		return c.json({
			ok: true,
			user: {
				id: updated.id,
				email: updated.email,
				username: updated.username,
				is_admin: isUserAppAdmin(updated),
				disabled: updated.disabled === true
			}
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export { getAdminAllowlistEmails, isEmailOnAdminAllowlist, maskApiKey };
