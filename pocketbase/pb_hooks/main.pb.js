/// <reference path="../pb_data/types.d.ts" />

onRecordCreate((e) => {
	if (e.collection.name !== 'users') {
		return e.next();
	}
	const record = e.record;
	if (!record.get('default_show_checkbox')) {
		record.set('default_show_checkbox', true);
	}
	if (!record.get('preferred_ai_model_id')) {
		record.set('preferred_ai_model_id', 'openai/gpt-4o-mini');
	}
	if (!record.get('preferred_model_preset')) {
		record.set('preferred_model_preset', 'fast');
	}
	return e.next();
}, 'users');

onRecordAfterCreateSuccess((e) => {
	if (e.collection.name !== 'projects') {
		return e.next();
	}

	const project = e.record;
	const ownerId = String(project.get('owner') || '');
	if (!ownerId) {
		return e.next();
	}

	try {
		$app.findFirstRecordByFilter(
			'project_memberships',
			'project = {:project} && user = {:user}',
			{ project: project.id, user: ownerId }
		);
	} catch {
		const collection = $app.findCollectionByNameOrId('project_memberships');
		const membership = new Record(collection);
		membership.set('project', project.id);
		membership.set('user', ownerId);
		membership.set('role', 'owner');
		membership.set('joined_at', new Date().toISOString());
		membership.set('last_opened_at', new Date().toISOString());
		$app.save(membership);
	}

	return e.next();
}, 'projects');
