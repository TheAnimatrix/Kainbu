import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeWorkspaceApi, setWorkspaceApiConfig } from '../src/lib/kainbu/workspaceApi';

describe('workspace API client', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('classifies lowercase HTML error responses as deployment/API route failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				return new Response('<!doctype html><html><body>error code: 1033</body></html>', {
					status: 530,
					headers: { 'content-type': 'text/html' }
				});
			})
		);

		setWorkspaceApiConfig({
			getApiBaseUrl: () => 'https://kainbu.example.test',
			getAccessToken: async () => 'kbu_v1_test_token'
		});

		await expect(invokeWorkspaceApi('/api/me', { method: 'GET' })).rejects.toThrow(
			'Workspace API returned HTML for /api/me. The deployment is missing that API route.'
		);
	});

	it('retries once after refreshing credentials on 401', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'user_1', email: 'a@example.com' }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		const refreshAccessToken = vi.fn(async () => 'refreshed-token');

		setWorkspaceApiConfig({
			getApiBaseUrl: () => 'https://kainbu.example.test',
			getAccessToken: async () => 'stale-token',
			refreshAccessToken
		});

		await expect(invokeWorkspaceApi('/api/me', { method: 'GET' })).resolves.toEqual({
			id: 'user_1',
			email: 'a@example.com'
		});
		expect(refreshAccessToken).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not replay a non-idempotent mutation after 401 or 403', async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const refreshAccessToken = vi.fn(async () => 'refreshed-token');
		setWorkspaceApiConfig({
			getApiBaseUrl: () => 'https://kainbu.example.test',
			getAccessToken: async () => 'stale-token',
			refreshAccessToken
		});

		await expect(invokeWorkspaceApi('/api/workspace/projects/create', { method: 'POST', body: { name: 'x' } })).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(refreshAccessToken).not.toHaveBeenCalled();
	});
});
