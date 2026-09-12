// Helpers are loaded inside each hook: PocketBase uses isolated hook VMs.
const find = (app, collection, filter, params) =>
	app.findRecordsByFilter(collection, filter, '', 1, 0, params)[0] || null;
const conflict = (message) => {
	throw new ApiError(409, message);
};
const requireText = (value, name) => {
	if (typeof value !== 'string' || !value.trim()) throw new BadRequestError(`${name} is required.`);
	return value.trim();
};
const actor = (app, e, body) => {
	if (e.hasSuperuserAuth() && !body.userId) return null;
	const id = e.hasSuperuserAuth() ? requireText(body.userId, 'userId') : e.auth?.id;
	if (!id) throw new UnauthorizedError('Unauthorized');
	const user = app.findRecordById('users', id);
	if (user.get('disabled') === true) throw new UnauthorizedError('Unauthorized');
	return user;
};
const projectAccess = (app, e, body) => {
	const user = actor(app, e, body);
	const project = find(app, 'projects', 'client_id = {:id}', {
		id: requireText(body.projectId, 'projectId')
	});
	if (!project) throw new NotFoundError('Project not found.');
	if (
		user &&
		!find(app, 'project_memberships', 'project = {:project} && user = {:user} && left_at = ""', {
			project: project.id,
			user: user.id
		})
	)
		throw new ForbiddenError('Forbidden');
	return project;
};
const fieldValue = (field, value) => {
	if (
		['completed_at', 'countdown_at', 'alarm_at', 'position', 'width', 'deleted_at'].includes(field)
	)
		return Number(value) || 0;
	if (['has_checkbox', 'checked'].includes(field)) return value === true;
	if (['tags', 'linked_task_ids'].includes(field)) return value || [];
	return value == null ? '' : value;
};
const canonical = (value) => {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		const sorted = {};
		for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
		return sorted;
	}
	return value;
};
const readField = (record, field) =>
	['tags', 'linked_task_ids'].includes(field)
		? JSON.parse(record.getString(field) || '[]')
		: record.get(field);
const same = (field, a, b) =>
	JSON.stringify(canonical(fieldValue(field, a))) ===
	JSON.stringify(canonical(fieldValue(field, b)));
const columns = ['title', 'color', 'width', 'position'];
const tasks = [
	'column_id',
	'title',
	'description',
	'color',
	'tags',
	'has_checkbox',
	'checked',
	'completed_at',
	'countdown_at',
	'alarm_at',
	'assigned_to',
	'linked_task_ids',
	'position',
	'deleted_at'
];
const child = (app, collection, project, id) =>
	find(app, collection, 'project = {:project} && client_id = {:id}', { project: project.id, id });
const checkBoard = (record, board) => {
	if (record.getString('board') !== board.id)
		conflict('The item moved to another board. Refresh before editing.');
};

exports.syncBoard = (e) => {
	const body = e.requestInfo().body;
	const mutations = body.mutations;
	if (
		!mutations ||
		!['upsertColumns', 'upsertTasks', 'deleteColumns', 'deleteTasks'].every((key) =>
			Array.isArray(mutations[key])
		)
	)
		throw new BadRequestError('Invalid board mutations.');
	e.app.runInTransaction((app) => {
		const project = projectAccess(app, e, body);
		const board = child(app, 'project_boards', project, requireText(body.boardId, 'boardId'));
		if (!board) throw new NotFoundError('Board not found.');
		const upsert = (collection, rows, fields) => {
			for (const row of rows) {
				if (!row || typeof row !== 'object' || (row.previous && typeof row.previous !== 'object'))
					throw new BadRequestError('Invalid item.');
				const id = requireText(row.id, 'item id');
				let record = child(app, collection, project, id);
				if (record) checkBoard(record, board);
				if (!record && row.previous) conflict('An item was deleted while you were editing.');
				if (record && collection === 'project_tasks') {
					const deleted = record.getFloat('deleted_at') > 0;
					const wasDeleted = Number(row.previous?.deleted_at) > 0;
					const deleting = Number(row.deleted_at) > 0;
					if (deleted && !deleting && !wasDeleted)
						conflict('This task was deleted while you were editing. Refresh before retrying.');
					if (deleted && deleting && !wasDeleted) continue;
					if (
						deleting &&
						!wasDeleted &&
						row.previous &&
						!tasks.every((field) => same(field, readField(record, field), row.previous[field]))
					)
						conflict('This task changed while you were deleting it. Refresh before retrying.');
				}
				const creating = !record;
				if (!record) {
					record = new Record(app.findCollectionByNameOrId(collection));
					record.set('project', project.id);
					record.set('board', board.id);
					record.set('client_id', id);
				}
				let changed = creating;
				for (const field of fields) {
					if (!(field in row)) throw new BadRequestError(`Missing ${field}.`);
					if (row.previous && same(field, row.previous[field], row[field])) continue;
					const current = readField(record, field);
					if (!creating && same(field, current, row[field])) continue; // idempotent retry
					if (!creating && (!row.previous || !same(field, current, row.previous[field])))
						conflict(`The ${field} changed while you were editing. Refresh before retrying.`);
					record.set(field, fieldValue(field, row[field]));
					changed = true;
				}
				if (changed) app.save(record);
			}
		};
		upsert('project_columns', mutations.upsertColumns, columns);
		upsert('project_tasks', mutations.upsertTasks, tasks);
		const remove = (collection, rows, fields) => {
			for (const row of rows) {
				const record = child(app, collection, project, requireText(row.id, 'item id'));
				if (!record) continue;
				if (collection === 'project_tasks' && record.getFloat('deleted_at') > 0) continue;
				checkBoard(record, board);
				if (!fields.every((field) => same(field, readField(record, field), row[field])))
					conflict('An item changed while you were deleting it. Refresh before retrying.');
				if (
					collection === 'project_columns' &&
					find(
						app,
						'project_tasks',
						'project = {:project} && board = {:board} && column_id = {:column} && deleted_at = 0',
						{ project: project.id, board: board.id, column: row.id }
					)
				)
					conflict('A task was added to this column while you were deleting it.');
				if (collection === 'project_tasks') {
					record.set('deleted_at', Date.now());
					app.save(record);
				} else app.delete(record);
			}
		};
		remove('project_tasks', mutations.deleteTasks, tasks);
		remove('project_columns', mutations.deleteColumns, columns);
		app.save(board); // Advance the timestamp used by realtime snapshot merging, including deletes.
	});
	return e.json(200, { ok: true });
};

