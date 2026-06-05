/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		let hasField = false;

		try {
			users.fields.getByName('avatar');
			hasField = true;
		} catch {
			hasField = false;
		}

		if (!hasField) {
			users.fields.add(
				new FileField({
					name: 'avatar',
					required: false,
					maxSelect: 1,
					maxSize: 2097152,
					mimeTypes: ['image/jpeg', 'image/png', 'image/webp']
				})
			);
			app.save(users);
		}
	},
	() => {}
);
