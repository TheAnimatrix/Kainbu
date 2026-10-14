/// <reference path="../pb_data/types.d.ts" />

// PocketBase treats a text field's max of 0 as its default 5,000-character cap.
// Task descriptions and page content are user documents and must not be capped,
// so set the largest max PocketBase accepts.
const UNCAPPED = Number.MAX_SAFE_INTEGER;

migrate(
	(app) => {
		for (const [collectionName, fieldName] of [
			['project_tasks', 'description'],
			['project_pages', 'content']
		]) {
			const collection = app.findCollectionByNameOrId(collectionName);
			const field = collection.fields.getByName(fieldName);
			if (!field) throw new Error(`${collectionName}.${fieldName} is missing.`);
			field.max = UNCAPPED;
			app.save(collection);
		}
	},
	(app) => {
		for (const [collectionName, fieldName, max] of [
			['project_tasks', 'description', 0],
			['project_pages', 'content', 500000]
		]) {
			const collection = app.findCollectionByNameOrId(collectionName);
			const field = collection.fields.getByName(fieldName);
			if (!field) continue;
			field.max = max;
			app.save(collection);
		}
	}
);
