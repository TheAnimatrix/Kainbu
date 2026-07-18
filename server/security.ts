import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getEnv } from './env.js';
import { resolveAuthenticatedUserId } from './pocketbase.js';

const positiveEnvNumber = (name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) => {
	const parsed = Number(getEnv(name, String(fallback)));
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback;
};

export const securityLimits = {
	maxJsonBytes: positiveEnvNumber('KAINBU_MAX_JSON_BYTES', 2097152),
	maxAiJsonBytes: positiveEnvNumber('KAINBU_MAX_AI_JSON_BYTES', 10485760),
	maxTranscriptionJsonBytes: positiveEnvNumber('KAINBU_MAX_TRANSCRIPTION_JSON_BYTES', 12582912),
	maxRequestsPerWindow: positiveEnvNumber('KAINBU_RATE_LIMIT', 120),
	windowMs: positiveEnvNumber('KAINBU_RATE_WINDOW_MS', 60000),
	maxRateLimitEntries: positiveEnvNumber('KAINBU_RATE_LIMIT_ENTRIES', 10000, 1_000_000)
};

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const authIdentities = new Map<string, { userId: string; expiresAt: number }>();
let lastCleanup = 0;

const authFingerprint = (auth: string) => createHash('sha256').update(auth).digest('hex');

const clientKey = async (c: Context, namespace: string, now: number) => {
	const auth = c.req.header('Authorization')?.trim();
	const configuredProxy = getEnv('KAINBU_TRUST_PROXY', 'false').toLowerCase() === 'true';
	const forwarded = configuredProxy ? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() : '';
	// X-Forwarded-For and X-Real-IP are client-controlled unless the API is
	// explicitly behind a trusted proxy. Never use them in the default mode.
	const incoming = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
	const ip = forwarded || incoming?.incoming?.socket?.remoteAddress || 'unknown';
	let identity = `ip:${ip}`;
	if (auth) {
		const fingerprint = authFingerprint(auth);
		const cached = authIdentities.get(fingerprint);
		if (cached && cached.expiresAt > now) {
			identity = `user:${cached.userId}`;
		} else {
			try {
				const resolved = await resolveAuthenticatedUserId(auth);
				identity = `user:${resolved.userId}`;
				if (authIdentities.size < securityLimits.maxRateLimitEntries) {
					authIdentities.set(fingerprint, { userId: resolved.userId, expiresAt: now + 30_000 });
				}
			} catch {
				// Invalid credentials are still isolated without ever storing the secret.
				identity = `auth:${fingerprint}`;
			}
		}
	}
	return `${namespace}:${identity}`;
};

export const rateLimit =
	(options: { limit?: number; windowMs?: number } = {}): MiddlewareHandler =>
	async (c, next) => {
		const now = Date.now();
		const limit = options.limit ?? securityLimits.maxRequestsPerWindow;
		const windowMs = options.windowMs ?? securityLimits.windowMs;
		const namespace = `${limit}:${windowMs}`;
		if (now - lastCleanup > Math.min(windowMs, 60_000)) {
			for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
			for (const [key, entry] of authIdentities)
				if (entry.expiresAt <= now) authIdentities.delete(key);
			lastCleanup = now;
		}
		const key = await clientKey(c, namespace, now);
		if (buckets.size >= securityLimits.maxRateLimitEntries && !buckets.has(key)) {
			return c.json({ error: 'Too many requests.' }, 429);
		}
		const bucket = buckets.get(key);
		const current =
			!bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + windowMs } : bucket;
		current.count += 1;
		buckets.set(key, current);
		c.header('X-RateLimit-Limit', String(limit));
		c.header('X-RateLimit-Remaining', String(Math.max(0, limit - current.count)));
		if (current.count > limit) {
			c.header('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
			return c.json({ error: 'Too many requests.' }, 429);
		}
		await next();
	};

export const requestBodyLimit =
	(limit: number): MiddlewareHandler =>
	async (c, next) => {
		const rawLength = c.req.header('Content-Length');
		if (rawLength !== undefined) {
			const contentLength = Number(rawLength);
			if (!Number.isFinite(contentLength) || contentLength < 0)
				return c.json({ error: 'Invalid Content-Length.' }, 400);
			if (contentLength > limit) return c.json({ error: 'Request body too large.' }, 413);
		}
		await next();
	};

export const invalidJsonAs400: MiddlewareHandler = async (c, next) => {
	try {
		await next();
	} catch (error) {
		if (error instanceof SyntaxError || (error instanceof Error && /json/i.test(error.message))) {
			return c.json({ error: 'Malformed JSON request body.' }, 400);
		}
		throw error;
	}
};

export const resetRateLimitForTests = () => {
	buckets.clear();
	authIdentities.clear();
};
