/// <reference path="../pb_data/types.d.ts" />

/** Do not email users when they sign in from a new device/IP. */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.authAlert.enabled = false;
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.authAlert.enabled = true;
		app.save(users);
	}
);
