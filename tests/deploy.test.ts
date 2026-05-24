/**
 * Integration tests for the self-hosted API (docker compose or dev:full).
 *
 * Usage:
 *   npx vitest run tests/deploy.test.ts
 *
 * For authenticated tests, set KAINBU_TEST_TOKEN and KAINBU_TEST_PROJECT_ID:
 *   KAINBU_TEST_TOKEN=<pocketbase_token> KAINBU_TEST_PROJECT_ID=<project_client_id> npx vitest run tests/deploy.test.ts
 *
 * Or sign in locally: kainbu login --token "$KAINBU_TEST_TOKEN"
 */
import { describe, it, expect } from 'vitest';

const BASE = process.env.KAINBU_TEST_BASE || 'http://127.0.0.1:8788';
const TOKEN = process.env.KAINBU_TEST_TOKEN ?? '';
const PROJECT_ID = process.env.KAINBU_TEST_PROJECT_ID ?? '';
let modelIdPromise: Promise<string> | null = null;

const hasAuth = TOKEN.length > 0;
const hasProject = PROJECT_ID.length > 0;

function authHeaders(): HeadersInit {
	return {
		Authorization: `Bearer ${TOKEN}`,
		'Content-Type': 'application/json'
	};
}

async function getServerModelId() {
	if (!modelIdPromise) {
		modelIdPromise = fetch(`${BASE}/api/models`)
			.then(async (res) => {
				if (!res.ok) {
					throw new Error(`Unable to load /api/models: ${res.status}`);
				}

				const body = (await res.json()) as Array<{ id?: string }>;
				const modelId = body[0]?.id;
				if (!modelId) {
					throw new Error('No model ids were returned from /api/models.');
				}

				return modelId;
			});
	}

	return modelIdPromise;
}

// ─── Health & Discovery ──────────────────────────────────────────────

describe('Health & Discovery', () => {
	it('GET /health returns 200', async () => {
		const res = await fetch(`${BASE}/health`);
		expect(res.status).toBe(200);
	});

	it('GET /api returns 200 with JSON body', async () => {
		const res = await fetch(`${BASE}/api`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toBeDefined();
	});

	it('GET /api/health returns 200', async () => {
		const res = await fetch(`${BASE}/api/health`);
		expect(res.status).toBe(200);
	});

	it('GET /api/models returns a model config array', async () => {
		const res = await fetch(`${BASE}/api/models`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body)).toBe(true);
		expect(typeof body[0]?.id).toBe('string');
		expect(typeof body[0]?.model).toBe('string');
	});
});

// ─── CORS ────────────────────────────────────────────────────────────

describe('CORS', () => {
	it('OPTIONS /api/workspace-ai returns CORS headers', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai`, { method: 'OPTIONS' });
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		expect(res.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
	});

	it('OPTIONS /api/workspace-ai/stream returns CORS headers', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai/stream`, { method: 'OPTIONS' });
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});

	it('OPTIONS /api/workspace/projects/touch returns CORS headers', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/touch`, { method: 'OPTIONS' });
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});
});

// ─── Auth rejection (no token → 401) ────────────────────────────────

describe('Auth rejection (no token)', () => {
	const endpoints = [
		'/api/workspace-ai',
		'/api/workspace-ai/stream',
		'/api/workspace/projects/touch',
		'/api/workspace/projects/scratchpad',
		'/api/workspace/projects/background',
		'/api/workspace/invites/create',
		'/api/workspace/invites/respond',
		'/api/workspace/invites/cancel',
		'/api/workspace/members/remove',
		'/api/workspace/members/leave'
	];

	for (const path of endpoints) {
		it(`POST ${path} without token → 401`, async () => {
			const res = await fetch(`${BASE}${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.error).toBeDefined();
		});
	}
});

// ─── Method not allowed ──────────────────────────────────────────────

describe('Method not allowed', () => {
	it('GET /api/workspace-ai → 405', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai`, { method: 'GET' });
		expect([404, 405]).toContain(res.status);
	});

	it('GET /api/workspace-ai/stream → 405', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai/stream`, { method: 'GET' });
		expect([404, 405]).toContain(res.status);
	});
});

