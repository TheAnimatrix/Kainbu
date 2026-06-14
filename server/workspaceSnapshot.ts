import type { Context } from 'hono';
import { createAdminPb, resolveAuthenticatedUserId } from './pocketbase.js';
import { loadWorkspaceFromPb } from '../src/lib/kainbu/loadWorkspaceFromRemote.js';

/**
 * Server-side equivalent of the client-side `fetchWorkspace` in
 * `src/lib/kainbu/persistence.ts`. Returns the same `{ projects, incomingInvites }`
 * shape so the web app and the CLI can both consume it via
 * `GET /api/workspace/snapshot`.
 *
 * The CLI on a self-hosted domain uses this with an API key to fetch a
 * workspace without ever talking to PocketBase directly.
 */
export const handleWorkspaceSnapshot = async (c: Context) => {
	try {
		const { userId } = await resolveAuthenticatedUserId(c.req.header('Authorization'));
		const pb = await createAdminPb();

		// Read the user's email from the admin client so invites-by-email still
		// match (the original client-side path used `pb.authStore.model?.email`).
		let authEmail = '';
		try {
			const self = await pb.collection('users').getOne<Record<string, unknown>>(userId, {
				fields: 'id,email,username,avatar'
			});
			authEmail = String(self.email || '').trim().toLowerCase();
		} catch {
			// No-op: invites-by-email won't match, but the rest still works.
		}

		const snapshot = await loadWorkspaceFromPb(pb, userId, { authEmail });
		return c.json(snapshot);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Workspace snapshot failed.';
		const status = message === 'Unauthorized' ? 401 : 500;
		return c.json({ error: message }, status as 401 | 500);
	}
};
