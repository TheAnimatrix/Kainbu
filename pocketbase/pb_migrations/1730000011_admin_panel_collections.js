/// <reference path="../pb_data/types.d.ts" />

/**
 * Idempotent repair for admin panel schema when 1730000010 did not complete
 * (e.g. failed index on `created` in an earlier revision).
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		const ensureBoolField = (name) => {
			try {
				users.fields.getByName(name);
			} catch {
				users.fields.add(new BoolField({ name, required: false }));
			}
		};

		ensureBoolField('is_admin');
		ensureBoolField('disabled');

		users.listRule =
			'@request.auth.is_admin = true || @request.auth.id = id';
		users.viewRule =
			'@request.auth.is_admin = true || @request.auth.id = id';

		app.save(users);

		let appSettings;
		try {
			appSettings = app.findCollectionByNameOrId('app_settings');
		} catch {
			appSettings = new Collection({
				name: 'app_settings',
				type: 'base',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'singleton', type: 'text', required: true, max: 32 },
					{ name: 'openrouter_api_key', type: 'text', required: false, max: 512 }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_app_settings_singleton ON app_settings (singleton)'
				]
			});
			app.save(appSettings);
		}

		try {
			app.findCollectionByNameOrId('ai_usage_events');
		} catch {
			const aiUsageEvents = new Collection({
				name: 'ai_usage_events',
				type: 'base',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: 'user',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true
					},
					{
						name: 'project',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: app.findCollectionByNameOrId('projects').id,
						cascadeDelete: false
					},
					{ name: 'model', type: 'text', required: false, max: 128 },
					{ name: 'request_id', type: 'text', required: false, max: 64 },
					{ name: 'prompt_tokens', type: 'number', required: false },
					{ name: 'completion_tokens', type: 'number', required: false },
					{ name: 'cached_tokens', type: 'number', required: false },
					{ name: 'cost_usd', type: 'number', required: false },
					{
						name: 'source',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['workspace-ai', 'title-gen']
					}
				],
				indexes: ['CREATE INDEX idx_ai_usage_events_user ON ai_usage_events (user)']
			});
			app.save(aiUsageEvents);
		}
	},
	() => {}
);
