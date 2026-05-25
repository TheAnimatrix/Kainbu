import { randomUUID } from 'crypto';
import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';
import type { AiWorkspaceRequest, AiWorkspaceStreamEvent } from '../src/lib/kainbu/types.js';
import type { BackgroundTheme } from '../src/lib/kainbu/types.js';
import { DEFAULT_AI_MODEL_CONFIGS } from '../src/lib/kainbu/models.js';
import { getEnv } from './env.js';
import { getOpenRouterApiKey } from './openrouter-key.js';
import { extractUsageFromResponse } from './workspace-ai/openrouter-stream.js';
import { recordAiUsageEvent } from './ai-usage.js';
import { getAuthenticatedUserId } from './pocketbase.js';
import {
	handleAdminGetAiSettings,
	handleAdminGetAuthEmailSettings,
	handleAdminGetModelSettings,
	handleAdminListUsers,
	handleAdminMe,
	handleAdminPatchUser,
	handleAdminCreateUser,
	handleAdminResetUserPassword,
	handleAdminPutAuthEmailSettings,
	handleAdminPutAiSettings,
	handleAdminPutModelSettings,
	handleAdminUsageByModel,
	handleAdminUsageByUser,
	handleAdminUsageSummary,
	handleAuthSignup,
	handleGetAuthSettings
} from './admin.js';
import { loadAiModelCatalog } from './ai-models.js';
import { getWorkspaceAiModels, handleWorkspaceAiRequest } from './workspace-ai.js';
import {
	handleCliDeviceApprove,
	handleCliDeviceExchange,
	handleCliDevicePoll,
	handleCliDeviceStart
} from './cli-auth.js';
import {
	handleWorkspaceBoardPresenceRequest,
	handleWorkspaceCancelInviteRequest,
	handleWorkspaceCreateInviteRequest,
	handleWorkspaceLeaveProjectRequest,
	handleWorkspaceProjectBackgroundRequest,
	handleWorkspaceRemoveMemberRequest,
	handleWorkspaceRespondInviteRequest,
	handleWorkspaceScratchpadRequest,
	handleWorkspaceTouchProjectRequest,
	handleWorkspacePinProjectRequest,
	toWorkspaceApiError
} from './workspace.js';

const app = new Hono();
const healthPayload = {
	ok: true,
	service: 'kainbu-hono-api'
};
const apiRootPayload = {
	ok: true,
	service: 'kainbu-hono-api',
	name: 'kainbu',
	endpoints: [
		'/api/health',
		'/api/models',
		'/api/workspace-ai',
		'/api/workspace-ai/session-title',
		'/api/workspace-ai/task-title',
		'/api/workspace-ai/stream',
		'/api/workspace/projects/touch',
		'/api/workspace/projects/pin',
		'/api/workspace/projects/background',
		'/api/workspace/projects/scratchpad',
		'/api/workspace/...'
	]
};
const methodNotAllowedPayload = { error: 'Method Not Allowed' };
const UTILITY_AI_MODEL = DEFAULT_AI_MODEL_CONFIGS[0]?.model || 'google/gemini-3-flash-preview:nitro';
const SESSION_TITLE_MAX_TOKENS = 20;
const SESSION_TITLE_SYSTEM_PROMPT =
	'Generate a short title (3-6 words) for this conversation. Return only the title, no quotes or punctuation.';

const TASK_TITLE_MAX_TOKENS = 48;
const TASK_TITLE_MAX_LENGTH = 120;
const TASK_TITLE_SYSTEM_PROMPT =
	'Rewrite this Kanban task title so it is clearer, specific, and actionable. Return only the rewritten title with no quotes, markdown list syntax, or extra commentary.';

const normalizeUtilityModelText = (value: string) =>
	value
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/^[-*+]\s+\[[ xX]\]\s+/i, '')
		.trim();

app.use(
	'*',
	cors({
		origin: '*',
		allowHeaders: ['Authorization', 'Content-Type'],
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS']
	})
);

app.get('/health', (c) => c.json(healthPayload));
app.get('/api', (c) => c.json(apiRootPayload));
app.get('/api/', (c) => c.json(apiRootPayload));
app.get('/api/health', (c) => c.json(healthPayload));
app.get('/api/models', async (c) => {
	await loadAiModelCatalog({ fresh: true });
	c.header('Cache-Control', 'no-store');
	return c.json(getWorkspaceAiModels());
});
app.get('/api/auth/settings', handleGetAuthSettings);
app.post('/api/auth/signup', handleAuthSignup);

const handleWorkspaceMutationError = (c: Context, error: unknown) => {
	const { status, message } = toWorkspaceApiError(error);
	return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
};

const methodNotAllowed = (c: Context) => c.json(methodNotAllowedPayload, 405);

