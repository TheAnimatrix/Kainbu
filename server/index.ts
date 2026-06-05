import { serve } from '@hono/node-server';
import { getEnv } from './env.js';
import { syncAuthEmailTemplates } from './admin.js';
import { repairUsersCollectionApiRules } from './usersCollectionRules.js';
import app from './app.js';

const port = Number(getEnv('PORT', '8788'));
const hostname = getEnv('HOST', '0.0.0.0');

void repairUsersCollectionApiRules().catch((error) => {
	console.error('[startup] users collection rules repair failed:', error);
});

void syncAuthEmailTemplates()
	.then((result) => {
		if (result.synced) {
			console.log('[startup] auth email templates synced');
		}
	})
	.catch((error) => {
		console.error('[startup] auth email template sync failed:', error);
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
