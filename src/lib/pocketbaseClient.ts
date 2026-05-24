import PocketBase from 'pocketbase';
import { setPocketBaseClient } from '$lib/kainbu/pocketbaseContext';

const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const pocketbase = new PocketBase(POCKETBASE_URL);

if (typeof window !== 'undefined') {
	pocketbase.authStore.onChange(() => {
		// authStore persists automatically when using LocalAuthStore (default in browser)
	});
}

setPocketBaseClient(pocketbase);

export const isPocketBaseConfigured = Boolean(
	import.meta.env.VITE_POCKETBASE_URL?.trim() || POCKETBASE_URL
);
