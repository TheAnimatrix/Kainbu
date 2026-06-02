/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the app_settings.ai_gateway_api_key field used to store the Vercel AI
 * Gateway key. Idempotent — the server also repairs this field at runtime.
 */
migrate(
	(app) => {
		let appSettings;
		try {
			appSettings = app.findCollectionByNameOrId('app_settings');
		} catch {
			return;
		}

		try {
			appSettings.fields.getByName('ai_gateway_api_key');
		} catch {
			appSettings.fields.add(
				new TextField({
					name: 'ai_gateway_api_key',
					required: false,
					max: 512
				})
			);
			app.save(appSettings);
		}
	},
	(app) => {
		try {
			const appSettings = app.findCollectionByNameOrId('app_settings');
			const field = appSettings.fields.getByName('ai_gateway_api_key');
			if (field) appSettings.fields.removeById(field.id);
			app.save(appSettings);
		} catch (_) {
			// already removed
		}
	}
);
