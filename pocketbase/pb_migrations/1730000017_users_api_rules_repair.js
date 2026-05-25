/// <reference path="../pb_data/types.d.ts" />

/**
 * Repair users collection API rules if a partial Collections API update cleared them.
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.listRule = '@request.auth.is_admin = true || @request.auth.id = id';
		users.viewRule = '@request.auth.is_admin = true || @request.auth.id = id';
		users.updateRule = '@request.auth.id = id';
		users.deleteRule = '@request.auth.id = id';
		app.save(users);
	},
	() => {}
);
