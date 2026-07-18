/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		if (!memberships.fields.getByName('left_at')) {
			memberships.fields.add(new DateField({ name: 'left_at', required: false }));
			// Persist the schema before saving rules that reference the new field.
			app.save(memberships);
		}

		// Refresh the collection so rule validation resolves the persisted field schema.
		const refreshedMemberships = app.findCollectionByNameOrId('project_memberships');

		const activeMember =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id && @collection.project_memberships.left_at = "")';
		const activeProjectMember =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= id && @collection.project_memberships.user ?= @request.auth.id && @collection.project_memberships.left_at = "")';
		const membershipParticipant =
			'@request.auth.id != "" && left_at = "" && (user.id = @request.auth.id || project.owner.id = @request.auth.id)';
		refreshedMemberships.listRule = membershipParticipant;
		refreshedMemberships.viewRule = membershipParticipant;
		// Membership identity, role, and lifecycle are server-managed. Allowing a
		// participant to write this row would let them promote or reassign it.
		refreshedMemberships.updateRule = null;
		refreshedMemberships.deleteRule = null;

		for (const name of [
			'project_boards',
			'project_columns',
			'project_tasks',
			'project_pages',
			'project_page_assets',
			'page_assets',
			'project_task_assets',
			'project_task_comments',
			'project_user_state',
			'project_ai_sessions'
		]) {
			let collection;
			try {
				collection = app.findCollectionByNameOrId(name);
			} catch {
				// Optional collections may not exist in older installations.
				continue;
			}
			collection.listRule = activeMember;
			collection.viewRule = activeMember;
			collection.createRule = activeMember;
			collection.updateRule = activeMember;
			collection.deleteRule = activeMember;
			app.save(collection);
		}

		const projects = app.findCollectionByNameOrId('projects');
		projects.listRule = activeProjectMember;
		projects.viewRule = activeProjectMember;
		app.save(projects);
		app.save(refreshedMemberships);
	},
	(app) => {
		// Intentionally leave the field and restrictive rules in place on downgrade.
		// Removing left_at while rules reference it would make the database unsafe or
		// cause the downgrade itself to fail. A forward migration can repair this state.
	}
);