const generateSessionTitle = async (
	userMessage: string,
	assistantReply: string,
	options: { userId?: string; requestId?: string } = {}
) => {
	const apiKey = await getOpenRouterApiKey();
	if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://kainbu.app',
			'X-Title': 'Kainbu'
		},
		body: JSON.stringify({
			model: UTILITY_AI_MODEL,
			max_tokens: SESSION_TITLE_MAX_TOKENS,
			messages: [
				{ role: 'system', content: SESSION_TITLE_SYSTEM_PROMPT },
				{
					role: 'user',
					content: `User: ${userMessage}\n\nAssistant: ${assistantReply}`
				}
			]
		})
	});

	if (!response.ok) {
		throw new Error(`OpenRouter error: ${await response.text()}`);
	}

	const data = await response.json();
	if (options.userId) {
		void recordAiUsageEvent({
			userId: options.userId,
			model: UTILITY_AI_MODEL,
			requestId: options.requestId,
			usage: extractUsageFromResponse(data),
			source: 'title-gen'
		});
	}

	const parsed = data as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	return normalizeUtilityModelText(parsed.choices?.[0]?.message?.content || '');
};

const generateTaskTitle = async (
	title: string,
	description: string,
	columnTitle: string,
	options: { userId?: string; requestId?: string } = {}
) => {
	const apiKey = await getOpenRouterApiKey();
	if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

	const contextLines = [`Current title: ${title}`];
	if (columnTitle) contextLines.push(`Column: ${columnTitle}`);
	if (description) contextLines.push(`Description:\n${description}`);

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://kainbu.app',
			'X-Title': 'Kainbu'
		},
		body: JSON.stringify({
			model: UTILITY_AI_MODEL,
			max_tokens: TASK_TITLE_MAX_TOKENS,
			messages: [
				{ role: 'system', content: TASK_TITLE_SYSTEM_PROMPT },
				{ role: 'user', content: contextLines.join('\n\n') }
			]
		})
	});

	if (!response.ok) {
		throw new Error(`OpenRouter error: ${await response.text()}`);
	}

	const data = await response.json();
	if (options.userId) {
		void recordAiUsageEvent({
			userId: options.userId,
			model: UTILITY_AI_MODEL,
			requestId: options.requestId,
			usage: extractUsageFromResponse(data),
			source: 'title-gen'
		});
	}

	const parsed = data as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	return normalizeUtilityModelText(parsed.choices?.[0]?.message?.content || '');
};