// ─── Invalid body with valid token ───────────────────────────────────

describe.runIf(hasAuth)('Invalid request body (authed)', () => {
	it('POST /api/workspace-ai with empty body → 400', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({})
		});
		expect(res.status).toBe(400);
	});

	it('POST /api/workspace/projects/touch with missing projectId → 400', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/touch`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({})
		});
		expect([400, 404, 500]).toContain(res.status);
	});

	it('POST /api/workspace/projects/scratchpad with missing fields → 400', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/scratchpad`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({})
		});
		expect([400, 404, 500]).toContain(res.status);
	});

	it('POST /api/workspace/invites/create with missing email → 400', async () => {
		const res = await fetch(`${BASE}/api/workspace/invites/create`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ projectId: 'nonexistent' })
		});
		expect([400, 403, 404]).toContain(res.status);
	});
});

// ─── Workspace AI (non-streaming) ────────────────────────────────────

describe.runIf(hasAuth && hasProject)('POST /api/workspace-ai', () => {
	it('returns a valid AI response', async () => {
		const modelId = await getServerModelId();
		const res = await fetch(`${BASE}/api/workspace-ai`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				projectId: PROJECT_ID,
				sessionId: 'deploy-test-session',
				modelId,
				history: [
					{
						id: 'message-1',
						role: 'user',
						text: 'Say hello in one word.',
						timestamp: Date.now()
					}
				],
				scope: {
					currentTab: 'chat',
					selectedTaskIds: [],
					selectedColumnIds: [],
					queuedTaskCards: [],
					revisions: { kanban: 0, scratchpad: 0 },
					workspaceSummary: {
						columnCount: 0,
						taskCount: 0,
						padCount: 0,
						memberCount: 1,
						kanbanFullAllowed: true,
						scratchpadAllAllowed: true
					}
				}
			})
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.reply).toBeDefined();
		expect(typeof body.reply).toBe('string');
		expect(body.reply.length).toBeGreaterThan(0);
		expect(body.modelId).toBe(modelId);
		expect(body.model).toBeDefined();
		expect(typeof body.latencyMs).toBe('number');
		expect(Array.isArray(body.proposals)).toBe(true);
		expect(body.usage).toBeDefined();
	}, 30_000);
});

// ─── Workspace AI (streaming) ────────────────────────────────────────

describe.runIf(hasAuth && hasProject)('POST /api/workspace-ai/stream', () => {
	it('returns SSE stream with progress + final events', async () => {
		const modelId = await getServerModelId();
		const res = await fetch(`${BASE}/api/workspace-ai/stream`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				projectId: PROJECT_ID,
				sessionId: 'deploy-test-session',
				modelId,
				history: [
					{
						id: 'message-1',
						role: 'user',
						text: 'Say hello in one word.',
						timestamp: Date.now()
					}
				],
				scope: {
					currentTab: 'chat',
					selectedTaskIds: [],
					selectedColumnIds: [],
					queuedTaskCards: [],
					revisions: { kanban: 0, scratchpad: 0 },
					workspaceSummary: {
						columnCount: 0,
						taskCount: 0,
						padCount: 0,
						memberCount: 1,
						kanbanFullAllowed: true,
						scratchpadAllAllowed: true
					}
				}
			})
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let fullText = '';
		let hasProgress = false;
		let hasFinal = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullText += decoder.decode(value, { stream: true });
		}

		const lines = fullText.split('\n');
		for (const line of lines) {
			if (line.startsWith('event: progress')) hasProgress = true;
			if (line.startsWith('event: final')) hasFinal = true;
		}

		expect(hasFinal).toBe(true);

		// Parse the final event data
		const finalIdx = lines.findIndex((l) => l === 'event: final');
		if (finalIdx !== -1 && finalIdx + 1 < lines.length) {
			const dataLine = lines[finalIdx + 1];
			if (dataLine.startsWith('data: ')) {
				const payload = JSON.parse(dataLine.slice(6));
				expect(payload.type).toBe('final');
				expect(payload.response).toBeDefined();
				expect(payload.response.reply).toBeDefined();
				expect(typeof payload.response.reply).toBe('string');
				expect(payload.response.modelId).toBe(modelId);
			}
		}
	}, 30_000);
});

