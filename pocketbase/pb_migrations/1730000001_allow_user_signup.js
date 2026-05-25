/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		// Empty string = guests may register (POST /api/collections/users/records).
		users.createRule = '';
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.createRule = null;
		app.save(users);
	}
);
