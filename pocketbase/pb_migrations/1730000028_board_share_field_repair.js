/// <reference path="../pb_data/types.d.ts" />

/**
 * Repair project_boards when 1730000025 no-oped:
 * getByName() does not throw on a missing field, so try/catch idempotency never added
 * share_slug / share_public.
 */
migrate(
	(app) => {
		let boards;
		try {
			boards = app.findCollectionByNameOrId('project_boards');
		} catch {
			return;
		}

		const fieldNames = new Set(boards.fields.map((field) => field.name));
		let changed = false;

		if (!fieldNames.has('share_slug')) {
			boards.fields.add(
				new TextField({
					name: 'share_slug',
					required: false,
					max: 12
				})
			);
			changed = true;
		}

		if (!fieldNames.has('share_public')) {
			boards.fields.add(
				new BoolField({
					name: 'share_public',
					required: false
				})
			);
			changed = true;
		}

		const indexes = boards.indexes || [];
		const withoutBrokenIndex = indexes.filter(
			(entry) => !String(entry).includes('idx_project_boards_share_slug')
		);
		if (withoutBrokenIndex.length !== indexes.length) {
			boards.indexes = withoutBrokenIndex;
			changed = true;
		}

		if (changed) {
			app.save(boards);
		}
	},
	() => {}
);
