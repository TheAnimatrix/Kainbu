/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const projectMemberViaProject =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id)';

		const pageAssets = new Collection({
			name: 'page_assets',
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
					collectionId: 'projects',
					cascadeDelete: true
				},
				{ name: 'page_client_id', type: 'text', required: true, max: 64 },
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
					collectionId: 'users'
				},
				{ name: 'file', type: 'file', required: true, maxSelect: 1, maxSize: 20971520 }
			]
		});
		app.save(pageAssets);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId('page_assets');
			app.delete(collection);
		} catch (_) {
			// already removed
		}
	}
);
