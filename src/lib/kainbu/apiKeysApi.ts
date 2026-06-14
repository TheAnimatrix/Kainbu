import { pocketbase } from '$lib/pocketbaseClient';
import { resolveWorkspaceApiUrl } from '$lib/kainbu/api';

const authHeaders = (): HeadersInit => {
	const token = pocketbase.authStore.token;
	if (!token) {
		throw new Error('You need to sign in before managing API keys.');
	}
	return {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json'
	};
};

const meFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
	const response = await fetch(resolveWorkspaceApiUrl(path), {
		...init,
		headers: {
			...authHeaders(),
			...(init.headers || {})
		}
	});
	const body = (await response.json().catch(() => ({}))) as T & { error?: string };
	if (!response.ok) {
		throw new Error(
			typeof (body as { error?: string }).error === 'string'
				? (body as { error?: string }).error
				: `Request failed (${response.status})`
		);
	}
	return body;
};

export type MeIdentity = {
	id: string;
	email: string | null;
	username: string | null;
	is_admin: boolean;
	auth_method: 'api-key' | 'jwt';
};

export type ApiKeyRow = {
	id: string;
	name: string;
	prefix: string;
	hint: string;
	last_used_at: string | null;
	expires_at: string | null;
	revoked_at: string | null;
	created: string;
};

export type CreatedApiKey = {
	id: string;
	name: string;
	prefix: string;
	token: string;
};

export const fetchMe = async (): Promise<MeIdentity> => meFetch<MeIdentity>('/api/me');

export const fetchApiKeys = async (): Promise<ApiKeyRow[]> => {
	const response = await meFetch<{ items: ApiKeyRow[] }>('/api/me/api-keys');
	return response.items;
};

export const createApiKey = async (name: string): Promise<CreatedApiKey> =>
	meFetch<CreatedApiKey>('/api/me/api-keys', {
		method: 'POST',
		body: JSON.stringify({ name })
	});

export const revokeApiKey = async (id: string): Promise<{ ok: boolean; alreadyRevoked?: boolean }> =>
	meFetch<{ ok: boolean; alreadyRevoked?: boolean }>(`/api/me/api-keys/${encodeURIComponent(id)}`, {
		method: 'DELETE'
	});
