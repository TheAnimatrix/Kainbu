import PocketBase, { ClientResponseError } from 'pocketbase';
import { formatPocketBaseError } from '../src/lib/pocketbaseErrors.js';
import { looksLikeApiToken, resolveApiKeyUser } from './apiKeys.js';
import { getEnv, getRequiredEnv } from './env.js';

export const getPocketBaseUrl = () =>
	getEnv('POCKETBASE_URL', getEnv('VITE_POCKETBASE_URL', 'http://127.0.0.1:8090'));

let cachedAdminToken: string | null = null;
let adminAuthInFlight: Promise<string> | null = null;

export const invalidateAdminPbAuth = () => {
	cachedAdminToken = null;
};

const loginAdmin = async (): Promise<string> => {
	const pb = new PocketBase(getPocketBaseUrl());
	const email = getRequiredEnv('POCKETBASE_ADMIN_EMAIL');
	const password = getRequiredEnv('POCKETBASE_ADMIN_PASSWORD');
	try {
		await pb.collection('_superusers').authWithPassword(email, password);
	} catch {
		await pb.admins.authWithPassword(email, password);
	}

	const token = pb.authStore.token;
	if (!token) {
		throw new Error('PocketBase admin authentication failed');
	}

	return token;
};

const resolveAdminToken = async (): Promise<string> => {
	if (cachedAdminToken) {
		return cachedAdminToken;
	}

	if (adminAuthInFlight) {
		return adminAuthInFlight;
	}

	adminAuthInFlight = (async () => {
		const token = await loginAdmin();
		cachedAdminToken = token;
		return token;
	})();

	try {
		return await adminAuthInFlight;
	} finally {
		adminAuthInFlight = null;
	}
};

/** Fresh PocketBase client per call — safe for concurrent admin API requests. */
export const createAdminPb = async () => {
	const pb = new PocketBase(getPocketBaseUrl());
	const token = await resolveAdminToken();
	pb.authStore.save(token, null);

	if (!pb.authStore.isValid) {
		invalidateAdminPbAuth();
		pb.authStore.save(await resolveAdminToken(), null);
	}

	return withAdminAuthRetry(pb);
};

const isAdminAuthFailure = (error: unknown) =>
	error instanceof ClientResponseError && (error.status === 401 || error.status === 403);

// A failed mutation may already have reached PocketBase. Never replay it after
// an auth error, or a create/update/delete can be applied twice.
export const isSafeAdminRetryMethod = (method: PropertyKey) =>
	typeof method === 'string' &&
	(method.startsWith('get') || method === 'authRefresh' || method === 'authWithPassword');

/**
 * PocketBase auth tokens can become stale across deploys/restarts while the API
 * process is still alive. Retry one failed admin SDK call with a fresh login so
 * CLI/API reads recover without requiring users to log out and back in.
 */
export const withAdminAuthRetry = <T extends PocketBase>(
	pb: T,
	createFreshClient: () => PocketBase = () => new PocketBase(getPocketBaseUrl()),
	resolveFreshToken: () => Promise<string> = resolveAdminToken
): T =>
	new Proxy(pb, {
		get(target, prop, receiver) {
			if (prop !== 'collection') {
				const value = Reflect.get(target, prop, receiver);
				return typeof value === 'function' ? value.bind(target) : value;
			}

			return (name: string) => {
				const collection = target.collection(name);
				return new Proxy(collection, {
					get(collectionTarget, collectionProp, collectionReceiver) {
						const value = Reflect.get(collectionTarget, collectionProp, collectionReceiver);
						if (typeof value !== 'function') return value;

						return async (...args: unknown[]) => {
							try {
								return await value.apply(collectionTarget, args);
							} catch (error) {
								if (!isAdminAuthFailure(error) || !isSafeAdminRetryMethod(collectionProp)) throw error;

								invalidateAdminPbAuth();
								const fresh = createFreshClient();
								fresh.authStore.save(await resolveFreshToken(), null);
								return await Reflect.get(fresh.collection(name), collectionProp).apply(
									fresh.collection(name),
									args
								);
							}
						};
					}
				});
			};
		}
	}) as T;

