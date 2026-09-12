/* eslint-disable @typescript-eslint/no-require-imports -- PocketBase hooks require CommonJS modules. */

routerAdd(
	'POST',
	'/api/kainbu/board-sync',
	(e) => require(`${__hooks}/workspace.js`).syncBoard(e),
	$apis.requireAuth()
);
routerAdd(
	'POST',
	'/api/kainbu/scratchpad',
	(e) => require(`${__hooks}/workspace.js`).scratchpad(e),
	$apis.requireAuth()
);
routerAdd(
	'POST',
	'/api/kainbu/invites/respond',
	(e) => require(`${__hooks}/workspace.js`).respondInvite(e),
	$apis.requireAuth()
);

onRecordDelete(
	(e) => require(`${__hooks}/workspace.js`).deleteChildren(e),
	'project_columns',
	'project_tasks'
);

routerAdd(
	'POST',
	'/api/kainbu/page',
	(e) => require(`${__hooks}/workspace.js`).page(e),
	$apis.requireAuth()
);
