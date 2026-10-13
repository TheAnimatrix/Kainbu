import { invokeWorkspaceApi } from '@kainbu/core';
import type { BoardPreferences, KanbanData } from '../../../src/lib/kainbu/types.js';
import { KainbuError } from './errors.js';
import { rawWorkspaceRequest } from './http.js';

/**
 * Every CLI write goes through the workspace HTTP API. The CLI authenticates
 * with an API key (or device-login JWT) and has no PocketBase session, so it
 * must never call the PocketBase SDK directly. The server applies these
 * mutations with the admin client after checking project membership.
 */

export const syncProjectBoard = async (
	projectId: string,
	boardId: string,
	previous: KanbanData,
	next: KanbanData
) => {
	await invokeWorkspaceApi('/api/workspace/boards/sync', {
		body: { projectId, boardId, previous, next }
	});
};

export const createProjectBoard = async (projectId: string, name: string, position: number) =>
	invokeWorkspaceApi<{ ok: boolean; id: string; name: string }>('/api/workspace/boards/create', {
		body: { projectId, name, position }
	});

export const renameProjectBoard = async (projectId: string, boardId: string, name: string) => {
	await invokeWorkspaceApi('/api/workspace/boards/rename', {
		body: { projectId, boardId, name }
	});
};

export const deleteProjectBoard = async (projectId: string, boardId: string) => {
	await invokeWorkspaceApi('/api/workspace/boards/delete', {
		body: { projectId, boardId }
	});
};

export const createProjectPage = async (
	projectId: string,
	name: string,
	position: number,
	content?: string
) =>
	invokeWorkspaceApi<{ ok: boolean; id: string; name: string }>('/api/workspace/pages/create', {
		body: { projectId, name, position, content }
	});

export const renameProjectPage = async (projectId: string, pageId: string, name: string) => {
	await invokeWorkspaceApi('/api/workspace/pages/rename', {
		body: { projectId, pageId, name }
	});
};

export const updateProjectPageContent = async (
	projectId: string,
	pageId: string,
	content: string,
	previousContent: string
) => {
	await invokeWorkspaceApi('/api/workspace/pages/content', {
		body: { projectId, pageId, content, previousContent }
	});
};

export const deleteProjectPage = async (projectId: string, pageId: string) => {
	await invokeWorkspaceApi('/api/workspace/pages/delete', {
		body: { projectId, pageId }
	});
};

export const createProject = async (name: string) =>
	invokeWorkspaceApi<{ ok: boolean; id: string; name: string }>('/api/workspace/projects/create', {
		body: { name }
	});

export const renameProject = async (projectId: string, name: string) => {
	await invokeWorkspaceApi('/api/workspace/projects/rename', {
		body: { projectId, name }
	});
};

// ---------------------------------------------------------------------------
// Endpoints added with CLI 0.2.1. An older server answers them with Hono's
// plain "404 Not Found"; report that as an outdated server, not a missing item.
// ---------------------------------------------------------------------------

const requireServerSupport = async <T>(path: string, request: () => Promise<T>) => {
	try {
		return await request();
	} catch (error) {
		const status =
			error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
		const message = error instanceof Error ? error.message : '';
		if (status === 404 && /^404 Not Found$|missing that API route/i.test(message.trim()))
			throw new KainbuError(`This Kainbu server does not support ${path}.`, {
				code: 'unsupported_server',
				exitCode: 1,
				hint: 'Update the Kainbu server to the release that matches this CLI.'
			});
		throw error;
	}
};

export type TaskComment = {
	id: string;
	taskId: string;
	body: string;
	authorUserId: string;
	authorUsername: string | null;
	createdAt: number;
	updatedAt: number;
};

export type WorkspaceAsset = {
	id: string;
	target: AssetTarget;
	targetId: string;
	kind: 'attachment' | 'embed';
	name: string;
	mimeType: string;
	sizeBytes: number;
	uploadedBy: string;
	uploadedByUsername: string | null;
	createdAt: number;
};

