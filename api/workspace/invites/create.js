import { createWorkspaceEndpoint } from '../../../server/vercel-workspace-route.js';

const { handler, postHandler, optionsHandler, methodNotAllowedHandler } =
	createWorkspaceEndpoint('handleWorkspaceCreateInviteRequest');

export default handler;
export const POST = postHandler;
export const OPTIONS = optionsHandler;
export const GET = methodNotAllowedHandler;
export const HEAD = methodNotAllowedHandler;
