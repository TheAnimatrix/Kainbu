/// <reference path="../pb_data/types.d.ts" />

/**
 * Repair project_pages when a stray custom `id` text field exists (max 0).
 * That field shadows the record id on create and rejects writes with:
 *   id: validation_required — "Cannot be blank."
 *
 * Also lift content max from 0 so long notes persist correctly.
 */
migrate(
	(app) => {
		let pages;
		try {
			pages = app.findCollectionByNameOrId('project_pages');
		} catch {
			return;
		}

		let changed = false;

		try {
			const customIdField = pages.fields.getByName('id');
			if (customIdField && customIdField.type === 'text') {
				pages.fields.removeById(customIdField.id);
				changed = true;
			}
		} catch {
			// no custom id field
		}

		try {
			const contentField = pages.fields.getByName('content');
			if (contentField && contentField.type === 'text' && (!contentField.max || contentField.max <= 0)) {
				contentField.max = 500000;
				changed = true;
			}
		} catch {
			// no content field
		}

		if (changed) {
			app.save(pages);
		}
	},
	(app) => {
		try {
			const pages = app.findCollectionByNameOrId('project_pages');
			let changed = false;

			try {
				pages.fields.getByName('id');
			} catch {
				pages.fields.add(
					new TextField({
						name: 'id',
						required: false,
						max: 0
					})
				);
				changed = true;
			}

			try {
				const contentField = pages.fields.getByName('content');
				if (contentField && contentField.max === 500000) {
					contentField.max = 0;
					changed = true;
				}
			} catch {
				// ignore
			}

			if (changed) {
				app.save(pages);
			}
		} catch {
			// collection missing
		}
	}
);
