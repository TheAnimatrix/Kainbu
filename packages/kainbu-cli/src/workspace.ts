import { invokeWorkspaceApi } from '@kainbu/core';
import type { Project, ProjectInvite } from '../../../src/lib/kainbu/types.js';
import { initRuntime } from './runtime.js';

export type WorkspaceSnapshot = { projects: Project[]; incomingInvites: ProjectInvite[] };

/** The snapshot invents a placeholder board/page for empty projects; they are not stored. */
const isPlaceholderId = (id: string) => id.startsWith('__fallback_');

/**
 * Reads the workspace snapshot without AI chat sessions, which the CLI never
 * uses. `projectId` asks the server for that project only; servers that
 * predate scoping ignore both parameters and return everything, so callers
 * must still look the project up in the result.
 */
export const loadWorkspace = async (projectId?: string): Promise<WorkspaceSnapshot> => {
	await initRuntime();
	const params = new URLSearchParams({ ai: '0' });
	if (projectId) params.set('projectId', projectId);
	const snapshot = await invokeWorkspaceApi<WorkspaceSnapshot>(
		`/api/workspace/snapshot?${params}`,
		{ method: 'GET' }
	);
	return {
		...snapshot,
		projects: snapshot.projects.map((project) => ({
			...project,
			boards: (project.boards || []).filter((board) => !isPlaceholderId(board.id)),
			pages: (project.pages || []).filter((page) => !isPlaceholderId(page.id)),
			members: project.members || []
		}))
	};
};
