const payload = {
	ok: true,
	service: 'kainbu-hono-api',
	name: 'kainbu',
	endpoints: [
		'/api/health',
		'/api/models',
		'/api/workspace-ai',
		'/api/workspace/projects/touch',
		'/api/workspace/projects/background',
		'/api/workspace/projects/scratchpad',
		'/api/workspace/invites/create',
		'/api/workspace/invites/respond',
		'/api/workspace/invites/cancel',
		'/api/workspace/members/remove',
		'/api/workspace/members/leave'
	]
};

const sendJson = (res, body, status = 200) => {
	if (res && typeof res.status === 'function' && typeof res.json === 'function') {
		res.setHeader('Cache-Control', 'no-store');
		return res.status(status).json(body);
	}

	return Response.json(body, {
		status,
		headers: {
			'Cache-Control': 'no-store'
		}
	});
};

const handler = (_request, res) => sendJson(res, payload);

export default handler;
export const GET = handler;
export const HEAD = () => new Response(null, { status: 200 });
