/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const appSettings = app.findCollectionByNameOrId('app_settings');

		const ensureText = (name, max) => {
			try {
				appSettings.fields.getByName(name);
			} catch {
				appSettings.fields.add(new TextField({ name, required: false, max }));
			}
		};

		const ensureBool = (name) => {
			try {
				appSettings.fields.getByName(name);
			} catch {
				appSettings.fields.add(new BoolField({ name, required: false }));
			}
		};

		ensureBool('signups_enabled');
		ensureText('mail_provider', 16);
		ensureText('resend_api_key', 512);
		app.save(appSettings);

		for (const record of app.findAllRecords('app_settings')) {
			if (record.get('signups_enabled') !== true) {
				record.set('signups_enabled', true);
			}
			if (!record.get('mail_provider')) {
				record.set('mail_provider', 'off');
			}
			app.save(record);
		}
	},
	(app) => {
		const appSettings = app.findCollectionByNameOrId('app_settings');
		for (const name of ['signups_enabled', 'mail_provider', 'resend_api_key']) {
			try {
				const field = appSettings.fields.getByName(name);
				if (field) appSettings.fields.removeById(field.id);
			} catch (_) {}
		}
		app.save(appSettings);
	}
);
