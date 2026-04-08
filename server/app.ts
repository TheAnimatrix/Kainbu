import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';
import type { AiWorkspaceRequest, AiWorkspaceStreamEvent } from '../src/lib/kainbu/types.js';
import type { BackgroundTheme } from '../src/lib/kainbu/types.js';
import { getWorkspaceAiModels, handleWorkspaceAiRequest } from './workspace-ai.js';
import {
	handleWorkspaceCancelInviteRequest,
	handleWorkspaceCreateInviteRequest,
	handleWorkspaceLeaveProjectRequest,
	handleWorkspaceProjectBackgroundRequest,
	handleWorkspaceRemoveMemberRequest,
	handleWorkspaceRespondInviteRequest,
	handleWorkspaceScratchpadRequest,
	handleWorkspaceTouchProjectRequest,
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
		'/api/workspace-ai/stream',
		'/api/workspace/projects/touch',
		'/api/workspace/projects/background',
		'/api/workspace/projects/scratchpad',
		'/api/workspace/...'
	]
};

app.use(
	'*',
	cors({
		origin: '*',
		allowHeaders: ['Authorization', 'Content-Type'],
		allowMethods: ['GET', 'POST', 'OPTIONS']
	})
);

app.get('/health', (c) => c.json(healthPayload));
app.get('/api', (c) => c.json(apiRootPayload));
app.get('/api/', (c) => c.json(apiRootPayload));
app.get('/api/health', (c) => c.json(healthPayload));
app.get('/api/models', (c) => c.json(getWorkspaceAiModels()));

const handleWorkspaceMutationError = (c: Context, error: unknown) => {
	const { status, message } = toWorkspaceApiError(error);
	return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
};

app.post('/api/workspace-ai', async (c) => {
	try {
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

app.post('/api/workspace-ai/stream', async (c) => {
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

export default app;