exports.scratchpad = (e) => {
	const body = e.requestInfo().body;
	if (
		typeof body.scratchpadData !== 'string' ||
		!Number.isInteger(body.expectedRevision) ||
		body.expectedRevision < 0
	)
		throw new BadRequestError('Invalid scratchpad update.');
	let result;
	e.app.runInTransaction((app) => {
		const project = projectAccess(app, e, body);
		const matches = project.getInt('scratchpad_rev') === body.expectedRevision;
		if (matches) {
			project.set('scratchpad_data', body.scratchpadData);
			project.set('scratchpad_rev', body.expectedRevision + 1);
			app.save(project);
		}
		result = {
			ok: matches,
			scratchpadData: project.getString('scratchpad_data'),
			scratchpadRev: project.getInt('scratchpad_rev'),
			updatedAt: Date.parse(project.getString('updated'))
		};
	});
	return e.json(200, result);
};

exports.respondInvite = (e) => {
	const body = e.requestInfo().body;
	if (typeof body.accept !== 'boolean') throw new BadRequestError('accept is required.');
	e.app.runInTransaction((app) => {
		const user = actor(app, e, body);
		if (!user) throw new BadRequestError('An acting user is required.');
		const invite = app.findRecordById('project_invites', requireText(body.inviteId, 'inviteId'));
		const invitee = invite.getString('invitee');
		const emailMatches =
			invite.getString('invitee_email').toLowerCase() === user.getString('email').toLowerCase();
		if (invitee ? invitee !== user.id : !emailMatches)
			throw new ForbiddenError('You can only respond to your own invite.');
		const target = body.accept ? 'accepted' : 'rejected';
		if (invite.getString('status') === target) return; // An accepted invite must not re-enroll a subsequently removed member.
		if (invite.getString('status') !== 'pending') conflict('This invite has already been handled.');
		if (body.accept) {
			const membership = find(
				app,
				'project_memberships',
				'project = {:project} && user = {:user}',
				{ project: invite.getString('project'), user: user.id }
			);
			if (membership) {
				membership.set('left_at', '');
				membership.set('last_opened_at', new Date().toISOString());
				app.save(membership);
			} else {
				const created = new Record(app.findCollectionByNameOrId('project_memberships'));
				created.set('project', invite.getString('project'));
				created.set('user', user.id);
				created.set('role', 'member');
				created.set('joined_at', new Date().toISOString());
				created.set('last_opened_at', new Date().toISOString());
				app.save(created);
			}
		}
		invite.set('invitee', user.id);
		invite.set('status', target);
		invite.set('responded_at', new Date().toISOString());
		app.save(invite);
	});
	return e.json(200, { ok: true });
};

exports.deleteChildren = (e) => {
	e.app.runInTransaction((app) => {
		e.app = app;
		const record = e.record;
		if (record.collection().name === 'project_columns') {
			for (const task of app.findRecordsByFilter(
				'project_tasks',
				'project = {:project} && board = {:board} && column_id = {:column}',
				'',
				0,
				0,
				{
					project: record.getString('project'),
					board: record.getString('board'),
					column: record.getString('client_id')
				}
			))
				app.delete(task);
		} else {
			for (const name of ['project_task_assets', 'project_task_comments']) {
				for (const child of app.findRecordsByFilter(
					name,
					'project = {:project} && task_client_id = {:task}',
					'',
					0,
					0,
					{ project: record.getString('project'), task: record.getString('client_id') }
				))
					app.delete(child);
			}
		}
		e.next();
	});
};

exports.page = (e) => {
	const body = e.requestInfo().body;
	if (typeof body.content !== 'string' || typeof body.previousContent !== 'string')
		throw new BadRequestError('Page content and previousContent are required.');
	e.app.runInTransaction((app) => {
		const project = projectAccess(app, e, body);
		const page = child(app, 'project_pages', project, requireText(body.pageId, 'pageId'));
		if (!page) throw new NotFoundError('Page not found.');
		if (page.getString('content') === body.content) return;
		if (page.getString('content') !== body.previousContent)
			conflict('This page changed while you were editing. Your local draft has been kept.');
		page.set('content', body.content);
		app.save(page);
	});
	return e.json(200, { ok: true });
};
