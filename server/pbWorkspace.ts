import type PocketBase from 'pocketbase';

export const pbEscapeFilter = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const projectClientFilter = (clientId: string) =>
	`client_id = "${pbEscapeFilter(clientId)}"`;

export const getProjectRecord = async (admin: PocketBase, projectClientId: string) => {
	return admin.collection('projects').getFirstListItem(projectClientFilter(projectClientId));
};

export const getProjectPbId = async (admin: PocketBase, projectClientId: string) => {
	const project = await getProjectRecord(admin, projectClientId);
	return String(project.id);
};

/** Resolve app project client_id from a PB invite row (expand may be missing). */
export const resolveProjectClientId = async (
	admin: PocketBase,
	projectPbId: string,
	expandedProject?: { client_id?: string } | null
) => {
	if (expandedProject?.client_id) {
		return String(expandedProject.client_id);
	}
	const project = await admin.collection('projects').getOne(projectPbId);
	return String(project.client_id || project.id);
};

export const projectRelationFilter = (projectPbId: string) =>
	`project = "${pbEscapeFilter(projectPbId)}"`;
