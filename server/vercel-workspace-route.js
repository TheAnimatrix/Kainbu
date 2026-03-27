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

const optionsHandler = () =>
	new Response(null, {
		status: 204,
		headers: corsHeaders
	});

const methodNotAllowedHandler = () => json({ error: 'Method Not Allowed' }, 405);

let workspaceModulePromise;

const getWorkspaceModule = async () => {
	workspaceModulePromise ||= import('./workspace.js');
	const workspaceModule = await workspaceModulePromise;
	return workspaceModule.default && typeof workspaceModule.default === 'object'
		? { ...workspaceModule.default, ...workspaceModule }
		: workspaceModule;
};

const createWorkspaceEndpoint = (handlerName) => {
	const postHandler = async (request) => {
		let toWorkspaceApiError = (error) => ({
			status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500,
			message: error instanceof Error ? error.message : 'Unknown error'
		});

		try {
			const authorization = request.headers.get('Authorization') || undefined;
			if (!authorization) {
				return json({ error: 'Unauthorized' }, 401);
			}

			const body = await request.json();
			const workspace = await getWorkspaceModule();
			toWorkspaceApiError = workspace.toWorkspaceApiError;
			return json(await workspace[handlerName](body, authorization));
		} catch (error) {
			const { status, message } = toWorkspaceApiError(error);
			return json({ error: message }, status);
		}
	};

	const handler = async (request) => {
		if (request.method === 'OPTIONS') {
			return optionsHandler();
		}

		if (request.method === 'POST') {
			return postHandler(request);
		}

		return methodNotAllowedHandler();
	};

	return {
		handler,
		postHandler,
		optionsHandler,
		methodNotAllowedHandler
	};
};

module.exports = {
	createWorkspaceEndpoint
};
