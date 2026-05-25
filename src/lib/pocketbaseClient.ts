import PocketBase from 'pocketbase';
import { setPocketBaseClient } from '$lib/kainbu/pocketbaseContext';

/** Browser: same-origin /pb via nginx. Override with VITE_POCKETBASE_URL when needed. */
export function resolvePocketBaseUrl(): string {
	const fromEnv = import.meta.env.VITE_POCKETBASE_URL?.trim();
	if (fromEnv) return fromEnv;
	if (typeof window !== 'undefined') {
		return `${window.location.origin}/pb`;
	}
	return 'http://127.0.0.1:8090';
}

const POCKETBASE_URL = resolvePocketBaseUrl();

export const pocketbase = new PocketBase(POCKETBASE_URL);

if (typeof window !== 'undefined') {
	// Workspace loads many collections in parallel; default autocancel causes false "refresh failed" errors.
	pocketbase.autoCancellation(false);
	pocketbase.authStore.onChange(() => {
		// authStore persists automatically when using LocalAuthStore (default in browser)
	});
}

setPocketBaseClient(pocketbase);

export const isPocketBaseConfigured = Boolean(
	import.meta.env.VITE_POCKETBASE_URL?.trim() || POCKETBASE_URL
);
