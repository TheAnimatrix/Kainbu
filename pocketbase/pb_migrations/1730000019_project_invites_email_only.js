/// <reference path="../pb_data/types.d.ts" />

/**
 * Allow project invites without a linked user account; invitees can list/view by email.
 */
migrate(
	(app) => {
		const invites = app.findCollectionByNameOrId('project_invites');
		const inviteeField = invites.fields.getByName('invitee');
		if (inviteeField) {
			inviteeField.required = false;
		}

		const inviteeClause =
			'(invitee.id = @request.auth.id || invitee_email = @request.auth.email)';
		const ownerOrMemberClause =
			'project.owner.id = @request.auth.id || (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id)';
		const listViewRule = `@request.auth.id != "" && (${inviteeClause} || ${ownerOrMemberClause})`;

		invites.listRule = listViewRule;
		invites.viewRule = listViewRule;
		app.save(invites);
	},
	(app) => {
		const invites = app.findCollectionByNameOrId('project_invites');
		const inviteeField = invites.fields.getByName('invitee');
		if (inviteeField) {
			inviteeField.required = true;
		}

		invites.listRule =
			'@request.auth.id != "" && (invitee.id = @request.auth.id || project.owner.id = @request.auth.id || (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id))';
		invites.viewRule =
			'@request.auth.id != "" && (invitee.id = @request.auth.id || project.owner.id = @request.auth.id || (@collection.project_memberships.project ?= project && @collection.project_memberships.user ?= @request.auth.id))';
		app.save(invites);
	}
);
