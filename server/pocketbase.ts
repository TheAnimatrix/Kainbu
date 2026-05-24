import PocketBase from 'pocketbase';
import { getEnv, getRequiredEnv } from './env.js';

export const getPocketBaseUrl = () =>
	getEnv('POCKETBASE_URL', getEnv('VITE_POCKETBASE_URL', 'http://127.0.0.1:8090'));

let adminClient: PocketBase | null = null;
let adminAuthPromise: Promise<PocketBase> | null = null;

export const createUserPb = (token: string | undefined) => {
	const pb = new PocketBase(getPocketBaseUrl());
	if (token) {
		pb.authStore.save(token, null);
	}
	return pb;
};

export const createAdminPb = async () => {
	if (adminClient?.authStore.isValid) {
		return adminClient;
	}

	if (adminAuthPromise) {
		return adminAuthPromise;
	}

	adminAuthPromise = (async () => {
		const pb = new PocketBase(getPocketBaseUrl());
		const email = getRequiredEnv('POCKETBASE_ADMIN_EMAIL');
		const password = getRequiredEnv('POCKETBASE_ADMIN_PASSWORD');
		try {
			await pb.collection('_superusers').authWithPassword(email, password);
		} catch {
			await pb.admins.authWithPassword(email, password);
		}
		adminClient = pb;
		return pb;
	})();

	try {
		return await adminAuthPromise;
	} finally {
		adminAuthPromise = null;
	}
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

	return model.id;
};

export const getAuthenticatedUser = async (authorization: string | undefined) => {
	const userId = await getAuthenticatedUserId(authorization);
	const pb = createUserPb(authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined);
	const record = await pb.collection('users').getOne(userId);
	return record;
};
