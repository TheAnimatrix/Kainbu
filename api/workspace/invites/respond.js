const { createWorkspaceEndpoint } = require('../../../server/vercel-workspace-route');

const { handler, postHandler, optionsHandler, methodNotAllowedHandler } =
	createWorkspaceEndpoint('handleWorkspaceRespondInviteRequest');

module.exports = handler;
module.exports.default = handler;
module.exports.POST = postHandler;
module.exports.OPTIONS = optionsHandler;
module.exports.GET = methodNotAllowedHandler;
module.exports.HEAD = methodNotAllowedHandler;
