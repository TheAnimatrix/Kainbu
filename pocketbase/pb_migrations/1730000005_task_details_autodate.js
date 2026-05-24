/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		for (const name of ['project_task_assets', 'project_task_comments']) {
			const collection = app.findCollectionByNameOrId(name);
			const fieldNames = new Set(collection.fields.map((field) => field.name));

			if (!fieldNames.has('created')) {
				collection.fields.add(
					new AutodateField({
						name: 'created',
						onCreate: true,
						onUpdate: false
					})
				);
			}

			if (!fieldNames.has('updated')) {
				collection.fields.add(
					new AutodateField({
						name: 'updated',
						onCreate: true,
						onUpdate: true
					})
				);
			}

			app.save(collection);
		}
	},
	() => {}
);
