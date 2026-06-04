import type { Context } from 'hono';
import { randomBytes } from 'crypto';
import type PocketBase from 'pocketbase';
import { createAdminPb, mapPocketBaseError } from './pocketbase.js';
import { linkPendingInvitesByEmail } from './workspace.js';
import {
	APP_SETTINGS_SINGLETON,
	getAdminAllowlistEmails,
	getAdminMe,
	isEmailOnAdminAllowlist,
	isUserAppAdmin,
	maskApiKey,
	requireAppAdmin
} from './adminAuth.js';
import {
	AiModelCatalogPersistenceError,
	getAiModelCatalogSource,
	loadAiModelCatalog,
	saveAiModelCatalog
} from './ai-models.js';
import { normalizeAiModelCatalog } from '../src/lib/kainbu/aiModelCatalog.js';
import { invalidateProviderKeyCache } from './openrouter-key.js';
import { repairUsersCollectionApiRules } from './usersCollectionRules.js';
import { getEnv } from './env.js';

const parseDays = (value: string | undefined, fallback = 30) => {
	const parsed = Number.parseInt(value || '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** PocketBase returns autodate values as "YYYY-MM-DD HH:mm:ss.sssZ". */
const parseCreatedMs = (value: unknown) => {
	if (typeof value !== 'string' || !value.trim()) return NaN;
	const normalized = value.includes('T') ? value : value.replace(' ', 'T');
	return Date.parse(normalized);
};

const isUsageEventInWindow = (event: unknown, sinceMs: number) => {
	const created = parseCreatedMs((event as Record<string, unknown> | null)?.created);
	// Rows created before the autodate migration have no created field — include them.
	if (!Number.isFinite(created)) return true;
	return created >= sinceMs;
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

const AUTH_EMAIL_FIELD_NAMES = ['signups_enabled', 'mail_provider', 'resend_api_key'] as const;

let authEmailSchemaReady = false;
let authEmailSchemaRepair: Promise<void> | null = null;

const settingsText = (record: Record<string, unknown> | null | undefined, name: string) => {
	const value = record?.[name];
	return typeof value === 'string' ? value.trim() : '';
};

const settingsRecordAsData = (record: unknown): Record<string, unknown> | null => {
	if (!record || typeof record !== 'object') return null;
	return record as Record<string, unknown>;
};

/** Migrations may no-op on some PB builds; repair schema via Collections API. */
const ensureAuthEmailSettingsFields = async (pb: PocketBase) => {
	if (authEmailSchemaReady) return;
	if (authEmailSchemaRepair) {
		await authEmailSchemaRepair;
		return;
	}

	authEmailSchemaRepair = (async () => {
		let collection = await pb.collections.getOne('app_settings');
		const existing = () => new Set(collection.fields.map((field) => field.name));
		const added: string[] = [];

		if (!existing().has('signups_enabled')) {
			await pb.collections.update(collection.id, {
				fields: [...collection.fields, { name: 'signups_enabled', type: 'bool', required: false }]
			});
			added.push('signups_enabled');
			collection = await pb.collections.getOne('app_settings');
		}

		if (!existing().has('mail_provider')) {
			await pb.collections.update(collection.id, {
				fields: [
					...collection.fields,
					{ name: 'mail_provider', type: 'text', required: false, max: 16 }
				]
			});
			added.push('mail_provider');
			collection = await pb.collections.getOne('app_settings');
		}

		if (!existing().has('resend_api_key')) {
			await pb.collections.update(collection.id, {
				fields: [
					...collection.fields,
					{ name: 'resend_api_key', type: 'text', required: false, max: 512 }
				]
			});
			added.push('resend_api_key');
			collection = await pb.collections.getOne('app_settings');
		}

		if (!existing().has('ai_gateway_api_key')) {
			await pb.collections.update(collection.id, {
				fields: [
					...collection.fields,
					{ name: 'ai_gateway_api_key', type: 'text', required: false, max: 512 }
				]
			});
			added.push('ai_gateway_api_key');
		}

		if (added.length) {
			console.log(`[admin] Added missing app_settings fields: ${added.join(', ')}`);
		}
		authEmailSchemaReady = true;
	})();

	try {
		await authEmailSchemaRepair;
	} finally {
		authEmailSchemaRepair = null;
	}
};

const getSettingsRecord = async () => {
	const pb = await createAdminPb();
	await ensureAuthEmailSettingsFields(pb);
	const rows = await pb.collection('app_settings').getFullList({
		filter: `singleton = "${APP_SETTINGS_SINGLETON}"`,
		fields: [
			'id',
			'singleton',
			...AUTH_EMAIL_FIELD_NAMES,
			'openrouter_api_key',
			'ai_gateway_api_key',
			'ai_models_json'
		].join(',')
	});
	return rows[0] ?? null;
};

const normalizeMailProvider = (value: unknown): 'off' | 'smtp' | 'resend' => {
	const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
	return normalized === 'smtp' || normalized === 'resend' ? normalized : 'off';
};

const isMailConfiguredRecord = (
	record: Record<string, unknown> | null | undefined,
	smtp?: Record<string, unknown>
) => {
	const provider = normalizeMailProvider(record?.mail_provider);
	if (provider === 'off') return false;
	if (provider === 'resend') {
		return Boolean(settingsText(record, 'resend_api_key'));
	}
	if (provider === 'smtp') {
		return smtp?.enabled === true && typeof smtp.host === 'string' && smtp.host.trim().length > 0;
	}
	return false;
};

const toBool = (value: unknown, fallback: boolean) =>
	typeof value === 'boolean' ? value : fallback;

const syncUsersAuthCollectionSettings = async (emailConfigured: boolean, appUrl = '') => {
	const pb = await createAdminPb();
	const templates =
		emailConfigured && appUrl
			? {
					verificationTemplate: {
						subject: 'Verify your Kainbu email',
						body: `<p>Welcome to Kainbu.</p><p><a href="${appUrl}/auth/confirm-verification/{TOKEN}">Verify your email</a></p>`
					},
					resetPasswordTemplate: {
						subject: 'Reset your Kainbu password',
						body: `<p>Use this link to set a new Kainbu password.</p><p><a href="${appUrl}/auth/confirm-password-reset/{TOKEN}">Reset password</a></p>`
					}
				}
			: {};

	await repairUsersCollectionApiRules(pb, templates);

	// Verification is enforced in app signup/login — not via PB authRule (breaks record API).
	if (emailConfigured) {
		const unverified = await pb.collection('users').getFullList({
			filter: 'verified = false'
		});
		for (const user of unverified) {
			await pb.collection('users').update(user.id, { verified: true });
		}
	}
};

export const handleAdminRepairUsersCollection = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const result = await repairUsersCollectionApiRules();
		return c.json({ ok: true, ...result });
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

const publicAuthSettingsFromRecord = (
	record: Record<string, unknown> | null | undefined,
	smtp?: Record<string, unknown>
) => {
	const emailConfigured = isMailConfiguredRecord(record, smtp);
	return {
		signupsEnabled: toBool(record?.signups_enabled, true),
		emailConfigured,
		emailVerificationEnabled: emailConfigured
	};
};

const randomPassword = () => `${randomBytes(18).toString('base64url')}A1!`.slice(0, 24);

const resolveSettingsRecordId = async (pb: PocketBase) => {
	const existing = await getSettingsRecord();
	if (typeof existing?.id === 'string' && existing.id) {
		return existing.id;
	}
	try {
		const row = await pb
			.collection('app_settings')
			.getFirstListItem(`singleton = "${APP_SETTINGS_SINGLETON}"`, { fields: 'id' });
		return typeof row?.id === 'string' ? row.id : '';
	} catch {
		return '';
	}
};

const upsertSettingsRecord = async (data: Record<string, unknown>) => {
	const pb = await createAdminPb();
	await ensureAuthEmailSettingsFields(pb);
	const recordId = await resolveSettingsRecordId(pb);
	if (recordId) {
		return pb.collection('app_settings').update(recordId, data);
	}
	return pb.collection('app_settings').create({
		singleton: APP_SETTINGS_SINGLETON,
		signups_enabled: true,
		mail_provider: 'off',
		...data
	});
};

export const handleGetAuthSettings = async (c: Context) => {
	try {
		const record = settingsRecordAsData(await getSettingsRecord());
		const pb = await createAdminPb();
		const pbSettings = await pb.settings.getAll();
		const smtp = (pbSettings.smtp || {}) as Record<string, unknown>;
		return c.json(publicAuthSettingsFromRecord(record, smtp));
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 500);
	}
};

export const handleAuthSignup = async (c: Context) => {
	try {
		const record = settingsRecordAsData(await getSettingsRecord());
		const pb = await createAdminPb();
		const pbSettings = await pb.settings.getAll();
		const smtp = (pbSettings.smtp || {}) as Record<string, unknown>;
		const settings = publicAuthSettingsFromRecord(record, smtp);
		if (!settings.signupsEnabled) {
			return c.json({ error: 'Signups are disabled.' }, 403);
		}

		const body = (await c.req.json()) as { email?: string; password?: string };
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
		const password = typeof body.password === 'string' ? body.password : '';
		if (!email || !password) {
			return c.json({ error: 'Email and password are required.' }, 400);
		}

		const user = await pb.collection('users').create({
			email,
			emailVisibility: true,
			verified: !settings.emailVerificationEnabled,
			password,
			passwordConfirm: password
		});

		const inviteLink = await linkPendingInvitesByEmail(pb, email, String(user.id));
		if (inviteLink.failed > 0) {
			console.warn('[auth] signup: some pending invites were not linked', {
				email,
				userId: user.id,
				...inviteLink
			});
		}

		if (settings.emailVerificationEnabled) {
			await pb.collection('users').requestVerification(email);
		}

		return c.json({
			ok: true,
			userId: user.id,
			requiresVerification: settings.emailVerificationEnabled
		});
	} catch (error) {
		const { status, message } = adminError(error);
		const normalized = message.toLowerCase();
		if (
			status === 400 &&
			(normalized.includes('already') ||
				normalized.includes('unique') ||
				normalized.includes('validation_not_unique'))
		) {
			return c.json(
				{
					error: 'An account with that email already exists. Sign in instead.'
				},
				409
			);
		}
		return c.json({ error: message }, status as 400 | 403 | 500);
	}
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

type AiKeyProvider = {
	field: 'openrouter_api_key' | 'ai_gateway_api_key';
	envVar: string;
};

const AI_KEY_PROVIDERS: Record<'openrouter' | 'vercel', AiKeyProvider> = {
	openrouter: { field: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
	vercel: { field: 'ai_gateway_api_key', envVar: 'AI_GATEWAY_API_KEY' }
};

const buildAiKeyStatus = (
	record: Record<string, unknown> | null | undefined,
	provider: AiKeyProvider
) => {
	const stored = settingsText(record, provider.field);
	const envKey = getEnv(provider.envVar, '');
	const effective = stored || envKey;
	return {
		configured: Boolean(effective),
		source: (stored ? 'database' : envKey ? 'environment' : 'none') as
			| 'database'
			| 'environment'
			| 'none',
		keyHint: effective ? maskApiKey(effective) : ''
	};
};

export const handleAdminGetAiSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const record = settingsRecordAsData(await getSettingsRecord());
		const openrouter = buildAiKeyStatus(record, AI_KEY_PROVIDERS.openrouter);
		return c.json({
			// Top-level fields kept for backward compatibility (OpenRouter).
			...openrouter,
			providers: {
				openrouter,
				vercel: buildAiKeyStatus(record, AI_KEY_PROVIDERS.vercel)
			}
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminPutAiSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const body = (await c.req.json()) as {
			apiKey?: string;
			openrouterApiKey?: string;
			aiGatewayApiKey?: string;
		};

		const openrouterKey =
			typeof body.openrouterApiKey === 'string'
				? body.openrouterApiKey.trim()
				: typeof body.apiKey === 'string'
					? body.apiKey.trim()
					: '';
		const aiGatewayKey =
			typeof body.aiGatewayApiKey === 'string' ? body.aiGatewayApiKey.trim() : '';

		if (!openrouterKey && !aiGatewayKey) {
			return c.json({ error: 'Provide at least one API key to save.' }, 400);
		}

		const patch: Record<string, unknown> = {};
		if (openrouterKey) patch.openrouter_api_key = openrouterKey;
		if (aiGatewayKey) patch.ai_gateway_api_key = aiGatewayKey;

		await upsertSettingsRecord(patch);
		if (openrouterKey) invalidateProviderKeyCache('openrouter');
		if (aiGatewayKey) invalidateProviderKeyCache('vercel');

		const record = settingsRecordAsData(await getSettingsRecord());
		const openrouter = buildAiKeyStatus(record, AI_KEY_PROVIDERS.openrouter);
		return c.json({
			ok: true,
			...openrouter,
			providers: {
				openrouter,
				vercel: buildAiKeyStatus(record, AI_KEY_PROVIDERS.vercel)
			}
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

const buildAdminAuthEmailPayload = (
	record: Record<string, unknown> | null,
	pbSettings: { meta?: unknown; smtp?: unknown }
) => {
	const smtp = (pbSettings.smtp || {}) as Record<string, unknown>;
	const meta = (pbSettings.meta || {}) as Record<string, unknown>;
	const provider = normalizeMailProvider(record?.mail_provider);
	const resendKey = settingsText(record, 'resend_api_key');

	return {
		...publicAuthSettingsFromRecord(record, smtp),
		mailProvider: provider,
		resendKeyHint: provider === 'resend' && resendKey ? maskApiKey(resendKey) : '',
		appUrl: typeof meta.appURL === 'string' ? meta.appURL : '',
		fromName: typeof meta.senderName === 'string' ? meta.senderName : '',
		fromEmail: typeof meta.senderAddress === 'string' ? meta.senderAddress : '',
		smtp: {
			host: typeof smtp.host === 'string' ? smtp.host : '',
			port: Number(smtp.port) || 587,
			username: typeof smtp.username === 'string' ? smtp.username : '',
			passwordHint: typeof smtp.password === 'string' && smtp.password ? 'configured' : '',
			tls: smtp.tls === true,
			authMethod: typeof smtp.authMethod === 'string' && smtp.authMethod ? smtp.authMethod : 'PLAIN'
		}
	};
};

export const handleAdminGetAuthEmailSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const record = settingsRecordAsData(await getSettingsRecord());
		const pb = await createAdminPb();
		const pbSettings = await pb.settings.getAll();
		return c.json(buildAdminAuthEmailPayload(record, pbSettings));
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminPutAuthEmailSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const body = (await c.req.json()) as {
			signupsEnabled?: boolean;
			mailProvider?: string;
			appUrl?: string;
			fromName?: string;
			fromEmail?: string;
			resendApiKey?: string;
			smtp?: {
				host?: string;
				port?: number;
				username?: string;
				password?: string;
				tls?: boolean;
				authMethod?: string;
			};
		};

		const provider = normalizeMailProvider(body.mailProvider);
		const fromEmail = typeof body.fromEmail === 'string' ? body.fromEmail.trim() : '';
		const fromName = typeof body.fromName === 'string' ? body.fromName.trim() : 'Kainbu';
		const appUrl = typeof body.appUrl === 'string' ? body.appUrl.trim().replace(/\/+$/, '') : '';

		if (provider !== 'off' && (!fromEmail || !appUrl)) {
			return c.json({ error: 'App URL and sender email are required when email is enabled.' }, 400);
		}
		if (provider === 'smtp' && !body.smtp?.host?.trim()) {
			return c.json({ error: 'SMTP host is required.' }, 400);
		}

		const existing = settingsRecordAsData(await getSettingsRecord());
		const patch: Record<string, unknown> = {
			signups_enabled: typeof body.signupsEnabled === 'boolean' ? body.signupsEnabled : true,
			mail_provider: provider
		};
		if (provider === 'resend') {
			const nextKey =
				typeof body.resendApiKey === 'string' && body.resendApiKey.trim()
					? body.resendApiKey.trim()
					: settingsText(existing, 'resend_api_key');
			if (!nextKey) return c.json({ error: 'Resend API key is required.' }, 400);
			patch.resend_api_key = nextKey;
		} else {
			patch.resend_api_key = '';
		}

		const pb = await createAdminPb();
		const current = await pb.settings.getAll();
		const currentMeta = (current.meta || {}) as Record<string, unknown>;
		const currentSmtp = (current.smtp || {}) as Record<string, unknown>;
		const smtpPassword =
			typeof body.smtp?.password === 'string' && body.smtp.password
				? body.smtp.password
				: typeof currentSmtp.password === 'string'
					? currentSmtp.password
					: '';

		await pb.settings.update({
			meta: {
				...currentMeta,
				appName: 'Kainbu',
				appURL: appUrl,
				senderName: fromName,
				senderAddress: fromEmail
			},
			smtp:
				provider === 'smtp'
					? {
							...currentSmtp,
							enabled: true,
							host: body.smtp?.host?.trim() || '',
							port: Number(body.smtp?.port) || 587,
							username: body.smtp?.username?.trim() || '',
							password: smtpPassword,
							tls: body.smtp?.tls === true,
							authMethod: body.smtp?.authMethod === 'LOGIN' ? 'LOGIN' : 'PLAIN'
						}
					: {
							...currentSmtp,
							enabled: false
						}
		});

		const saved = await upsertSettingsRecord(patch);
		const updated = settingsRecordAsData(saved) ?? settingsRecordAsData(await getSettingsRecord());
		const pbSettingsAfter = await pb.settings.getAll();
		const smtpAfter = (pbSettingsAfter.smtp || {}) as Record<string, unknown>;
		const emailConfigured = isMailConfiguredRecord(updated, smtpAfter);
		await syncUsersAuthCollectionSettings(emailConfigured, appUrl);
		if (provider === 'resend' && !settingsText(updated, 'resend_api_key')) {
			console.error(
				'[admin] auth-email save: mail_provider=resend but resend_api_key missing after upsert'
			);
			return c.json(
				{
					error:
						'Resend API key did not persist. Restart the pocketbase service so migrations can run, then save again.'
				},
				500
			);
		}
		return c.json({ ok: true, ...buildAdminAuthEmailPayload(updated, pbSettingsAfter) });
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 400 | 401 | 403 | 500);
	}
};

export const handleAdminUsageSummary = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const days = parseDays(c.req.query('days'));
		const pb = await createAdminPb();
		const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
		const events = (await pb.collection('ai_usage_events').getFullList()).filter((event) =>
			isUsageEventInWindow(event, sinceMs)
		);

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
		).filter((event) => isUsageEventInWindow(event, sinceMs));

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
			(left, right) =>
				right.requestCount - left.requestCount ||
				right.lastActivity.localeCompare(left.lastActivity)
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

export const handleAdminCreateUser = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const body = (await c.req.json()) as { email?: string; password?: string; is_admin?: boolean };
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
		const password = typeof body.password === 'string' ? body.password : '';
		if (!email || !password) return c.json({ error: 'Email and password are required.' }, 400);

		const pb = await createAdminPb();
		const user = await pb.collection('users').create({
			email,
			emailVisibility: true,
			verified: true,
			password,
			passwordConfirm: password,
			is_admin: body.is_admin === true
		});
		return c.json({
			ok: true,
			user: {
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
			}
		});
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 400 | 401 | 403 | 500);
	}
};

export const handleAdminPatchUser = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const userId = c.req.param('id');
		if (!userId) return c.json({ error: 'User id is required' }, 400);
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

export const handleAdminResetUserPassword = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const userId = c.req.param('id');
		if (!userId) return c.json({ error: 'User id is required' }, 400);
		const password = randomPassword();
		const pb = await createAdminPb();
		await pb.collection('users').update(userId, { password, passwordConfirm: password });
		return c.json({ ok: true, password });
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 404 | 500);
	}
};

