/// <reference path="../pb_data/types.d.ts" />

/** authRule `verified = true` blocks record API for existing sessions — keep signup gating in app code only. */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.authRule = '';
		app.save(users);
	},
	() => {}
);
