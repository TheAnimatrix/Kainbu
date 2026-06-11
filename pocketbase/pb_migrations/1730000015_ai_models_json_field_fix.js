/// <reference path="../pb_data/types.d.ts" />

/**
 * 1730000013/1730000014 could no-op if app_settings did not exist yet, then never re-ran.
 * This migration always adds ai_models_json when the collection exists and the field is missing.
 */
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
