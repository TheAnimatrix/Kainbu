/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const boards = app.findCollectionByNameOrId('project_boards');

		let hasShareSlug = false;
		try {
			boards.fields.getByName('share_slug');
			hasShareSlug = true;
		} catch {
			hasShareSlug = false;
		}

		if (!hasShareSlug) {
			boards.fields.add(
				new TextField({
					name: 'share_slug',
					required: false,
					max: 12
				})
			);
		}

		let hasSharePublic = false;
		try {
			boards.fields.getByName('share_public');
			hasSharePublic = true;
		} catch {
			hasSharePublic = false;
		}

		if (!hasSharePublic) {
			boards.fields.add(
				new BoolField({
					name: 'share_public',
					required: false
				})
			);
		}

		// Drop a broken index from failed earlier deploys (column/index ordering).
		boards.indexes = (boards.indexes || []).filter(
			(entry) => !String(entry).includes('idx_project_boards_share_slug')
		);

		app.save(boards);
	},
	() => {}
);
