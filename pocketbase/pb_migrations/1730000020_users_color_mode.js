/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		let hasField = false;

		try {
			users.fields.getByName('color_mode');
			hasField = true;
		} catch {
			hasField = false;
		}

		if (!hasField) {
			users.fields.add(
				new SelectField({
					name: 'color_mode',
					required: false,
					maxSelect: 1,
					values: ['light', 'dark']
				})
			);
			app.save(users);
		}
	},
	() => {}
);
