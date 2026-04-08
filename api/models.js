const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Cache-Control': 'no-store',
	'Content-Type': 'application/json'
};

const json = (payload, status = 200) =>
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

let workspaceAiModulePromise;

const getWorkspaceAiModels = async () => {
	workspaceAiModulePromise ||= import('../server/workspace-ai.js');
	const workspaceAiModule = await workspaceAiModulePromise;
	const getter = workspaceAiModule.getWorkspaceAiModels || workspaceAiModule.default?.getWorkspaceAiModels;

	if (typeof getter !== 'function') {
		throw new Error('Workspace AI model catalog is unavailable.');
	}

	return getter();
};

const getHandler = async (_request, res) => {
	try {
		return sendJson(res, await getWorkspaceAiModels());
	} catch (error) {
		return sendJson(res, { error: error instanceof Error ? error.message : 'Unknown error' }, 500);
	}
};

const optionsHandler = () =>
	new Response(null, {
		status: 204,
		headers: corsHeaders
	});

const methodNotAllowedHandler = (_request, res) =>
	sendJson(res, { error: 'Method Not Allowed' }, 405);

const handler = async (request, res) => {
	if (request.method === 'OPTIONS') {
		if (res) {
			return sendEmpty(res, 204);
		}
		return optionsHandler();
	}

	if (request.method === 'GET') {
		return getHandler(request, res);
	}

	return methodNotAllowedHandler(request, res);
};

export default handler;
export const GET = getHandler;
export const OPTIONS = optionsHandler;
export const POST = methodNotAllowedHandler;
export const HEAD = () => new Response(null, { status: 405, headers: corsHeaders });
