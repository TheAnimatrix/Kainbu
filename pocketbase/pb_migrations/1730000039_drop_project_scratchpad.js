/// <reference path="../pb_data/types.d.ts" />

// Notes live in project_pages. The project-level scratchpad was a legacy store
// the app no longer showed; nothing reads or writes these fields any more.
migrate(
	(app) => {
		const projects = app.findCollectionByNameOrId('projects');
		for (const name of ['scratchpad_data', 'scratchpad_rev']) {
			const field = projects.fields.getByName(name);
			if (field) projects.fields.removeById(field.id);
		}
		app.save(projects);
	},
	() => {
		// The dropped content is not recoverable; a rollback has nothing to restore.
	}
);
