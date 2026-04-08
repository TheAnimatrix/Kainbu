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

const SESSION_TITLE_MODEL = 'openai/gpt-oss-safeguard-20b';
const SESSION_TITLE_MAX_TOKENS = 20;
const SESSION_TITLE_SYSTEM_PROMPT =
	'Generate a short title (3-6 words) for this conversation. Return only the title, no quotes or punctuation.';

let envModulePromise;

const getOpenRouterKey = async () => {
	envModulePromise ||= import('../../server/env.js');
	const envModule = await envModulePromise;
	const getEnv = envModule.getEnv || envModule.default?.getEnv;
	if (typeof getEnv !== 'function') {
		throw new Error('Unable to load environment configuration.');
	}
	const key = getEnv('OPENROUTER_API_KEY', '');
	if (!key) throw new Error('Missing OPENROUTER_API_KEY');
	return key;
};

const generateTitle = async (userMessage, assistantReply) => {
	const apiKey = await getOpenRouterKey();

	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://kainbu.test',
			'X-Title': 'Kainbu'
		},
		body: JSON.stringify({
			model: SESSION_TITLE_MODEL,
			max_tokens: SESSION_TITLE_MAX_TOKENS,
			messages: [
				{ role: 'system', content: SESSION_TITLE_SYSTEM_PROMPT },
				{
					role: 'user',
					content: `User: ${userMessage}\n\nAssistant: ${assistantReply}`
				}
			]
		})
	});

	if (!res.ok) {
		throw new Error('OpenRouter error: ' + (await res.text()));
	}

	const data = await res.json();
	return (data.choices?.[0]?.message?.content || '').trim();
};

const postHandler = async (request, res) => {
	const authorization = getHeader(request, 'Authorization');

	if (!authorization) {
		return sendJson(res, { error: 'Unauthorized' }, 401);
	}

	try {
		const body = await readJsonBody(request);
		const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
		const assistantReply = typeof body.assistantReply === 'string' ? body.assistantReply.trim() : '';

		if (!userMessage) {
			return sendJson(res, { error: 'userMessage is required' }, 400);
		}

		const title = await generateTitle(userMessage, assistantReply);

		if (!title || title.length > 60) {
			return sendJson(res, { title: '' });
		}

		return sendJson(res, { title });
	} catch (error) {
		console.error('Session title generation failed:', error);
		return sendJson(res, { title: '' });
	}
};

const handler = async (request, res) => {
	if (request.method === 'OPTIONS') {
		if (res) {
			return sendEmpty(res, 204);
		}
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	if (request.method === 'POST') {
		return postHandler(request, res);
	}

	return sendJson(res, { error: 'Method Not Allowed' }, 405);
};

export default handler;
export const POST = postHandler;
export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
export const GET = (request, res) => sendJson(res, { error: 'Method Not Allowed' }, 405);
export const HEAD = () => new Response(null, { status: 405, headers: corsHeaders });
