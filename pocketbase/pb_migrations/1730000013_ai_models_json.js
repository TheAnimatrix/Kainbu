/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let appSettings;
		try {
			appSettings = app.findCollectionByNameOrId('app_settings');
		} catch {
			return;
		}

		try {
			appSettings.fields.getByName('ai_models_json');
		} catch {
			appSettings.fields.add(
				new TextField({
					name: 'ai_models_json',
					required: false,
					max: 200000
				})
			);
			app.save(appSettings);
		}
	},
	() => {}
);
