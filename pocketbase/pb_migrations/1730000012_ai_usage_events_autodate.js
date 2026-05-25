/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('ai_usage_events');
		const fieldNames = new Set(collection.fields.map((field) => field.name));

		if (!fieldNames.has('created')) {
			collection.fields.add(
				new AutodateField({
					name: 'created',
					onCreate: true,
					onUpdate: false
				})
			);
		}

		if (!fieldNames.has('updated')) {
			collection.fields.add(
				new AutodateField({
					name: 'updated',
					onCreate: true,
					onUpdate: true
				})
			);
		}

		app.save(collection);
	},
	() => {}
);