export type AssetTarget = 'task' | 'page';

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const listTaskComments = (projectId: string, taskId: string) =>
	requireServerSupport('task comments', () =>
		invokeWorkspaceApi<{ comments: TaskComment[] }>(
			`/api/workspace/tasks/comments?${query({ projectId, taskId })}`,
			{ method: 'GET' }
		)
	);

export const createTaskComment = (projectId: string, taskId: string, body: string) =>
	requireServerSupport('task comments', () =>
		invokeWorkspaceApi<{ ok: boolean; comment: TaskComment }>(
			'/api/workspace/tasks/comments/create',
			{ body: { projectId, taskId, body } }
		)
	);

export const deleteTaskComment = (projectId: string, commentId: string) =>
	requireServerSupport('task comments', () =>
		invokeWorkspaceApi<{ ok: boolean }>('/api/workspace/tasks/comments/delete', {
			body: { projectId, commentId }
		})
	);

export const listAssets = (projectId: string, target: AssetTarget, targetId: string) =>
	requireServerSupport('attachments', () =>
		invokeWorkspaceApi<{ assets: WorkspaceAsset[] }>(
			`/api/workspace/assets?${query({ projectId, target, targetId })}`,
			{ method: 'GET' }
		)
	);

export const deleteAsset = (projectId: string, target: AssetTarget, assetId: string) =>
	requireServerSupport('attachments', () =>
		invokeWorkspaceApi<{ ok: boolean }>('/api/workspace/assets/delete', {
			body: { projectId, target, assetId }
		})
	);

export const uploadAsset = (
	projectId: string,
	target: AssetTarget,
	targetId: string,
	file: File,
	kind: 'attachment' | 'embed'
) =>
	requireServerSupport('attachments', async () => {
		const form = new FormData();
		form.set('projectId', projectId);
		form.set('target', target);
		form.set('targetId', targetId);
		form.set('kind', kind);
		form.set('file', file);
		const response = await rawWorkspaceRequest('/api/workspace/assets/upload', {
			method: 'POST',
			body: form
		});
		return (await response.json()) as { ok: boolean; asset: WorkspaceAsset };
	});

export const downloadAsset = (projectId: string, target: AssetTarget, assetId: string) =>
	requireServerSupport('attachments', () =>
		rawWorkspaceRequest(`/api/workspace/assets/download?${query({ projectId, target, assetId })}`, {
			method: 'GET'
		})
	);

export const updateBoardPreferences = (
	projectId: string,
	boardId: string,
	preferences?: Partial<BoardPreferences>
) =>
	requireServerSupport('board settings', () =>
		invokeWorkspaceApi<{ ok: boolean; preferences: BoardPreferences }>(
			'/api/workspace/boards/preferences',
			{ body: { projectId, boardId, preferences } }
		)
	);

export const reorderProjectChildren = (
	kind: 'boards' | 'pages',
	projectId: string,
	ids: string[]
) =>
	requireServerSupport(`${kind.slice(0, -1)} reordering`, () =>
		invokeWorkspaceApi<{ ok: boolean }>(`/api/workspace/${kind}/reorder`, {
			body: { projectId, ids }
		})
	);

export const updateBoardShare = (projectId: string, boardId: string, sharePublic?: boolean) =>
	invokeWorkspaceApi<{ shareSlug: string; sharePublic: boolean; shareUrl: string }>(
		'/api/workspace/boards/share',
		{ body: { projectId, boardId, ...(sharePublic === undefined ? {} : { sharePublic }) } }
	);

export const moveTasksToBoard = (body: {
	projectId: string;
	fromBoardId: string;
	toBoardId: string;
	columnId: string;
	taskIds: string[];
}) =>
	requireServerSupport('moving tasks between boards', () =>
		invokeWorkspaceApi<{ ok: boolean }>('/api/workspace/tasks/move', { body })
	);
