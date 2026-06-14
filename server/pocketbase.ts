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

	return pb;
};

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
