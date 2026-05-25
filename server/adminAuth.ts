import type { RecordModel } from 'pocketbase';
import { createAdminPb, getAuthenticatedUser } from './pocketbase.js';
import { getEnv } from './env.js';

const APP_SETTINGS_SINGLETON = 'main';

export const getAdminAllowlistEmails = (): Set<string> => {
	// Prefer process.env so Docker-injected values are not affected by dotenv load order.
	const raw = process.env.KAINBU_ADMIN_EMAILS || getEnv('KAINBU_ADMIN_EMAILS', '');
	return new Set(
		raw
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean)
	);
};

export const isEmailOnAdminAllowlist = (email: string | undefined): boolean => {
	if (!email) return false;
	return getAdminAllowlistEmails().has(email.trim().toLowerCase());
};

export const isUserAppAdmin = (record: RecordModel): boolean => {
	if (record.disabled === true) return false;
	if (record.is_admin === true) return true;
	return isEmailOnAdminAllowlist(typeof record.email === 'string' ? record.email : undefined);
};

export const maskApiKey = (key: string): string => {
	const trimmed = key.trim();
	if (!trimmed) return '';
	if (trimmed.length <= 4) return '****';
	return `...${trimmed.slice(-4)}`;
};

export const syncAdminFlag = async (record: RecordModel): Promise<RecordModel> => {
	const email = typeof record.email === 'string' ? record.email : '';
	if (!isEmailOnAdminAllowlist(email) || record.is_admin === true) {
		return record;
	}

	const pb = await createAdminPb();
	return pb.collection('users').update(record.id, { is_admin: true });
};

export const requireAppAdmin = async (authorization: string | undefined): Promise<RecordModel> => {
	const record = await getAuthenticatedUser(authorization);
	if (record.disabled === true) {
		const error = new Error('Forbidden');
		(error as Error & { status: number }).status = 403;
		throw error;
	}

	const synced = await syncAdminFlag(record);
	if (!isUserAppAdmin(synced)) {
		const error = new Error('Forbidden');
		(error as Error & { status: number }).status = 403;
		throw error;
	}

	return synced;
};

export const getAdminMe = async (authorization: string | undefined) => {
	const record = await getAuthenticatedUser(authorization);
	const synced = await syncAdminFlag(record);
	const email = typeof synced.email === 'string' ? synced.email : '';
	return {
		isAdmin: isUserAppAdmin(synced) || isEmailOnAdminAllowlist(email),
		email,
		userId: synced.id
	};
};

export { APP_SETTINGS_SINGLETON };
