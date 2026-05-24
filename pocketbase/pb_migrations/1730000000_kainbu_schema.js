/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		users.fields.add(new TextField({ name: 'username', required: false, max: 64 }));
		users.fields.add(new BoolField({ name: 'default_show_checkbox', required: false }));
		users.fields.add(new TextField({ name: 'preferred_ai_model_id', required: false, max: 128 }));
		users.fields.add(
			new SelectField({
				name: 'preferred_model_preset',
				required: false,
				maxSelect: 1,
				values: ['fast', 'smart']
			})
		);
		users.fields.add(new JSONField({ name: 'background_theme', required: false }));

		app.save(users);

		const projectMemberList =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= id && @collection.project_memberships.user ?= @request.auth.id)';
		const projectMemberViaProject =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id)';

		const projects = new Collection({
			name: 'projects',
			type: 'base',
			listRule: projectMemberList,
			viewRule: projectMemberList,
			createRule: '@request.auth.id != ""',
			updateRule:
				'@request.auth.id != "" && (owner.id = @request.auth.id || (@collection.project_memberships.project ?= id && @collection.project_memberships.user ?= @request.auth.id))',
			deleteRule: '@request.auth.id != "" && owner.id = @request.auth.id',
			fields: [
				{ name: 'client_id', type: 'text', required: true, max: 64 },
				{
					name: 'owner',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{ name: 'name', type: 'text', required: true, max: 255 },
				{ name: 'background_theme', type: 'json', required: false },
				{ name: 'scratchpad_data', type: 'text', required: false },
				{ name: 'scratchpad_rev', type: 'number', required: false },
				{ name: 'kanban_data', type: 'json', required: false },
				{ name: 'chat_history', type: 'json', required: false },
				{ name: 'last_opened_at', type: 'date', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_projects_client_id ON projects (client_id)',
				'CREATE INDEX idx_projects_owner ON projects (owner)'
			]
		});
		app.save(projects);

		const projectMemberships = new Collection({
			name: 'project_memberships',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: null,
			updateRule:
				'@request.auth.id != "" && (user.id = @request.auth.id || project.owner.id = @request.auth.id)',
			deleteRule:
				'@request.auth.id != "" && (user.id = @request.auth.id || project.owner.id = @request.auth.id)',
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{
					name: 'user',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{
					name: 'role',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['owner', 'member']
				},
				{ name: 'joined_at', type: 'date', required: false },
				{ name: 'last_opened_at', type: 'date', required: false },
				{ name: 'pinned_at', type: 'date', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_memberships_project_user ON project_memberships (project, user)'
			]
		});
		app.save(projectMemberships);

		const projectInvites = new Collection({
			name: 'project_invites',
			type: 'base',
			listRule:
				'@request.auth.id != "" && (invitee.id = @request.auth.id || project.owner.id = @request.auth.id || (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id))',
			viewRule:
				'@request.auth.id != "" && (invitee.id = @request.auth.id || project.owner.id = @request.auth.id || (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id))',
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{
					name: 'invitee',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{ name: 'invitee_email', type: 'email', required: true },
				{
					name: 'invited_by',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: false
				},
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['pending', 'accepted', 'rejected', 'cancelled']
				},
				{ name: 'responded_at', type: 'date', required: false }
			],
			indexes: [
				'CREATE INDEX idx_project_invites_invitee_status ON project_invites (invitee, status)'
			]
		});
		app.save(projectInvites);

		const projectBoards = new Collection({
			name: 'project_boards',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: projectMemberViaProject,
			updateRule: projectMemberViaProject,
			deleteRule: projectMemberViaProject,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{ name: 'client_id', type: 'text', required: true, max: 64 },
				{ name: 'name', type: 'text', required: true, max: 255 },
				{ name: 'position', type: 'number', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_boards_project_client ON project_boards (project, client_id)'
			]
		});
		app.save(projectBoards);

		const projectPages = new Collection({
			name: 'project_pages',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: projectMemberViaProject,
			updateRule: projectMemberViaProject,
			deleteRule: projectMemberViaProject,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{ name: 'client_id', type: 'text', required: true, max: 64 },
				{ name: 'name', type: 'text', required: true, max: 255 },
				{ name: 'content', type: 'text', required: false },
				{ name: 'position', type: 'number', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_pages_project_client ON project_pages (project, client_id)'
			]
		});
		app.save(projectPages);

		const projectColumns = new Collection({
			name: 'project_columns',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: projectMemberViaProject,
			updateRule: projectMemberViaProject,
			deleteRule: projectMemberViaProject,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{
					name: 'board',
					type: 'relation',
					required: false,
					maxSelect: 1,
					collectionId: projectBoards.id
				},
				{ name: 'client_id', type: 'text', required: true, max: 64 },
				{ name: 'title', type: 'text', required: true, max: 255 },
				{ name: 'color', type: 'text', required: false, max: 64 },
				{ name: 'width', type: 'number', required: false },
				{ name: 'position', type: 'number', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_columns_project_client ON project_columns (project, client_id)'
			]
		});
		app.save(projectColumns);

		const projectTasks = new Collection({
			name: 'project_tasks',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: projectMemberViaProject,
			updateRule: projectMemberViaProject,
			deleteRule: projectMemberViaProject,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{
					name: 'board',
					type: 'relation',
					required: false,
					maxSelect: 1,
					collectionId: projectBoards.id
				},
				{ name: 'client_id', type: 'text', required: true, max: 64 },
				{ name: 'column_id', type: 'text', required: true, max: 64 },
				{ name: 'title', type: 'text', required: true, max: 512 },
				{ name: 'description', type: 'text', required: false },
				{ name: 'color', type: 'text', required: false, max: 64 },
				{ name: 'tags', type: 'json', required: false },
				{ name: 'has_checkbox', type: 'bool', required: false },
				{ name: 'checked', type: 'bool', required: false },
				{ name: 'completed_at', type: 'number', required: false },
				{ name: 'countdown_at', type: 'number', required: false },
				{ name: 'alarm_at', type: 'number', required: false },
				{
					name: 'assigned_to',
					type: 'relation',
					required: false,
					maxSelect: 1,
					collectionId: users.id
				},
				{ name: 'linked_task_ids', type: 'json', required: false },
				{ name: 'position', type: 'number', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_tasks_project_client ON project_tasks (project, client_id)'
			]
		});
		app.save(projectTasks);

		const projectUserState = new Collection({
			name: 'project_user_state',
			type: 'base',
			listRule: '@request.auth.id != "" && user.id = @request.auth.id',
			viewRule: '@request.auth.id != "" && user.id = @request.auth.id',
			createRule: '@request.auth.id != "" && user.id = @request.auth.id',
			updateRule: '@request.auth.id != "" && user.id = @request.auth.id',
			deleteRule: '@request.auth.id != "" && user.id = @request.auth.id',
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{
					name: 'user',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{ name: 'active_ai_session_id', type: 'text', required: false, max: 64 },
				{ name: 'chat_history', type: 'json', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_user_state_project_user ON project_user_state (project, user)'
			]
		});
		app.save(projectUserState);

		const projectAiSessions = new Collection({
			name: 'project_ai_sessions',
			type: 'base',
			listRule: '@request.auth.id != "" && user.id = @request.auth.id',
			viewRule: '@request.auth.id != "" && user.id = @request.auth.id',
			createRule: '@request.auth.id != "" && user.id = @request.auth.id',
			updateRule: '@request.auth.id != "" && user.id = @request.auth.id',
			deleteRule: '@request.auth.id != "" && user.id = @request.auth.id',
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{
					name: 'user',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{ name: 'client_id', type: 'text', required: true, max: 64 },
				{ name: 'title', type: 'text', required: false, max: 255 },
				{ name: 'model_id', type: 'text', required: false, max: 128 },
				{ name: 'history', type: 'json', required: false },
				{ name: 'last_message_at', type: 'date', required: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_project_ai_sessions_client ON project_ai_sessions (client_id)'
			]
		});
		app.save(projectAiSessions);

		const projectTaskAssets = new Collection({
			name: 'project_task_assets',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: projectMemberViaProject,
			updateRule: projectMemberViaProject,
			deleteRule: projectMemberViaProject,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{ name: 'task_client_id', type: 'text', required: true, max: 64 },
				{
					name: 'kind',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['attachment', 'embed']
				},
				{ name: 'name', type: 'text', required: true, max: 255 },
				{ name: 'mime_type', type: 'text', required: true, max: 128 },
				{ name: 'size_bytes', type: 'number', required: false },
				{
					name: 'uploaded_by',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id
				},
				{ name: 'file', type: 'file', required: true, maxSelect: 1, maxSize: 20971520 }
			]
		});
		app.save(projectTaskAssets);

		const projectTaskComments = new Collection({
			name: 'project_task_comments',
			type: 'base',
			listRule: projectMemberViaProject,
			viewRule: projectMemberViaProject,
			createRule: projectMemberViaProject,
			updateRule: projectMemberViaProject,
			deleteRule: projectMemberViaProject,
			fields: [
				{
					name: 'project',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: projects.id,
					cascadeDelete: true
				},
				{ name: 'task_client_id', type: 'text', required: true, max: 64 },
				{ name: 'body', type: 'text', required: true },
				{
					name: 'author',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id
				}
			]
		});
		app.save(projectTaskComments);

		const backgroundFiles = new Collection({
			name: 'background_files',
			type: 'base',
			listRule: '@request.auth.id != "" && owner.id = @request.auth.id',
			viewRule: '@request.auth.id != "" && owner.id = @request.auth.id',
			createRule: '@request.auth.id != "" && owner.id = @request.auth.id',
			updateRule: '@request.auth.id != "" && owner.id = @request.auth.id',
			deleteRule: '@request.auth.id != "" && owner.id = @request.auth.id',
			fields: [
				{
					name: 'owner',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{ name: 'path', type: 'text', required: true, max: 512 },
				{ name: 'file', type: 'file', required: true, maxSelect: 1, maxSize: 10485760 }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_background_files_owner_path ON background_files (owner, path)'
			]
		});
		app.save(backgroundFiles);

		const cliDeviceAuth = new Collection({
			name: 'cli_device_auth',
			type: 'base',
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'device_id', type: 'text', required: true, max: 64 },
				{ name: 'user_code', type: 'text', required: true, max: 16 },
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['pending', 'approved', 'consumed', 'expired']
				},
				{
					name: 'user',
					type: 'relation',
					required: false,
					maxSelect: 1,
					collectionId: users.id
				},
				{ name: 'exchange_token', type: 'text', required: false, max: 128 },
				{ name: 'auth_token', type: 'text', required: false, max: 512 },
				{ name: 'expires_at', type: 'date', required: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_cli_device_auth_device ON cli_device_auth (device_id)',
				'CREATE INDEX idx_cli_device_auth_exchange ON cli_device_auth (exchange_token)'
			]
		});
		app.save(cliDeviceAuth);
	},
	(app) => {
		const names = [
			'cli_device_auth',
			'background_files',
			'project_task_comments',
			'project_task_assets',
			'project_ai_sessions',
			'project_user_state',
			'project_tasks',
			'project_columns',
			'project_pages',
			'project_boards',
			'project_invites',
			'project_memberships',
			'projects'
		];
		for (const name of names) {
			try {
				const collection = app.findCollectionByNameOrId(name);
				app.delete(collection);
			} catch (_) {
				// already removed
			}
		}
	}
);
