const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Cache-Control': 'no-store'
};

const json = (payload, status = 200) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: {
			...corsHeaders,
			'Content-Type': 'application/json'
		}
	});

const sendJson = (res, payload, status = 200) => {
	if (res && typeof res.status === 'function' && typeof res.json === 'function') {
		for (const [key, value] of Object.entries(corsHeaders)) {
			res.setHeader(key, value);
		}
		res.setHeader('Content-Type', 'application/json');
		return res.status(status).json(payload);
	}

	return json(payload, status);
};

const sendEmpty = (res, status = 204) => {
	if (res && typeof res.status === 'function' && typeof res.end === 'function') {
		for (const [key, value] of Object.entries(corsHeaders)) {
			res.setHeader(key, value);
		}
		return res.status(status).end();
	}

	return new Response(null, {
		status,
		headers: corsHeaders
	});
};

const writeSseEvent = (res, event) => {
	res.write(`event: ${event.type}\n`);
	res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const getHeader = (request, name) => {
	if (typeof request.headers?.get === 'function') {
		return request.headers.get(name) || undefined;
	}

	const key = name.toLowerCase();
	return request.headers?.[key] || request.headers?.[name] || undefined;
};

const readJsonBody = async (request) => {
	if (typeof request.json === 'function') {
		return await request.json();
	}

	if (typeof request.body === 'string') {
		return request.body.trim() ? JSON.parse(request.body) : {};
	}

	if (request.body && typeof request.body === 'object') {
		return request.body;
	}

	return await new Promise((resolve, reject) => {
		let raw = '';

		request.on('data', (chunk) => {
			raw += chunk;
		});
		request.on('end', () => {
			try {
				resolve(raw.trim() ? JSON.parse(raw) : {});
			} catch (error) {
				reject(error);
			}
		});
		request.on('error', reject);
	});
};

let workspaceAiModulePromise;

const getWorkspaceAiHandler = async () => {
	workspaceAiModulePromise ||= import('../../server/workspace-ai.js');
	const workspaceAiModule = await workspaceAiModulePromise;
	const handleWorkspaceAiRequest =
		workspaceAiModule.handleWorkspaceAiRequest ||
		workspaceAiModule.default?.handleWorkspaceAiRequest;

	if (typeof handleWorkspaceAiRequest !== 'function') {
		throw new Error('Workspace AI handler is unavailable.');
	}

	return handleWorkspaceAiRequest;
};

const postHandler = async (request, res) => {
	const authorization = getHeader(request, 'Authorization');

	if (!authorization) {
		return sendJson(res, { error: 'Unauthorized' }, 401);
	}

	const body = await readJsonBody(request);
	const handleWorkspaceAiRequest = await getWorkspaceAiHandler();

	if (res && typeof res.writeHead === 'function') {
		res.writeHead(200, {
			...corsHeaders,
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		});

		try {
			const payload = await handleWorkspaceAiRequest(body, authorization, (progress) => {
				writeSseEvent(res, {
					type: 'progress',
					progress
				});
			});

			writeSseEvent(res, {
				type: 'final',
				response: payload
			});
		} catch (error) {
			writeSseEvent(res, {
				type: 'error',
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		} finally {
			res.end();
		}

		return;
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const sendEvent = (event) => {
				controller.enqueue(
					encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
				);
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
			...corsHeaders,
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};

const optionsHandler = () =>
	new Response(null, {
		status: 204,
		headers: corsHeaders
	});

const methodNotAllowedHandler = (request, res) =>
	sendJson(res, { error: 'Method Not Allowed' }, 405);

const handler = async (request, res) => {
	if (request.method === 'OPTIONS') {
		if (res) {
			return sendEmpty(res, 204);
		}
		return optionsHandler();
	}

	if (request.method === 'POST') {
		return postHandler(request, res);
	}

	return methodNotAllowedHandler(request, res);
};

export default handler;
export const POST = postHandler;
export const OPTIONS = optionsHandler;
export const GET = methodNotAllowedHandler;
export const HEAD = () => new Response(null, { status: 405, headers: corsHeaders });
