/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		// All legitimate membership writes are performed by authenticated server
		// endpoints using the superuser client. Browser clients must never be able
		// to change project/user/role/lifecycle fields or hard-delete the row.
		memberships.createRule = null;
		memberships.updateRule = null;
		memberships.deleteRule = null;
		app.save(memberships);
	},
	(app) => {
		// Do not restore unsafe client-write rules on downgrade.
	}
);