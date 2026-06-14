import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminPb } from './pocketbase.js';
import { pbEscapeFilter } from '../src/lib/kainbu/pbRecords.js';

const TOKEN_BYTES = 32;
const TOKEN_PREFIX_CHARS = 6;

/**
 * Versioned, human-readable head on every raw token: `kbu_v1_`. The `kbu_`
 * stem is the discriminator the auth path uses to route a bearer to the
 * API-key resolver; the `v1_` segment lets us rotate the encoding later
 * without breaking older tokens (match on `kbu_`, branch on the version).
 */
export const API_TOKEN_HEAD = 'kbu_v1_';

/** True for any bearer that is shaped like one of our API tokens. */
export const looksLikeApiToken = (token: string) => token.startsWith('kbu_');

/**
 * Generates a fresh API token, e.g. `kbu_v1_8Tdj1ZOFlPTwVFLzt…`.
 * Returns the raw key (shown to the user once) and the prefix (used in UI
 * to tell tokens apart) and the hash (stored in PocketBase).
 */
export const generateApiToken = (): { raw: string; prefix: string; hash: string } => {
	const body = randomBytes(TOKEN_BYTES).toString('base64url');
	const raw = `${API_TOKEN_HEAD}${body}`;
	// Non-secret display handle: head + first few body chars, e.g. `kbu_v1_8Tdj1Z`.
	const prefix = `${API_TOKEN_HEAD}${body.slice(0, TOKEN_PREFIX_CHARS)}`;
	const hash = hashApiToken(raw);
	return { raw, prefix, hash };
};

/** sha-256 of a raw token, hex-encoded. Deterministic and cheap to index. */
export const hashApiToken = (raw: string) =>
	createHash('sha256').update(raw, 'utf8').digest('hex');

/**
 * Constant-time compare of two hex digests of the same length. Returns false
 * if either side is malformed so we never throw out of a lookup hot path.
 */
const safeEqualHex = (a: string, b: string) => {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
	} catch {
		return false;
	}
};

export type ResolvedApiToken = {
	userId: string;
	tokenId: string;
	lastUsedAt: string | null;
	expiresAt: string | null;
};

/**
 * Looks up a raw API token. Returns the owning user id and token record, or
 * null if the token is unknown / revoked / expired.
 *
 * Constant-time compare against the stored hash; we still need to read the
 * candidate row out of PB, but the comparator itself won't short-circuit on
 * the first byte mismatch the way a plain `===` would.
 */
export const resolveApiKeyUser = async (
	raw: string,
	options: { touchLastUsed?: boolean } = {}
): Promise<ResolvedApiToken | null> => {
	if (!raw || typeof raw !== 'string') return null;
	const hash = hashApiToken(raw);
	const pb = await createAdminPb();

	let record: Record<string, unknown> | null = null;
	try {
		const list = await pb.collection('user_api_tokens').getList<Record<string, unknown>>(1, 1, {
			filter: `token_hash = "${pbEscapeFilter(hash)}"`,
			// token_hash must be selected — the constant-time re-check below
			// compares against it. Omit it and every lookup silently fails.
			fields: 'id,user,token_hash,revoked_at,expires_at,last_used_at'
		});
		record = list.items[0] ?? null;
	} catch {
		return null;
	}

	if (!record) return null;
	if (!safeEqualHex(String(record.token_hash ?? ''), hash)) return null;
	if (record.revoked_at) return null;
	if (record.expires_at) {
		const expires = new Date(String(record.expires_at)).getTime();
		if (Number.isFinite(expires) && expires < Date.now()) return null;
	}

	if (options.touchLastUsed) {
		// Best-effort. Don't block the request on a failed update.
		void pb
			.collection('user_api_tokens')
			.update(String(record.id), { last_used_at: new Date().toISOString() })
			.catch(() => {
				// ignore — last_used_at is observability, not security
			});
	}

	const userValue = record.user;
	const userId = typeof userValue === 'string' ? userValue : '';
	if (!userId) return null;

	return {
		userId,
		tokenId: String(record.id),
		lastUsedAt: (record.last_used_at as string | null) ?? null,
		expiresAt: (record.expires_at as string | null) ?? null
	};
};

/**
 * Masking helper for the settings UI. We only show the prefix, never the
 * secret, on a list. Matches the convention from `maskApiKey` for provider
 * keys but is intentionally a no-op for short tokens (we always return the
 * prefix which is already non-sensitive).
 */
export const maskApiToken = (prefix: string) => (prefix ? `${prefix}…` : '…');
