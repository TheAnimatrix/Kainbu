/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const sessions = app.findCollectionByNameOrId('project_ai_sessions');

		const ensure = (name, makeField) => {
			let exists = false;
			try {
				sessions.fields.getByName(name);
				exists = true;
			} catch {
				exists = false;
			}
			if (!exists) sessions.fields.add(makeField());
		};

		ensure(
			'context_summary',
			() => new JSONField({ name: 'context_summary', required: false, maxSize: 2000000 })
		);
		ensure(
			'summarized_up_to_message_id',
			() => new TextField({ name: 'summarized_up_to_message_id', required: false, max: 64 })
		);
		ensure('context_tokens', () => new NumberField({ name: 'context_tokens', required: false }));

		app.save(sessions);
	},
	(app) => {
		const sessions = app.findCollectionByNameOrId('project_ai_sessions');
		for (const name of ['context_summary', 'summarized_up_to_message_id', 'context_tokens']) {
			try {
				const field = sessions.fields.getByName(name);
				sessions.fields.removeById(field.id);
			} catch {
				// field already absent
			}
		}
		app.save(sessions);
	}
);