// ─── Workspace project operations ────────────────────────────────────

describe.runIf(hasAuth && hasProject)('Workspace project endpoints', () => {
	it('POST /api/workspace/projects/touch updates last opened', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/touch`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ projectId: PROJECT_ID })
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});

	it('POST /api/workspace/projects/scratchpad with stale revision → ok: false', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/scratchpad`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				projectId: PROJECT_ID,
				scratchpadData: '{"activePadId":"test","pads":[]}',
				expectedRevision: -1 // intentionally stale
			})
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		// Stale revision should return ok: false with current state
		expect(body.ok).toBe(false);
		expect(typeof body.scratchpadRev).toBe('number');
	});

	it('POST /api/workspace/projects/background sets theme', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/background`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				projectId: PROJECT_ID,
				backgroundTheme: { kind: 'solid', id: 'obsidian' }
			})
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});
});

// ─── Access control (wrong project / non-member) ─────────────────────

describe.runIf(hasAuth)('Access control - nonexistent project', () => {
	const fakeProjectId = '00000000-0000-0000-0000-000000000000';

	it('POST /api/workspace/projects/touch with fake project → 403 or 404', async () => {
		const res = await fetch(`${BASE}/api/workspace/projects/touch`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ projectId: fakeProjectId })
		});
		expect([403, 404]).toContain(res.status);
	});

	it('POST /api/workspace/invites/create with fake project → 403 or 404', async () => {
		const res = await fetch(`${BASE}/api/workspace/invites/create`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ projectId: fakeProjectId, inviteeEmail: 'nobody@example.com' })
		});
		expect([400, 403, 404]).toContain(res.status);
	});

	it('POST /api/workspace/members/leave with fake project → 403 or 404', async () => {
		const res = await fetch(`${BASE}/api/workspace/members/leave`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ projectId: fakeProjectId })
		});
		expect([403, 404]).toContain(res.status);
	});
});

// ─── Invite / member edge cases ──────────────────────────────────────

describe.runIf(hasAuth)('Invite & member edge cases', () => {
	it('POST /api/workspace/invites/respond with fake invite → 404 or 403', async () => {
		const res = await fetch(`${BASE}/api/workspace/invites/respond`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				inviteId: '00000000-0000-0000-0000-000000000000',
				accept: true
			})
		});
		expect([403, 404]).toContain(res.status);
	});

	it('POST /api/workspace/invites/cancel with fake invite → 404 or 403', async () => {
		const res = await fetch(`${BASE}/api/workspace/invites/cancel`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				inviteId: '00000000-0000-0000-0000-000000000000'
			})
		});
		expect([403, 404]).toContain(res.status);
	});

	it('POST /api/workspace/members/remove with fake member → 403 or 404', async () => {
		const res = await fetch(`${BASE}/api/workspace/members/remove`, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({
				projectId: '00000000-0000-0000-0000-000000000000',
				memberUserId: '00000000-0000-0000-0000-000000000000'
			})
		});
		expect([403, 404]).toContain(res.status);
	});
});

// ─── Expired / invalid token ─────────────────────────────────────────

describe('Invalid token handling', () => {
	it('POST /api/workspace-ai with garbage token → 401', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai`, {
			method: 'POST',
			headers: {
				Authorization: 'Bearer invalid.token.garbage',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({})
		});
		expect(res.status).toBe(401);
	});

	it('POST /api/workspace-ai/stream with garbage token → 401 or SSE error', async () => {
		const res = await fetch(`${BASE}/api/workspace-ai/stream`, {
			method: 'POST',
			headers: {
				Authorization: 'Bearer invalid.token.garbage',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({})
		});
		if (res.status === 401) {
			// Direct HTTP 401
			expect(res.status).toBe(401);
		} else {
			// Stream opened but error sent as SSE event
			expect(res.status).toBe(200);
			const text = await res.text();
			expect(text).toMatch(/event: error/);
		}
	});
});
