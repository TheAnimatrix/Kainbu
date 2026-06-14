import type { Context } from 'hono';
import { createAdminPb, resolveAuthenticatedUserId } from './pocketbase.js';
import { generateApiToken, maskApiToken } from './apiKeys.js';
import { mapPocketBaseError } from './pocketbase.js';
import { pbEscapeFilter } from './pbWorkspace.js';

const apiKeyError = (error: unknown) => {
	const { status, message } = mapPocketBaseError(error);
	return { status: status as 400 | 401 | 403 | 404 | 500, message };
};

const toApiKeyRow = (record: Record<string, unknown>) => ({
	id: String(record.id),
	name: String(record.name ?? ''),
	prefix: String(record.prefix ?? ''),
	hint: maskApiToken(String(record.prefix ?? '')),
	last_used_at: (record.last_used_at as string | null) ?? null,
	expires_at: (record.expires_at as string | null) ?? null,
	revoked_at: (record.revoked_at as string | null) ?? null,
	created: String(record.created ?? '')
});

const isValidName = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64;

export const handleApiKeyList = async (c: Context) => {
	try {
		const { userId } = await resolveAuthenticatedUserId(c.req.header('Authorization'));
		const pb = await createAdminPb();
		const list = await pb.collection('user_api_tokens').getList<Record<string, unknown>>(1, 200, {
			filter: `user = "${pbEscapeFilter(userId)}"`,
			sort: '-id',
			fields: 'id,name,prefix,last_used_at,expires_at,revoked_at,created'
		});
		return c.json({ items: list.items.map(toApiKeyRow) });
	} catch (error) {
		const { status, message } = apiKeyError(error);
		return c.json({ error: message }, status);
	}
};

export const handleApiKeyCreate = async (c: Context) => {
	try {
		const { userId } = await resolveAuthenticatedUserId(c.req.header('Authorization'));
		const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };

		if (!isValidName(body.name)) {
			return c.json({ error: 'name is required (1-64 chars).' }, 400);
		}

		const generated = generateApiToken();
		const pb = await createAdminPb();
		const record = await pb.collection('user_api_tokens').create<Record<string, unknown>>({
			user: userId,
			name: body.name.trim(),
			token_hash: generated.hash,
			prefix: generated.prefix
		});

		// Raw token is returned once and never again. The stored `prefix` is
		// also a non-secret display handle, but the user must save the full
		// `raw` value before closing the dialog.
		return c.json({
			id: String(record.id),
			name: String(record.name ?? ''),
			prefix: generated.prefix,
			token: generated.raw
		});
	} catch (error) {
		const { status, message } = apiKeyError(error);
		return c.json({ error: message }, status);
	}
};

export const handleApiKeyRevoke = async (c: Context) => {
	try {
		const { userId } = await resolveAuthenticatedUserId(c.req.header('Authorization'));
		const id = c.req.param('id');
		if (!id) return c.json({ error: 'id is required.' }, 400);

		const pb = await createAdminPb();
		// Resolve the row first so we can confirm it belongs to the caller and
		// return a clean 404 rather than PocketBase's verbose error.
		let record: Record<string, unknown> | null = null;
		try {
			record = await pb.collection('user_api_tokens').getOne<Record<string, unknown>>(id, {
				fields: 'id,user,revoked_at'
			});
		} catch {
			return c.json({ error: 'Token not found.' }, 404);
		}
		if (String(record.user) !== userId) {
			return c.json({ error: 'Token not found.' }, 404);
		}
		if (record.revoked_at) {
			return c.json({ ok: true, alreadyRevoked: true });
		}
		await pb.collection('user_api_tokens').update(id, { revoked_at: new Date().toISOString() });
		return c.json({ ok: true });
	} catch (error) {
		const { status, message } = apiKeyError(error);
		return c.json({ error: message }, status);
	}
};

/**
 * Identity endpoint — the CLI's replacement for the old "whoami" path. Returns
 * the currently-authenticated user, accepting either a PB JWT or an API key.
 */
export const handleMe = async (c: Context) => {
	try {
		const { userId, authMethod } = await resolveAuthenticatedUserId(c.req.header('Authorization'));
		const pb = await createAdminPb();
		const user = await pb.collection('users').getOne<Record<string, unknown>>(userId, {
			fields: 'id,email,username,is_admin,disabled'
		});
		if (user.disabled === true) throw new Error('Unauthorized');
		return c.json({
			id: String(user.id),
			email: (user.email as string | null) ?? null,
			username: (user.username as string | null) ?? null,
			is_admin: user.is_admin === true,
			auth_method: authMethod
		});
	} catch (error) {
		const { status, message } = apiKeyError(error);
		return c.json({ error: message }, status);
	}
};
