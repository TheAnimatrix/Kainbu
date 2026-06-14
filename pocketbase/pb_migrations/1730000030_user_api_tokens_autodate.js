/// <reference path="../pb_data/types.d.ts" />

/**
 * user_api_tokens was created without AutodateField `created`/`updated`, so
 * admin list queries with `sort=-created` fail with PB 400. Same repair as
 * 1730000012_ai_usage_events_autodate.js.
 */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('user_api_tokens');
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
