/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		memberships.createRule =
			'@request.auth.id != "" && (user.id = @request.auth.id || project.owner.id = @request.auth.id)';
		app.save(memberships);

		// Backfill owner memberships for projects created while createRule was superuser-only.
		const membershipCollection = memberships;
		const projects = app.findAllRecords('projects');

		for (const project of projects) {
			const ownerId = String(project.get('owner') || '');
			if (!ownerId) continue;

			const existing = app.findRecordsByFilter(
				membershipCollection.id,
				'project = {:project} && user = {:user}',
				'',
				1,
				0,
				{ project: project.id, user: ownerId }
			);

			if (existing.length > 0) continue;

			const membership = new Record(membershipCollection);
			membership.set('project', project.id);
			membership.set('user', ownerId);
			membership.set('role', 'owner');
			membership.set('joined_at', new Date().toISOString());
			membership.set('last_opened_at', new Date().toISOString());
			app.save(membership);
		}
	},
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		memberships.createRule = null;
		app.save(memberships);
	}
);
