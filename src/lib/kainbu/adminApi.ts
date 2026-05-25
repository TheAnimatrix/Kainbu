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

export type AuthSettings = {
	signupsEnabled: boolean;
	emailConfigured: boolean;
	emailVerificationEnabled: boolean;
};

export type AdminAuthEmailSettings = AuthSettings & {
	mailProvider: 'off' | 'smtp' | 'resend';
	resendKeyHint: string;
	appUrl: string;
	fromName: string;
	fromEmail: string;
	smtp: {
		host: string;
		port: number;
		username: string;
		passwordHint: string;
		tls: boolean;
		authMethod: 'PLAIN' | 'LOGIN';
	};
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

export const fetchAuthSettings = async () => {
	const response = await fetch(resolveWorkspaceApiUrl('/api/auth/settings'));
	const body = (await response.json().catch(() => ({}))) as AuthSettings & { error?: string };
	if (!response.ok) throw new Error(body.error || 'Unable to load auth settings.');
	return body;
};

export const signupWithAuthSettings = (email: string, password: string) =>
	fetch(resolveWorkspaceApiUrl('/api/auth/signup'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	}).then(async (response) => {
		const body = (await response.json().catch(() => ({}))) as {
			ok?: boolean;
			userId?: string;
			requiresVerification?: boolean;
			error?: string;
		};
		if (!response.ok) throw new Error(body.error || 'Signup failed.');
		return body;
	});

export const fetchAdminAuthEmailSettings = () =>
	adminFetch<AdminAuthEmailSettings>('/api/admin/settings/auth-email');

export const updateAdminAuthEmailSettings = (settings: {
	signupsEnabled: boolean;
	mailProvider: 'off' | 'smtp' | 'resend';
	appUrl: string;
	fromName: string;
	fromEmail: string;
	resendApiKey?: string;
	smtp?: {
		host: string;
		port: number;
		username: string;
		password?: string;
		tls: boolean;
		authMethod: 'PLAIN' | 'LOGIN';
	};
}) =>
	adminFetch<{ ok: boolean } & AdminAuthEmailSettings>('/api/admin/settings/auth-email', {
		method: 'PUT',
		body: JSON.stringify(settings)
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

export const createAdminUser = (user: { email: string; password: string; is_admin?: boolean }) =>
	adminFetch<{ ok: boolean; user: AdminUserRow }>('/api/admin/users', {
		method: 'POST',
		body: JSON.stringify(user)
	});

export const patchAdminUser = (
	userId: string,
	patch: { is_admin?: boolean; disabled?: boolean }
) =>
	adminFetch<{ ok: boolean; user: AdminUserRow }>(`/api/admin/users/${userId}`, {
		method: 'PATCH',
		body: JSON.stringify(patch)
	});

export const resetAdminUserPassword = (userId: string) =>
	adminFetch<{ ok: boolean; password: string }>(`/api/admin/users/${userId}/reset-password`, {
		method: 'POST',
		body: JSON.stringify({})
	});
