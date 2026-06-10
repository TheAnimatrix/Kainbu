/// <reference path="../pb_data/types.d.ts" />

/**
 * Repair app_settings when earlier migrations no-oped:
 * - 1730000013–1730000015 used fields.getByName() try/catch, but getByName does not throw
 *   when the field is missing from collection metadata (only the raw SQL column may exist).
 * - 1730000010/1730000011 created app_settings with null API rules, which deny REST access
 *   even for superusers on some PocketBase builds.
 */
migrate(
	(app) => {
		let appSettings;
		try {
			appSettings = app.findCollectionByNameOrId('app_settings');
		} catch {
			return;
		}

		const fieldNames = new Set(appSettings.fields.map((field) => field.name));
		let changed = false;

		if (!fieldNames.has('ai_models_json')) {
			appSettings.fields.add(
				new TextField({
					name: 'ai_models_json',
					required: false,
					max: 50000
				})
			);
			changed = true;
		}

		const authRule = '@request.auth.id != ""';
		if (
			appSettings.listRule !== authRule ||
			appSettings.viewRule !== authRule ||
			appSettings.createRule !== authRule ||
			appSettings.updateRule !== authRule ||
			appSettings.deleteRule !== authRule
		) {
			appSettings.listRule = authRule;
			appSettings.viewRule = authRule;
			appSettings.createRule = authRule;
			appSettings.updateRule = authRule;
			appSettings.deleteRule = authRule;
			changed = true;
		}

		if (changed) {
			app.save(appSettings);
		}
	},
	(app) => {
		try {
			const appSettings = app.findCollectionByNameOrId('app_settings');
			const field = appSettings.fields.getByName('ai_models_json');
			if (field) {
				appSettings.fields.removeById(field.id);
			}
			appSettings.listRule = null;
			appSettings.viewRule = null;
			appSettings.createRule = null;
			appSettings.updateRule = null;
			appSettings.deleteRule = null;
			app.save(appSettings);
		} catch (_) {
			// already removed
		}
	}
);
