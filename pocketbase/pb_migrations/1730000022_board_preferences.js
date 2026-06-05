/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const boards = app.findCollectionByNameOrId('project_boards');
		let hasField = false;

		try {
			boards.fields.getByName('preferences');
			hasField = true;
		} catch {
			hasField = false;
		}

		if (!hasField) {
			boards.fields.add(
				new JsonField({
					name: 'preferences',
					required: false
				})
			);
			app.save(boards);
		}
	},
	() => {}
);
