const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Cache-Control': 'no-store',
	'Content-Type': 'application/json'
};

const jsonResponse = (payload, status = 200) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: corsHeaders
	});

const sendJson = (res, payload, status = 200) => {
	if (res && typeof res.status === 'function' && typeof res.json === 'function') {
		for (const [key, value] of Object.entries(corsHeaders)) {
			res.setHeader(key, value);
		}
		return res.status(status).json(payload);
	}

	return jsonResponse(payload, status);
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

const optionsHandler = () =>
	new Response(null, {
		status: 204,
		headers: corsHeaders
	});

const methodNotAllowedHandler = (request, res) => sendJson(res, { error: 'Method Not Allowed' }, 405);

let workspaceModulePromise;

const getWorkspaceModule = async () => {
	workspaceModulePromise ||= import('./workspace.js');
	const workspaceModule = await workspaceModulePromise;
	return workspaceModule.default && typeof workspaceModule.default === 'object'
		? { ...workspaceModule.default, ...workspaceModule }
		: workspaceModule;
};

export const createWorkspaceEndpoint = (handlerName) => {
	const postHandler = async (request, res) => {
		let toWorkspaceApiError = (error) => ({
			status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500,
			message: error instanceof Error ? error.message : 'Unknown error'
		});

		try {
			const authorization = getHeader(request, 'Authorization');
			if (!authorization) {
				return sendJson(res, { error: 'Unauthorized' }, 401);
			}

			const body = await readJsonBody(request);
			const workspace = await getWorkspaceModule();
			toWorkspaceApiError = workspace.toWorkspaceApiError;
			return sendJson(res, await workspace[handlerName](body, authorization));
		} catch (error) {
			const { status, message } = toWorkspaceApiError(error);
			return sendJson(res, { error: message }, status);
		}
	};

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

	return {
		handler,
		postHandler,
		optionsHandler,
		methodNotAllowedHandler
	};
};
