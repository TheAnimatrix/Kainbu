/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateRequest((e) => {
	if (e.collection.name !== 'users') return;
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
	e.next();
}, 'users');
