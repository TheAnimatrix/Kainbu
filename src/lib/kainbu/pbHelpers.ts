import { getPb } from '$lib/kainbu/pocketbaseContext';
import { pbNoAutoCancel } from '$lib/kainbu/pbRequest';
import { pbEscapeFilter, projectClientFilter, projectRelationFilter } from '$lib/kainbu/pbRecords';
import { isPocketBaseNotFound, isProjectPagesStrayIdFieldError } from '$lib/pocketbaseErrors';

export const getProjectPbId = async (projectClientId: string) => {
	const pb = getPb();
	const record = await pb.collection('projects').getFirstListItem(projectClientFilter(projectClientId));
	return String(record.id);
};

export const getBoardPbId = async (projectClientId: string, boardClientId: string) => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectClientId);
	const record = await pb.collection('project_boards').getFirstListItem(
		`${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(boardClientId)}"`
	);
	return String(record.id);
};

export const listByProjectIds = async (
	collection: string,
	projectClientIds: string[],
	sort = ''
) => {
	if (!projectClientIds.length) return [] as Record<string, unknown>[];

	const pb = getPb();
	const filter = projectClientIds
		.map((id) => `project.client_id = "${pbEscapeFilter(id)}"`)
		.join(' || ');

	return pb.collection(collection).getFullList({
		filter,
		...(sort ? { sort } : {}),
		...pbNoAutoCancel
	});
};

export const deleteByProjectAndClientIds = async (
	collection: string,
	projectClientId: string,
	clientIds: string[]
) => {
	if (!clientIds.length) return;
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectClientId);
	const records = await pb.collection(collection).getFullList({
		filter: `${projectRelationFilter(projectPbId)} && (${clientIds
			.map((id) => `client_id = "${pbEscapeFilter(id)}"`)
			.join(' || ')})`,
		...pbNoAutoCancel
	});
	await Promise.all(records.map((record) => pb.collection(collection).delete(record.id)));
};

export const upsertProjectChild = async (
	collection: string,
	projectClientId: string,
	clientId: string,
	body: Record<string, unknown>
) => {
	const pb = getPb();
	const projectPbId = await getProjectPbId(projectClientId);
	const filter = `${projectRelationFilter(projectPbId)} && client_id = "${pbEscapeFilter(clientId)}"`;

	try {
		const existing = await pb.collection(collection).getFirstListItem(filter);
		await pb.collection(collection).update(existing.id, body);
		return existing.id;
	} catch (error) {
		if (!isPocketBaseNotFound(error)) throw error;
		try {
			const created = await pb.collection(collection).create({
				...body,
				project: projectPbId,
				client_id: clientId
			});
			return created.id;
		} catch (createError) {
			if (!isProjectPagesStrayIdFieldError(createError)) throw createError;
			const created = await pb.collection(collection).create({
				...body,
				project: projectPbId,
				client_id: clientId,
				id: clientId
			});
			return created.id;
		}
	}
};
