onRecordCreateRequest((e) => {
	if (!e.hasSuperuserAuth()) {
		const settings = e.app.findRecordsByFilter('app_settings', 'singleton = "main"', '', 1, 0);
		if (settings.length && settings[0].get('signups_enabled') === false) {
			throw new ForbiddenError('Signups are disabled.');
		}
		// An account that has not proved email ownership cannot acquire a verified identity.
		e.record.set('verified', false);
	}
	e.next();
}, 'users');
