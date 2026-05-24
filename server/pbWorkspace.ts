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

export const projectRelationFilter = (projectPbId: string) =>
	`project = "${pbEscapeFilter(projectPbId)}"`;
