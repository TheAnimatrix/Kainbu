/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('project_memberships');
		const fieldNames = new Set(collection.fields.map((field) => field.name));

		if (!fieldNames.has('viewing_board_client_id')) {
			collection.fields.add(
				new TextField({
					name: 'viewing_board_client_id',
					required: false,
					max: 64
				})
			);
		}

		if (!fieldNames.has('presence_at')) {
			collection.fields.add(
				new DateField({
					name: 'presence_at',
					required: false
				})
			);
		}

		app.save(collection);
	},
	() => {}
);
