const payload = {
	ok: true,
	service: 'kainbu-hono-api',
	name: 'kainbu',
	endpoints: [
		'/api/health',
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

const handler = () =>
	Response.json(payload, {
		headers: {
			'Cache-Control': 'no-store'
		}
	});

module.exports = handler;
module.exports.default = handler;
module.exports.GET = handler;
module.exports.HEAD = () => new Response(null, { status: 200 });
