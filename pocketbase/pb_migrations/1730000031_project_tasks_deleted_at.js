/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('project_tasks');
		const fieldNames = new Set(collection.fields.map((field) => field.name));

		if (!fieldNames.has('deleted_at')) {
			collection.fields.add(
				new NumberField({
					name: 'deleted_at',
					required: false
				})
			);
			app.save(collection);
		}
	},
	() => {}
);
