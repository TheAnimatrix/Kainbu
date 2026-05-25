import { pocketbase } from '$lib/pocketbaseClient';
import { resolveWorkspaceApiUrl } from '$lib/kainbu/api';

const authHeaders = (): HeadersInit => {
	const token = pocketbase.authStore.token;
	if (!token) {
		throw new Error('You need to sign in before using admin tools.');
	}
	return {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json'
	};
};

const adminFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
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
				: `Admin request failed (${response.status})`
		);
	}

	return body;
};

export type AdminMe = {
	isAdmin: boolean;
	email: string;
	userId: string;
};

export type AdminAiSettings = {
	configured: boolean;
	source: 'database' | 'environment' | 'none';
	keyHint: string;
};

export type AdminUsageSummary = {
	days: number;
	requestCount: number;
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number | null;
	costEventsWithValue: number;
};

export type AdminUsageByUserRow = {
	userId: string;
	email: string;
	username: string;
	requestCount: number;
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number;
	costEventsWithValue: number;
	lastActivity: string;
};

export type AdminModelCatalog = import('$lib/kainbu/aiModelCatalog').AiModelCatalog;

export type AdminUsageByModelRow = {
	model: string;
	requestCount: number;
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number;
	costEventsWithValue: number;
	lastActivity: string;
};

export type AdminUserRow = {
	id: string;
	email: string;
	username: string;
	is_admin: boolean;
	is_admin_field: boolean;
	disabled: boolean;
	created: string;
	on_allowlist: boolean;
};

export const fetchAdminMe = () => adminFetch<AdminMe>('/api/admin/me');

export const fetchAdminAiSettings = () => adminFetch<AdminAiSettings>('/api/admin/settings/ai');

export const updateAdminAiSettings = (apiKey: string) =>
	adminFetch<{ ok: boolean; configured: boolean; keyHint: string }>('/api/admin/settings/ai', {
		method: 'PUT',
		body: JSON.stringify({ apiKey })
	});

export type AdminModelSettings = {
	catalog: AdminModelCatalog;
	source: 'database' | 'defaults';
	persisted: boolean;
};

export const fetchAdminModelSettings = () =>
	adminFetch<AdminModelSettings>('/api/admin/settings/models');

export const updateAdminModelSettings = (catalog: AdminModelCatalog) =>
	adminFetch<{ ok: boolean; catalog: AdminModelCatalog }>('/api/admin/settings/models', {
		method: 'PUT',
		body: JSON.stringify({ catalog })
	});

export const fetchAdminUsageSummary = (days = 30) =>
	adminFetch<AdminUsageSummary>(`/api/admin/usage/summary?days=${days}`);

export const fetchAdminUsageByModel = (days = 30) =>
	adminFetch<{ days: number; models: AdminUsageByModelRow[] }>(
		`/api/admin/usage/by-model?days=${days}`
	);

export const fetchAdminUsageByUser = (days = 30) =>
	adminFetch<{ days: number; users: AdminUsageByUserRow[] }>(`/api/admin/usage/by-user?days=${days}`);

export const fetchAdminUsers = (page = 1) =>
	adminFetch<{
		page: number;
		perPage: number;
		totalItems: number;
		totalPages: number;
		items: AdminUserRow[];
	}>(`/api/admin/users?page=${page}`);

export const patchAdminUser = (
	userId: string,
	patch: { is_admin?: boolean; disabled?: boolean }
) =>
	adminFetch<{ ok: boolean; user: AdminUserRow }>(`/api/admin/users/${userId}`, {
		method: 'PATCH',
		body: JSON.stringify(patch)
	});
