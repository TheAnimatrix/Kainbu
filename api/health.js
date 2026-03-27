const payload = {
	ok: true,
	service: 'kainbu-hono-api'
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
