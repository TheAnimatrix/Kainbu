/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.listRule = '@request.auth.id != ""';
		users.viewRule = '@request.auth.id != ""';
		users.updateRule = '@request.auth.id = id';
		users.deleteRule = '@request.auth.id = id';
		app.save(users);
	},
	() => {}
);
