/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const membershipCollection = app.findCollectionByNameOrId('project_memberships');
		const projects = app.findAllRecords('projects');

		for (const project of projects) {
			const ownerId = String(project.get('owner') || '');
			if (!ownerId) continue;

			const existing = app.findRecordsByFilter(
				'project_memberships',
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
	() => {}
);