export const mapPocketBaseError = (error: unknown) => {
	if (error instanceof ClientResponseError) {
		const status =
			error.status === 404 ? 404 : error.status >= 400 && error.status < 600 ? error.status : 500;
		return {
			status,
			message:
				status === 404
					? 'The requested resource was not found.'
					: formatPocketBaseError(error, 'PocketBase request failed.')
		};
	}

	if (error instanceof Error) {
		const status =
			'status' in error && typeof (error as Error & { status?: number }).status === 'number'
				? (error as Error & { status: number }).status
				: error.message === 'Unauthorized'
					? 401
					: error.message === 'Forbidden'
						? 403
						: 500;
		return { status, message: error.message };
	}

	return { status: 500, message: 'Unknown error' };
};

export const createUserPb = (token: string | undefined) => {
	const pb = new PocketBase(getPocketBaseUrl());
	if (token) {
		pb.authStore.save(token, null);
	}
	return pb;
};

export const getAuthenticatedUserId = async (authorization: string | undefined) => {
	if (!authorization?.startsWith('Bearer ')) {
		throw new Error('Unauthorized');
	}

	const token = authorization.slice('Bearer '.length).trim();
	if (!token) {
		throw new Error('Unauthorized');
	}

	const pb = createUserPb(token);

	if (!pb.authStore.isValid || !pb.authStore.model?.id) {
		try {
			await pb.collection('users').authRefresh();
		} catch {
			throw new Error('Unauthorized');
		}
	}

	const model = pb.authStore.model;
	if (!model?.id) {
		throw new Error('Unauthorized');
	}

	if (model.disabled === true) {
		throw new Error('Unauthorized');
	}

	return model.id;
};

export const getAuthenticatedUser = async (authorization: string | undefined) => {
	const userId = await getAuthenticatedUserId(authorization);
	const pb = createUserPb(authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined);
	const record = await pb.collection('users').getOne(userId);
	if (record.disabled === true) {
		throw new Error('Unauthorized');
	}
	return record;
};

/**
 * Like `getAuthenticatedUserId`, but accepts either a PocketBase JWT **or**
 * a per-user API key. The `kbu_` prefix on the bearer is the discriminator.
 *
 * Returns `{ userId, authMethod: 'api-key' | 'jwt' }` so handlers can
 * observability-tag the path if they want.
 */
export type AuthenticatedContext = {
	userId: string;
	authMethod: 'api-key' | 'jwt';
};

export const resolveAuthenticatedUserId = async (
	authorization: string | undefined
): Promise<AuthenticatedContext> => {
	if (!authorization?.startsWith('Bearer ')) {
		throw new Error('Unauthorized');
	}
	const token = authorization.slice('Bearer '.length).trim();
	if (!token) {
		throw new Error('Unauthorized');
	}

	if (looksLikeApiToken(token)) {
		const resolved = await resolveApiKeyUser(token, { touchLastUsed: true });
		if (resolved) {
			return { userId: resolved.userId, authMethod: 'api-key' };
		}
		// Don't fall through to the JWT path. A `kbu_` token that doesn't
		// resolve (unknown / revoked / expired) is its own failure mode.
		throw new Error('Unauthorized');
	}

	const pb = createUserPb(token);
	if (!pb.authStore.isValid || !pb.authStore.model?.id) {
		try {
			await pb.collection('users').authRefresh();
		} catch {
			throw new Error('Unauthorized');
		}
	}
	const model = pb.authStore.model;
	if (!model?.id) throw new Error('Unauthorized');
	if (model.disabled === true) throw new Error('Unauthorized');
	return { userId: model.id, authMethod: 'jwt' };
};
