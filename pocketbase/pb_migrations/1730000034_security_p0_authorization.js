/// <reference path="../pb_data/types.d.ts" />

/**
 * Lock provider and email secrets to the PocketBase superuser/server-admin
 * client, and prevent direct membership self-enrollment.
 *
 * The application server uses a superuser client for project/invite flows;
 * ordinary browser-authenticated users must never reach these collections
 * directly.
 */
migrate(
	(app) => {
		const appSettings = app.findCollectionByNameOrId('app_settings');
		const memberships = app.findCollectionByNameOrId('project_memberships');
		let changed = false;

		for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
			if (appSettings[rule] !== null) {
				appSettings[rule] = null;
				changed = true;
			}
		}

		if (memberships.createRule !== null) {
			memberships.createRule = null;
			changed = true;
		}

		if (changed) {
			app.save(appSettings);
			app.save(memberships);
		}
	},
	() => {}
);
