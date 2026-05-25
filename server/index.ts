import { serve } from '@hono/node-server';
import { getEnv } from './env.js';
import { repairUsersCollectionApiRules } from './usersCollectionRules.js';
import app from './app.js';

const port = Number(getEnv('PORT', '8788'));
const hostname = getEnv('HOST', '0.0.0.0');

void repairUsersCollectionApiRules().catch((error) => {
	console.error('[startup] users collection rules repair failed:', error);
});

serve(
	{
		fetch: app.fetch,
		port,
		hostname
	},
	(info) => {
		console.log(`Kainbu Hono API listening on http://${hostname}:${info.port}`);
	}
);
