import type { SupabaseClient } from '@supabase/supabase-js';

let activeClient: SupabaseClient | null = null;

export const setSupabaseClient = (client: SupabaseClient) => {
	activeClient = client;
};

export const getSupabase = (): SupabaseClient => {
	if (!activeClient) {
		throw new Error('Supabase client is not configured. Call setSupabaseClient() first.');
	}

	return activeClient;
};

export const tryGetSupabase = () => activeClient;