export const handleAdminGetModelSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const source = await getAiModelCatalogSource();
		const catalog = await loadAiModelCatalog({ fresh: true });
		return c.json({ catalog, source, persisted: source === 'database' });
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminPutModelSettings = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const body = (await c.req.json()) as { catalog?: unknown };
		if (!body.catalog || typeof body.catalog !== 'object') {
			return c.json({ error: 'catalog is required' }, 400);
		}

		const catalog = await saveAiModelCatalog(normalizeAiModelCatalog(body.catalog));
		return c.json({ ok: true, catalog, source: 'database', persisted: true });
	} catch (error) {
		if (error instanceof AiModelCatalogPersistenceError) {
			return c.json({ error: error.message }, 503);
		}
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export const handleAdminUsageByModel = async (c: Context) => {
	try {
		await requireAppAdmin(c.req.header('Authorization'));
		const days = parseDays(c.req.query('days'));
		const pb = await createAdminPb();
		const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
		const events = (await pb.collection('ai_usage_events').getFullList()).filter((event) =>
			isUsageEventInWindow(event, sinceMs)
		);

		const byModel = new Map<
			string,
			{
				model: string;
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
			const model =
				typeof event.model === 'string' && event.model.trim() ? event.model.trim() : '(unknown)';
			const entry =
				byModel.get(model) ||
				({
					model,
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
			byModel.set(model, mutable);
		}

		const models = [...byModel.values()].sort(
			(left, right) =>
				right.costUsd - left.costUsd ||
				right.requestCount - left.requestCount ||
				right.lastActivity.localeCompare(left.lastActivity)
		);

		return c.json({ days, models });
	} catch (error) {
		const { status, message } = adminError(error);
		return c.json({ error: message }, status as 401 | 403 | 500);
	}
};

export { getAdminAllowlistEmails, isEmailOnAdminAllowlist, maskApiKey };
