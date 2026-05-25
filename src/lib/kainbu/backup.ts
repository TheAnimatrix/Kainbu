import { DEFAULT_COLUMN_WIDTH, EMPTY_PROJECT } from '$lib/kainbu/constants';
import { createId } from '$lib/kainbu/id';
import { normalizeProjectStructure } from '$lib/kainbu/projectStructure';
import { normalizeScratchpadData } from '$lib/kainbu/scratchpad';
import type {
	ChatAttachment,
	ChatMessage,
	Column,
	KanbanData,
	LegacySession,
	Project,
	ProjectBoard,
	ProjectPage,
	Tag,
	Task
} from '$lib/kainbu/types';

const BACKUP_VERSION = 3;

type BackupTag = Pick<Tag, 'label' | 'color'>;

type BackupTask = Omit<Task, 'id' | 'tags' | 'linkedTaskIds'> & {
	tags: BackupTag[];
};

type BackupColumn = Omit<Column, 'id' | 'tasks'> & {
	tasks: BackupTask[];
};

type BackupBoard = {
	name: string;
	position: number;
	kanbanData: BackupColumn[];
};

type BackupPage = {
	name: string;
	position: number;
	content: string;
};

type WorkspaceBackup = {
	version: typeof BACKUP_VERSION;
	projects: Array<{
		name: string;
		boards: BackupBoard[];
		pages: BackupPage[];
	}>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const stripTagForBackup = (tag: Tag): BackupTag => ({
	label: tag.label,
	color: tag.color
});

const stripTaskForBackup = (task: Task): BackupTask => {
	const { id: _id, linkedTaskIds: _links, tags, assignedTo: _assignedTo, ...rest } = task;
	return {
		...rest,
		tags: (tags || []).map(stripTagForBackup)
	};
};

const stripKanbanForBackup = (kanbanData: KanbanData): BackupColumn[] =>
	kanbanData.map((column) => {
		const { id: _id, tasks, ...rest } = column;
		return {
			...rest,
			tasks: (tasks || []).map(stripTaskForBackup)
		};
	});

const stripBoardForBackup = (board: ProjectBoard, index: number): BackupBoard => ({
	name: board.name,
	position: Number.isFinite(board.position) ? board.position : index,
	kanbanData: stripKanbanForBackup(board.kanbanData || [])
});

const stripPageForBackup = (page: ProjectPage, index: number): BackupPage => ({
	name: page.name,
	position: Number.isFinite(page.position) ? page.position : index,
	content: typeof page.content === 'string' ? page.content : ''
});

const importKanbanData = (
	value: KanbanData | BackupColumn[] | undefined,
	fallback: KanbanData
): { kanbanData: KanbanData; taskIdMap: Map<string, string> } => {
	const taskIdMap = new Map<string, string>();
	const source = (value || fallback).length ? value || fallback : fallback;

	const kanbanData = source.map((column, columnIndex) => {
		const tasks = (column.tasks || []).map((task, taskIndex) => {
			const legacyTaskId = 'id' in task && typeof task.id === 'string' ? task.id : '';
			const nextTaskId = createId();
			if (legacyTaskId) {
				taskIdMap.set(legacyTaskId, nextTaskId);
			}

			const legacyTags = task.tags || [];
			const tags = legacyTags.map((tag, tagIndex) => ({
				label: tag.label,
				color: tag.color,
				id: createId()
			}));

			const {
				id: _id,
				linkedTaskIds: _linked,
				tags: _tags,
				...rest
			} = task as Task;

			return {
				...rest,
				id: nextTaskId,
				color: typeof rest.color === 'string' && rest.color.trim() ? rest.color : undefined,
				tags,
				linkedTaskIds: [] as string[]
			} satisfies Task;
		});

		return {
			id: createId(),
			title: column.title || `Column ${columnIndex + 1}`,
			color: typeof column.color === 'string' && column.color.trim() ? column.color : undefined,
			width: column.width ?? DEFAULT_COLUMN_WIDTH,
			tasks
		} satisfies Column;
	});

	for (const column of source) {
		for (const task of column.tasks || []) {
			const legacyTaskId = 'id' in task && typeof task.id === 'string' ? task.id : '';
			const legacyLinks =
				'linkedTaskIds' in task && Array.isArray(task.linkedTaskIds) ? task.linkedTaskIds : [];
			if (!legacyTaskId || !legacyLinks.length) continue;

			const nextTaskId = taskIdMap.get(legacyTaskId);
			if (!nextTaskId) continue;

			const remapped = legacyLinks
				.map((linkedId) => taskIdMap.get(linkedId))
				.filter((linkedId): linkedId is string => Boolean(linkedId));

			const targetColumn = kanbanData.find((entry) =>
				entry.tasks.some((entryTask) => entryTask.id === nextTaskId)
			);
			const targetTask = targetColumn?.tasks.find((entryTask) => entryTask.id === nextTaskId);
			if (targetTask) {
				targetTask.linkedTaskIds = remapped;
			}
		}
	}

	return { kanbanData, taskIdMap };
};

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

const normalizeProject = (
	candidate: Record<string, unknown> & { name?: string },
	userId: string
): Project => {
	const now = Date.now();
	const seed = EMPTY_PROJECT(userId, typeof candidate.name === 'string' ? candidate.name : 'Imported Project');
	const legacyKanban =
		Array.isArray(candidate.kanbanData) ? (candidate.kanbanData as KanbanData) : undefined;
	const legacyBoards = Array.isArray(candidate.boards) ? (candidate.boards as Array<Partial<ProjectBoard>>) : [];
	const legacyPages = Array.isArray(candidate.pages) ? (candidate.pages as Array<Partial<ProjectPage>>) : [];

	const boards: ProjectBoard[] = legacyBoards.length
		? legacyBoards.map((board, index) => {
				const { kanbanData } = importKanbanData(
					(board.kanbanData as KanbanData | undefined) || legacyKanban,
					seed.kanbanData
				);
				return {
					id: createId(),
					projectId: seed.id,
					name: typeof board.name === 'string' && board.name.trim() ? board.name : `Board ${index + 1}`,
					position: typeof board.position === 'number' ? board.position : index,
					kanbanData,
					createdAt: now,
					updatedAt: now
				};
			})
		: [
				{
					id: createId(),
					projectId: seed.id,
					name: 'Board',
					position: 0,
					kanbanData: importKanbanData(legacyKanban, seed.kanbanData).kanbanData,
					createdAt: now,
					updatedAt: now
				}
			];

	const pages: ProjectPage[] = legacyPages.length
		? legacyPages.map((page, index) => ({
				id: createId(),
				projectId: seed.id,
				name: typeof page.name === 'string' && page.name.trim() ? page.name : `Page ${index + 1}`,
				position: typeof page.position === 'number' ? page.position : index,
				content: typeof page.content === 'string' ? page.content : '',
				createdAt: now,
				updatedAt: now
			}))
		: [
				{
					id: createId(),
					projectId: seed.id,
					name: 'Notes',
					position: 0,
					content: normalizeScratchpadData(
						candidate.scratchpadData,
						seed.scratchpadData.pads[0]?.content || ''
					).pads[0]?.content || '',
					createdAt: now,
					updatedAt: now
				}
			];

	const sortedBoards = [...boards].sort(
		(left, right) => left.position - right.position || left.name.localeCompare(right.name)
	);
	const sortedPages = [...pages].sort(
		(left, right) => left.position - right.position || left.name.localeCompare(right.name)
	);
	const activeBoard = sortedBoards[0];
	const activePage = sortedPages[0];

	const normalizedProject: Project = {
		...seed,
		id: createId(),
		ownerUserId: userId,
		accessRole: 'owner',
		name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : seed.name,
		boards: sortedBoards,
		pages: sortedPages,
		activeBoardId: activeBoard?.id || '',
		activePageId: activePage?.id || '',
		kanbanData: activeBoard?.kanbanData || [],
		scratchpadData: normalizeScratchpadData(
			candidate.scratchpadData,
			activePage?.content || seed.scratchpadData.pads[0]?.content || ''
		),
		chatHistory: seed.chatHistory,
		members: [],
		invites: [],
		scratchpadRev: 0,
		createdAt: now,
		updatedAt: now,
		viewerLastOpenedAt: now
	};

	return normalizeProjectStructure(normalizedProject);
};

const normalizeLegacySession = (session: LegacySession, userId: string): Project => {
	const seed = EMPTY_PROJECT(userId, session.name);
	const { kanbanData } = importKanbanData(session.kanbanData, seed.kanbanData);
	const boardId = createId();
	const pageId = createId();

	return normalizeProjectStructure({
		...seed,
		id: createId(),
		name: session.name || seed.name,
		boards: [
			{
				id: boardId,
				projectId: seed.id,
				name: 'Board',
				position: 0,
				kanbanData,
				createdAt: seed.createdAt,
				updatedAt: seed.updatedAt
			}
		],
		pages: [
			{
				id: pageId,
				projectId: seed.id,
				name: 'Notes',
				position: 0,
				content: normalizeScratchpadData(session.scratchpadData).pads[0]?.content || '',
				createdAt: seed.createdAt,
				updatedAt: seed.updatedAt
			}
		],
		activeBoardId: boardId,
		activePageId: pageId,
		kanbanData,
		scratchpadData: normalizeScratchpadData(session.scratchpadData),
		chatHistory: normalizeChatHistory(session.chatHistory || []),
		createdAt: session.createdAt || seed.createdAt,
		updatedAt: session.lastModified || session.createdAt || seed.updatedAt,
		viewerLastOpenedAt: session.lastModified || seed.viewerLastOpenedAt
	});
};

export const exportProjectsToFile = (projects: Project[]) => {
	const payload: WorkspaceBackup = {
		version: BACKUP_VERSION,
		projects: projects.map((project) => ({
			name: project.name,
			boards: [...project.boards]
				.sort((left, right) => left.position - right.position || left.name.localeCompare(right.name))
				.map(stripBoardForBackup),
			pages: [...project.pages]
				.sort((left, right) => left.position - right.position || left.name.localeCompare(right.name))
				.map(stripPageForBackup)
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
		(parsed.version === BACKUP_VERSION || parsed.version === 2 || parsed.version === 1) &&
		Array.isArray(parsed.projects)
	) {
		return parsed.projects.map((project) => normalizeProject(project as Record<string, unknown>, userId));
	}

	if (Array.isArray(parsed)) {
		return parsed.map((item) => normalizeLegacySession(item as LegacySession, userId));
	}

	throw new Error('Unsupported backup format.');
};

/** Test helper: true when JSON has no persisted client ids (v3 backups). */
export const backupPayloadUsesContentOnlyKeys = (payload: WorkspaceBackup) => {
	const sample = JSON.stringify(payload);
	return !/"id"\s*:/.test(sample) && !/"projectId"\s*:/.test(sample) && !/"activeBoardId"\s*:/.test(sample);
};
