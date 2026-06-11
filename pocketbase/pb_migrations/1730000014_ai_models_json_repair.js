/// <reference path="../pb_data/types.d.ts" />

/** Idempotent repair when 1730000013 did not run on an existing deployment. */
migrate(
	(app) => {
		const appSettings = app.findCollectionByNameOrId('app_settings');
		const fieldNames = new Set(appSettings.fields.map((field) => field.name));

		if (!fieldNames.has('ai_models_json')) {
			appSettings.fields.add(
				new TextField({
					name: 'ai_models_json',
					required: false,
					max: 50000
				})
			);
			app.save(appSettings);
		}
	},
	() => {}
);
