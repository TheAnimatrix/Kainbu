import { DEFAULT_COLUMN_WIDTH, EMPTY_PROJECT } from '$lib/kainbu/constants';
import { createId } from '$lib/kainbu/id';
import { normalizeProjectStructure } from '$lib/kainbu/projectStructure';
import { normalizeScratchpadData } from '$lib/kainbu/scratchpad';
import type {
	ChatAttachment,
	ChatMessage,
	LegacySession,
	Project
} from '$lib/kainbu/types';

type SharedProjectBackup = {
	version: 2;
	projects: Array<{
		name: string;
		kanbanData?: Project['kanbanData'];
		scratchpadData?: Project['scratchpadData'] | string;
		boards?: Project['boards'];
		pages?: Project['pages'];
		activeBoardId?: string;
		activePageId?: string;
		createdAt?: number;
		updatedAt?: number;
		viewerLastOpenedAt?: number;
	}>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizeLegacyAttachments = (images?: string[]): ChatAttachment[] => {
	if (!images?.length) return [];

	return images.map((content, index) => ({
		id: createId(),
		kind: 'image',
		name: `legacy-image-${index + 1}.png`,
		mimeType: 'image/png',
		content
	}));
};

const normalizeChatHistory = (history: LegacySession['chatHistory']): ChatMessage[] =>
	history.map((message) => ({
		id: createId(),
		role: message.role === 'model' ? 'assistant' : 'user',
		text: message.text,
		timestamp: message.timestamp,
		attachments: normalizeLegacyAttachments(message.images),
		metadata: message.metadata,
		toolActions: message.toolActions
	}));

const normalizeKanbanData = (
	value: Project['kanbanData'] | undefined,
	fallback: Project['kanbanData']
) =>
	(value || fallback).map((column, index) => ({
		...column,
		id: column.id || `column-${index + 1}`,
		color: typeof column.color === 'string' && column.color.trim() ? column.color : undefined,
		width: column.width ?? DEFAULT_COLUMN_WIDTH,
		tasks: (column.tasks || []).map((task, taskIndex) => ({
			...task,
			id: task.id || `task-${index + 1}-${taskIndex + 1}`,
			color: typeof task.color === 'string' && task.color.trim() ? task.color : undefined,
			tags: (task.tags || []).map((tag, tagIndex) => ({
				...tag,
				id: tag.id || `tag-${index + 1}-${taskIndex + 1}-${tagIndex + 1}`
			}))
		}))
	}));

const normalizeProject = (
	candidate: Partial<Project> & { name?: string; scratchpadData?: Project['scratchpadData'] | string },
	userId: string
): Project => {
	const now = Date.now();
	const seed = EMPTY_PROJECT(userId, candidate.name || 'Imported Project');
	const normalizedProject: Project = {
		...seed,
		id: createId(),
		ownerUserId: userId,
		accessRole: 'owner',
		name: candidate.name || seed.name,
		boards: candidate.boards?.length
			? candidate.boards.map((board, index) => ({
					...board,
					id: board.id || createId(),
					projectId: seed.id,
					position: board.position ?? index,
					kanbanData: normalizeKanbanData(board.kanbanData, seed.kanbanData),
					createdAt: board.createdAt || now,
					updatedAt: board.updatedAt || now
				}))
			: [
					{
						...seed.boards[0],
						projectId: seed.id,
						kanbanData: normalizeKanbanData(candidate.kanbanData, seed.kanbanData)
					}
				],
		pages: candidate.pages?.length
			? candidate.pages.map((page, index) => ({
					...page,
					id: page.id || createId(),
					projectId: seed.id,
					position: page.position ?? index,
					content: typeof page.content === 'string' ? page.content : '',
					createdAt: page.createdAt || now,
					updatedAt: page.updatedAt || now
				}))
			: [
					{
						...seed.pages[0],
						projectId: seed.id,
						content: normalizeScratchpadData(
							candidate.scratchpadData,
							seed.scratchpadData.pads[0]?.content || ''
						).pads[0]?.content || ''
					}
				],
		activeBoardId: candidate.activeBoardId || candidate.boards?.[0]?.id || seed.boards[0].id,
		activePageId: candidate.activePageId || candidate.pages?.[0]?.id || seed.pages[0].id,
		kanbanData: normalizeKanbanData(candidate.kanbanData, seed.kanbanData),
		scratchpadData: normalizeScratchpadData(
			candidate.scratchpadData,
			seed.scratchpadData.pads[0]?.content || ''
		),
		chatHistory: seed.chatHistory,
		members: [],
		invites: [],
		scratchpadRev: 0,
		createdAt: candidate.createdAt || now,
		updatedAt: candidate.updatedAt || now,
		viewerLastOpenedAt: candidate.viewerLastOpenedAt || now
	};

	return normalizeProjectStructure(normalizedProject);
};

const normalizeLegacySession = (session: LegacySession, userId: string): Project => {
	const seed = EMPTY_PROJECT(userId, session.name);

	return normalizeProjectStructure({
		...seed,
		id: createId(),
		name: session.name || seed.name,
		boards: [
			{
				...seed.boards[0],
				projectId: seed.id,
				kanbanData: normalizeKanbanData(session.kanbanData, seed.kanbanData)
			}
		],
		pages: [
			{
				...seed.pages[0],
				projectId: seed.id,
				content: normalizeScratchpadData(session.scratchpadData).pads[0]?.content || ''
			}
		],
		kanbanData: normalizeKanbanData(session.kanbanData, seed.kanbanData),
		scratchpadData: normalizeScratchpadData(session.scratchpadData),
		chatHistory: normalizeChatHistory(session.chatHistory || []),
		createdAt: session.createdAt || seed.createdAt,
		updatedAt: session.lastModified || session.createdAt || seed.updatedAt,
		viewerLastOpenedAt: session.lastModified || seed.viewerLastOpenedAt
	});
};

export const exportProjectsToFile = (projects: Project[]) => {
	const payload: SharedProjectBackup = {
		version: 2,
		projects: projects.map((project) => ({
			name: project.name,
			boards: project.boards,
			pages: project.pages,
			activeBoardId: project.activeBoardId,
			activePageId: project.activePageId,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			viewerLastOpenedAt: project.viewerLastOpenedAt
		}))
	};
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `kainbu-backup-${new Date().toISOString().slice(0, 10)}.json`;
	link.click();
	URL.revokeObjectURL(url);
};

export const parseProjectsImport = async (file: File, userId: string): Promise<Project[]> => {
	const text = await file.text();
	const parsed = JSON.parse(text) as unknown;

	if (
		isObject(parsed) &&
		parsed.version === 2 &&
		Array.isArray((parsed as { projects?: unknown[] }).projects)
	) {
		return (parsed as { projects: unknown[] }).projects.map((project) =>
			normalizeProject(project as Partial<Project>, userId)
		);
	}

	if (
		isObject(parsed) &&
		parsed.version === 1 &&
		Array.isArray((parsed as { projects?: unknown[] }).projects)
	) {
		return (parsed as { projects: unknown[] }).projects.map((project) =>
			normalizeProject(project as Partial<Project>, userId)
		);
	}

	if (Array.isArray(parsed)) {
		return parsed.map((item) => normalizeLegacySession(item as LegacySession, userId));
	}

	throw new Error('Unsupported backup format.');
};
