/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		if (!memberships.fields.getByName('left_at')) {
			memberships.fields.add(new DateField({ name: 'left_at', required: false }));
		}

		const activeMember =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id && @collection.project_memberships.left_at = "")';
		const activeProjectMember =
			'@request.auth.id != "" && (@collection.project_memberships.project ?= id && @collection.project_memberships.user ?= @request.auth.id && @collection.project_memberships.left_at = "")';
		const membershipParticipant =
			'@request.auth.id != "" && left_at = "" && (user.id = @request.auth.id || project.owner.id = @request.auth.id)';
		memberships.listRule = membershipParticipant;
		memberships.viewRule = membershipParticipant;
		memberships.updateRule = membershipParticipant;
		memberships.deleteRule = membershipParticipant;

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
			try {
				const collection = app.findCollectionByNameOrId(name);
				collection.listRule = activeMember;
				collection.viewRule = activeMember;
				collection.createRule = activeMember;
				collection.updateRule = activeMember;
				collection.deleteRule = activeMember;
				app.save(collection);
			} catch {
				// Optional collections may not exist in older installations.
			}
		}

		const projects = app.findCollectionByNameOrId('projects');
		projects.listRule = activeProjectMember;
		projects.viewRule = activeProjectMember;
		app.save(projects);
		app.save(memberships);
	},
	(app) => {
		const memberships = app.findCollectionByNameOrId('project_memberships');
		const leftAt = memberships.fields.getByName('left_at');
		if (leftAt) memberships.fields.removeByName('left_at');
		app.save(memberships);
	}
);