// Repair databases on which getByName() returned null instead of throwing.
// Install the field guards in the same migration as the privileged fields.
migrate(
	(app) => {
		const ensure = (collection, field) => {
			if (!collection.fields.getByName(field.name)) collection.fields.add(field);
		};
		const active = '@request.auth.id != "" && @request.auth.disabled != true';
		const unchanged = (names) =>
			names.map((name) => `@request.body.${name}:changed = false`).join(' && ');
		const users = app.findCollectionByNameOrId('users');
		ensure(users, new BoolField({ name: 'is_admin' }));
		ensure(users, new BoolField({ name: 'disabled' }));
		ensure(users, new SelectField({ name: 'color_mode', maxSelect: 1, values: ['light', 'dark'] }));
		ensure(
			users,
			new SelectField({
				name: 'preferred_ai_thinking_level',
				maxSelect: 1,
				values: ['none', 'low', 'medium', 'high', 'xhigh', 'max']
			})
		);
		users.createRule =
			'@request.body.is_admin:isset = false && @request.body.disabled:isset = false';
		users.listRule = `${active} && (@request.auth.is_admin = true || @request.auth.id = id)`;
		users.viewRule = users.listRule;
		users.updateRule = `${active} && @request.auth.id = id && ${unchanged(['is_admin', 'disabled'])}`;
		users.deleteRule = `${active} && @request.auth.id = id`;
		users.authRule = 'disabled = false';
		app.save(users);

		const settings = app.findCollectionByNameOrId('app_settings');
		const hadSignupFlag = Boolean(settings.fields.getByName('signups_enabled'));
		ensure(settings, new BoolField({ name: 'signups_enabled' }));
		for (const [name, max] of [
			['mail_provider', 16],
			['resend_api_key', 512],
			['ai_gateway_api_key', 512],
			['ai_models_json', 50000]
		]) {
			ensure(settings, new TextField({ name, max }));
		}
		for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
			settings[key] = null;
		app.save(settings);
		if (!hadSignupFlag) {
			for (const record of app.findAllRecords('app_settings')) {
				record.set('signups_enabled', true);
				app.save(record);
			}
		}

		const projects = app.findCollectionByNameOrId('projects');
		projects.createRule = `${active} && owner = @request.auth.id`;
		projects.updateRule = `(${projects.updateRule}) && @request.auth.disabled != true && ${unchanged(['owner', 'client_id'])}`;
		app.save(projects);
		const memberships = app.findCollectionByNameOrId('project_memberships');
		// Membership mutations are server-only, including owner bootstrap and soft leave.
		memberships.createRule = null;
		memberships.updateRule = null;
		memberships.deleteRule = null;
		app.save(memberships);

		const boards = app.findCollectionByNameOrId('project_boards');
		ensure(boards, new JSONField({ name: 'preferences' }));
		boards.createRule = `(${boards.createRule}) && (project.owner = @request.auth.id || (@request.body.share_public != true && @request.body.share_slug:isset = false))`;
		boards.updateRule = `(${boards.updateRule}) && (project.owner = @request.auth.id || (${unchanged(['share_public', 'share_slug'])}))`;
		app.save(boards);

		const sessions = app.findCollectionByNameOrId('project_ai_sessions');
		ensure(sessions, new JSONField({ name: 'context_summary', maxSize: 2000000 }));
		ensure(sessions, new TextField({ name: 'summarized_up_to_message_id', max: 64 }));
		ensure(sessions, new NumberField({ name: 'context_tokens' }));
		app.save(sessions);

		for (const name of [
			'projects',
			'project_memberships',
			'project_boards',
			'project_pages',
			'project_columns',
			'project_tasks',
			'project_invites',
			'project_user_state',
			'project_ai_sessions',
			'project_task_assets',
			'project_task_comments',
			'background_files',
			'page_assets'
		]) {
			const collection = app.findCollectionByNameOrId(name);
			for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
				if (collection[rule])
					// Match one active membership; '=' here tests every joined membership.
					collection[rule] =
						`(${collection[rule].replaceAll('@collection.project_memberships.left_at =', '@collection.project_memberships.left_at ?=')}) && @request.auth.disabled != true`;
			}
			if (collection.updateRule) {
				const immutable = [
					'project',
					'client_id',
					'user',
					'owner',
					'author',
					'uploaded_by',
					'task_client_id',
					'page_client_id'
				].filter((field) => collection.fields.getByName(field));
				if (immutable.length) collection.updateRule += ` && ${unchanged(immutable)}`;
			}
			if (name === 'project_columns' || name === 'project_tasks') {
				const board = collection.fields.getByName('board');
				board.cascadeDelete = true;
				board.required = true;
				collection.createRule += ' && board.project = project';
				collection.updateRule += ' && board.project = project';
			}
			if (name === 'project_task_assets' || name === 'page_assets') {
				collection.fields.getByName('file').protected = true;
				collection.createRule += ' && uploaded_by = @request.auth.id';
			}
			if (name === 'project_user_state' || name === 'project_ai_sessions') {
				for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
					collection[rule] += ' && user = @request.auth.id';
			}
			if (name === 'project_task_comments')
				collection.createRule += ' && author = @request.auth.id';
			app.save(collection);
		}
		for (const name of [
			'projects',
			'project_memberships',
			'project_boards',
			'project_pages',
			'project_columns',
			'project_tasks',
			'project_invites',
			'project_user_state',
			'project_ai_sessions'
		]) {
			const collection = app.findCollectionByNameOrId(name);
			ensure(collection, new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
			ensure(collection, new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));
			app.save(collection);
		}
	},
	() => {
		// Security and ownership repairs must not be undone by a rollback.
	}
);
