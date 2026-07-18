import { describe, expect, it, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimit, requestBodyLimit, resetRateLimitForTests } from '../server/security.js';
import {
	validateWorkspaceAiRequest,
	WorkspaceAiRequestError
} from '../server/workspace-ai/models.js';

describe('API abuse controls', () => {
	beforeEach(() => resetRateLimitForTests());

	it('returns 413 for an oversized declared body', async () => {
		const app = new Hono();
		app.post('/payload', requestBodyLimit(10), (c) => c.json({ ok: true }));
		const response = await app.request('/payload', {
			method: 'POST',
			headers: { 'Content-Length': '11' }
		});
		expect(response.status).toBe(413);
	});

	it('returns 429 and isolates buckets by authorization identity', async () => {
		const app = new Hono();
		app.post('/limited', rateLimit({ limit: 1, windowMs: 60_000 }), (c) => c.json({ ok: true }));
		const first = await app.request('/limited', {
			method: 'POST',
			headers: { Authorization: 'Bearer one' }
		});
		const blocked = await app.request('/limited', {
			method: 'POST',
			headers: { Authorization: 'Bearer one' }
		});
		const isolated = await app.request('/limited', {
			method: 'POST',
			headers: { Authorization: 'Bearer two' }
		});
		expect(first.status).toBe(200);
		expect(blocked.status).toBe(429);
		expect(isolated.status).toBe(200);
	});

	it('does not trust spoofed forwarding headers by default', async () => {
		const app = new Hono();
		app.post('/ip-limited', rateLimit({ limit: 1, windowMs: 60_000 }), (c) => c.json({ ok: true }));
		const first = await app.request('/ip-limited', {
			method: 'POST',
			headers: { 'X-Forwarded-For': '198.51.100.1' }
		});
		const spoofed = await app.request('/ip-limited', {
			method: 'POST',
			headers: { 'X-Forwarded-For': '203.0.113.9' }
		});
		expect(first.status).toBe(200);
		expect(spoofed.status).toBe(429);
	});

	it('rejects malformed nested AI history fields deterministically', () => {
		expect(() =>
			validateWorkspaceAiRequest({
				projectId: 'p',
				sessionId: 's',
				modelId: 'missing-model',
				history: [{ role: 'user', text: 42 }]
			})
		).toThrow(WorkspaceAiRequestError);
	});
});
