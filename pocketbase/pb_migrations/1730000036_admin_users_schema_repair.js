/// <reference path="../pb_data/types.d.ts" />

/**
 * Repair the admin flag on installations where the admin-panel migration was
 * skipped or partially applied. Keep this as a forward-only repair: existing
 * users retain their values and clean installations get the same optional
 * boolean field expected by the admin API.
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		let isAdmin;

		try {
			isAdmin = users.fields.getByName('is_admin');
		} catch {
			// Older PocketBase versions may throw for a missing field; current ones
			// return undefined. Handle both before inspecting the field type.
		}

		if (!isAdmin) {
			users.fields.add(new BoolField({ name: 'is_admin', required: false }));
			app.save(users);
			return;
		}

		// A malformed field with the same name is schema drift too. Replace only
		// that field; a valid bool field and all stored values are left untouched.
		if (isAdmin.type !== 'bool') {
			users.fields.removeById(isAdmin.id);
			users.fields.add(new BoolField({ name: 'is_admin', required: false }));
			app.save(users);
		}
	},
	() => {}
);
