/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		memberships.createRule =
			'@request.auth.id != "" && (user.id = @request.auth.id || project.owner.id = @request.auth.id)';
		app.save(memberships);
	},
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		memberships.createRule = null;
		app.save(memberships);
	}
);
