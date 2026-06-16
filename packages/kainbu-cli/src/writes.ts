import { invokeWorkspaceApi } from '@kainbu/core';
import type { KanbanData, ScratchpadData } from '../../../src/lib/kainbu/types.js';

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
	content: string
) => {
	await invokeWorkspaceApi('/api/workspace/pages/content', {
		body: { projectId, pageId, content }
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

export const fetchProjectScratchpadMeta = async (projectId: string) =>
	invokeWorkspaceApi<{
		id: string;
		name: string;
		scratchpadData: ScratchpadData;
		scratchpadRev: number;
	}>(`/api/workspace/projects/scratchpad?projectId=${encodeURIComponent(projectId)}`, {
		method: 'GET'
	});
