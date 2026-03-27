import { createClient, type User } from '@supabase/supabase-js';
import { getEnv, getRequiredEnv } from './env.js';

export const getSupabaseUrl = () =>
	getEnv('VITE_SUPABASE_URL', getEnv('PUBLIC_SUPABASE_URL', 'https://placeholder.supabase.co'));

export const getSupabaseAnonKey = () =>
	getEnv('VITE_SUPABASE_ANON_KEY', getEnv('PUBLIC_SUPABASE_ANON_KEY', 'YOUR_SUPABASE_ANON_KEY'));

export const getSupabaseServiceRoleKey = () => getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

export const createAuthenticatedSupabaseClient = (authorization: string | undefined) =>
	createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
		global: {
			headers: authorization
				? {
						Authorization: authorization
					}
				: {}
		},
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});

export const createAdminSupabaseClient = () =>
	createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});

export const getAuthenticatedUser = async (authorization: string | undefined): Promise<User> => {
	if (!authorization) {
		throw new Error('Unauthorized');
	}

	const supabase = createAuthenticatedSupabaseClient(authorization);
	const {
		data: { user },
		error
	} = await supabase.auth.getUser();

	if (error || !user) {
		throw new Error('Unauthorized');
	}

	return user;
};

export const getAuthenticatedUserId = async (authorization: string | undefined) =>
	(await getAuthenticatedUser(authorization)).id;
