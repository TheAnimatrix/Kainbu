const payload = {
	ok: true,
	service: 'kainbu-hono-api'
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
