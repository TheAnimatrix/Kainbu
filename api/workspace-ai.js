const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Cache-Control': 'no-store',
	'Content-Type': 'application/json'
};

const json = (payload, status = 200) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: corsHeaders
	});

let workspaceAiModulePromise;

const getWorkspaceAiHandler = async () => {
	workspaceAiModulePromise ||= import('../server/workspace-ai.js');
	const workspaceAiModule = await workspaceAiModulePromise;
	const handleWorkspaceAiRequest =
		workspaceAiModule.handleWorkspaceAiRequest ||
		workspaceAiModule.default?.handleWorkspaceAiRequest;

	if (typeof handleWorkspaceAiRequest !== 'function') {
		throw new Error('Workspace AI handler is unavailable.');
	}

	return handleWorkspaceAiRequest;
};

const postHandler = async (request) => {
	try {
		const authorization = request.headers.get('Authorization') || undefined;

		if (!authorization) {
			return json({ error: 'Unauthorized' }, 401);
		}

		const body = await request.json();
		const handleWorkspaceAiRequest = await getWorkspaceAiHandler();
		const payload = await handleWorkspaceAiRequest(body, authorization);
		return json(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		const status = message === 'Unauthorized' ? 401 : 500;
		return json({ error: message }, status);
	}
};

const optionsHandler = () =>
	new Response(null, {
		status: 204,
		headers: corsHeaders
	});

const methodNotAllowedHandler = () => json({ error: 'Method Not Allowed' }, 405);

const handler = async (request) => {
	if (request.method === 'OPTIONS') {
		return optionsHandler();
	}

	if (request.method === 'POST') {
		return postHandler(request);
	}

	return methodNotAllowedHandler();
};

module.exports = handler;
module.exports.default = handler;
module.exports.POST = postHandler;
module.exports.OPTIONS = optionsHandler;
module.exports.GET = methodNotAllowedHandler;
module.exports.HEAD = () => new Response(null, { status: 405, headers: corsHeaders });
