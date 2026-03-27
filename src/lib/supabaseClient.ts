import { createClient } from '@supabase/supabase-js';

const normalizeEnvValue = (value: string | undefined, fallback: string) =>
	(value || fallback)
		.trim()
		.replace(/^['"]|['"]$/g, '')
		.replace(/;+\s*$/, '');

const supabaseUrl = normalizeEnvValue(
	import.meta.env.VITE_SUPABASE_URL,
	'https://placeholder.supabase.co'
);
const supabaseAnonKey = normalizeEnvValue(
	import.meta.env.VITE_SUPABASE_ANON_KEY,
	'YOUR_SUPABASE_ANON_KEY'
);
const AUTH_STORAGE_KEY = 'kainbu-auth';
const isBrowser = typeof window !== 'undefined';

const authStorage = {
	getItem: (key: string) => {
		if (!isBrowser) return null;
		return window.localStorage.getItem(key);
	},
	setItem: (key: string, value: string) => {
		if (!isBrowser) return;
		window.localStorage.setItem(key, value);
	},
	removeItem: (key: string) => {
		if (!isBrowser) return;
		window.localStorage.removeItem(key);
	}
};

export const isSupabaseConfigured =
	!supabaseUrl.includes('placeholder') && supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
		storageKey: AUTH_STORAGE_KEY,
		storage: authStorage
	}
});