app.post('/api/workspace-ai', async (c) => {
	try {
		await loadAiModelCatalog();
		const body = (await c.req.json()) as AiWorkspaceRequest;
		const payload = await handleWorkspaceAiRequest(body, c.req.header('Authorization'));
		return c.json(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		const status =
			error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
				? (error.status as number)
				: message === 'Unauthorized'
					? 401
					: 500;
		return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
	}
});
app.get('/api/workspace-ai', methodNotAllowed);
app.get('/api/workspace-ai/stream', methodNotAllowed);
app.get('/api/workspace-ai/session-title', methodNotAllowed);
app.get('/api/workspace-ai/task-title', methodNotAllowed);

app.post('/api/workspace-ai/stream', async (c) => {
	await loadAiModelCatalog();
	const body = (await c.req.json()) as AiWorkspaceRequest;
	const authorization = c.req.header('Authorization');
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const sendEvent = (event: AiWorkspaceStreamEvent) => {
				try {
					controller.enqueue(
						encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
					);
				} catch (error) {
					// Ignore disconnected clients naturally
				}
			};

			try {
				const payload = await handleWorkspaceAiRequest(body, authorization, (progress) => {
					sendEvent({
						type: 'progress',
						progress
					});
				});

				sendEvent({
					type: 'final',
					response: payload
				});
			} catch (error) {
				sendEvent({
					type: 'error',
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
});

app.post('/api/workspace-ai/session-title', async (c) => {
	if (!c.req.header('Authorization')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = (await c.req.json()) as {
			userMessage?: string;
			assistantReply?: string;
		};
		const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
		const assistantReply =
			typeof body.assistantReply === 'string' ? body.assistantReply.trim() : '';

		if (!userMessage) {
			return c.json({ error: 'userMessage is required' }, 400);
		}

		const userId = await getAuthenticatedUserId(c.req.header('Authorization'));
		const title = await generateSessionTitle(userMessage, assistantReply, {
			userId,
			requestId: randomUUID()
		});
		if (!title || title.length > 60) {
			return c.json({ title: '' });
		}

		return c.json({ title });
	} catch (error) {
		console.error('Session title generation failed:', error);
		return c.json({ title: '' });
	}
});

app.post('/api/workspace-ai/task-title', async (c) => {
	if (!c.req.header('Authorization')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = (await c.req.json()) as {
			title?: string;
			description?: string;
			columnTitle?: string;
		};
		const title = typeof body.title === 'string' ? body.title.trim() : '';
		const description =
			typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
		const columnTitle = typeof body.columnTitle === 'string' ? body.columnTitle.trim() : '';

		if (!title) {
			return c.json({ error: 'title is required' }, 400);
		}

		const userId = await getAuthenticatedUserId(c.req.header('Authorization'));
		const rewritten = await generateTaskTitle(title, description, columnTitle, {
			userId,
			requestId: randomUUID()
		});
		if (!rewritten) {
			return c.json({ error: 'AI did not return a rewritten title.' }, 502);
		}
		if (rewritten.length > TASK_TITLE_MAX_LENGTH) {
			return c.json({ error: 'Rewritten title was too long.' }, 502);
		}

		return c.json({ title: rewritten });
	} catch (error) {
		console.error('Task title rewrite failed:', error);
		const message = error instanceof Error ? error.message : 'Task title rewrite failed';
		return c.json({ error: message, title: '' }, 502);
	}
});

app.post('/api/workspace/projects/touch', async (c) => {
	try {
		const payload = await handleWorkspaceTouchProjectRequest(
			(await c.req.json()) as { projectId: string },
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/boards/presence', async (c) => {
	try {
		const payload = await handleWorkspaceBoardPresenceRequest(
			(await c.req.json()) as { projectId: string; boardId: string | null },
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/projects/pin', async (c) => {
	try {
		const payload = await handleWorkspacePinProjectRequest(
			(await c.req.json()) as { projectId: string; pinned?: boolean },
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/projects/scratchpad', async (c) => {
	try {
		const payload = await handleWorkspaceScratchpadRequest(
			(await c.req.json()) as {
				projectId: string;
				scratchpadData: string;
				expectedRevision: number;
			},
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/projects/background', async (c) => {
	try {
		const payload = await handleWorkspaceProjectBackgroundRequest(
			(await c.req.json()) as {
				projectId: string;
				backgroundTheme: BackgroundTheme | null;
			},
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/invites/create', async (c) => {
	try {
		const payload = await handleWorkspaceCreateInviteRequest(
			(await c.req.json()) as {
				projectId: string;
				inviteeEmail: string;
			},
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/invites/respond', async (c) => {
	try {
		const payload = await handleWorkspaceRespondInviteRequest(
			(await c.req.json()) as {
				inviteId: string;
				accept: boolean;
			},
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/invites/cancel', async (c) => {
	try {
		const payload = await handleWorkspaceCancelInviteRequest(
			(await c.req.json()) as { inviteId: string },
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/members/remove', async (c) => {
	try {
		const payload = await handleWorkspaceRemoveMemberRequest(
			(await c.req.json()) as {
				projectId: string;
				memberUserId: string;
			},
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.post('/api/workspace/members/leave', async (c) => {
	try {
		const payload = await handleWorkspaceLeaveProjectRequest(
			(await c.req.json()) as { projectId: string },
			c.req.header('Authorization')
		);
		return c.json(payload);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

app.get('/api/admin/me', handleAdminMe);
app.get('/api/admin/settings/ai', handleAdminGetAiSettings);
app.put('/api/admin/settings/ai', handleAdminPutAiSettings);
app.get('/api/admin/settings/auth-email', handleAdminGetAuthEmailSettings);
app.put('/api/admin/settings/auth-email', handleAdminPutAuthEmailSettings);
app.get('/api/admin/settings/models', handleAdminGetModelSettings);
app.put('/api/admin/settings/models', handleAdminPutModelSettings);
app.get('/api/admin/usage/summary', handleAdminUsageSummary);
app.get('/api/admin/usage/by-model', handleAdminUsageByModel);
app.get('/api/admin/usage/by-user', handleAdminUsageByUser);
app.get('/api/admin/users', handleAdminListUsers);
app.post('/api/admin/users', handleAdminCreateUser);
app.patch('/api/admin/users/:id', handleAdminPatchUser);
app.post('/api/admin/users/:id/reset-password', handleAdminResetUserPassword);

app.onError((error, c) => {
	console.error('[api] unhandled error', error);
	const { status, message } = toWorkspaceApiError(error);
	return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
});

app.post('/api/cli/device/start', handleCliDeviceStart);
app.post('/api/cli/device/poll', handleCliDevicePoll);
app.post('/api/cli/device/exchange', handleCliDeviceExchange);
app.post('/api/cli/device/approve', async (c) => {
	try {
		return await handleCliDeviceApprove(c);
	} catch (error) {
		return handleWorkspaceMutationError(c, error);
	}
});

export default app;
