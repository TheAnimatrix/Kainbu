/// <reference path="../pb_data/types.d.ts" />

/**
 * 1730000013/1730000014 could no-op if app_settings did not exist yet, then never re-ran.
 * This migration always adds ai_models_json when the collection exists and the field is missing.
 */
migrate(
	(app) => {
		const appSettings = app.findCollectionByNameOrId('app_settings');
		let hasField = false;

		try {
			appSettings.fields.getByName('ai_models_json');
			hasField = true;
		} catch {
			hasField = false;
		}

		if (!hasField) {
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
