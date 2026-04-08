import { DEFAULT_AI_MODEL_ID } from '$lib/kainbu/models';
import { DEFAULT_AI_SESSION_TITLE, DEFAULT_CHAT_HISTORY } from '$lib/kainbu/constants';
import { createId } from '$lib/kainbu/id';
import type { AiModelId, ChatMessage, Project, ProjectAiSession } from '$lib/kainbu/types';

const cloneHistory = (history?: ChatMessage[]) =>
	structuredClone(history?.length ? history : DEFAULT_CHAT_HISTORY);

const normalizeTimestamp = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeSessionTitle = (title: string | undefined, index: number) => {
	const trimmed = title?.trim();
	if (trimmed) return trimmed;
	return index === 0 ? DEFAULT_AI_SESSION_TITLE : `Chat ${index + 1}`;
};

const normalizeProjectAiSession = (
	session: Partial<ProjectAiSession>,
	projectId: string,
	index: number
): ProjectAiSession => {
	const now = Date.now();
	const createdAt = normalizeTimestamp(session.createdAt, now);
	const history = cloneHistory(Array.isArray(session.history) ? session.history : undefined);
	const lastMessageAt = normalizeTimestamp(session.lastMessageAt, history.at(-1)?.timestamp ?? createdAt);
	return {
		id: typeof session.id === 'string' && session.id.trim() ? session.id : createId(),
		projectId,
		title: normalizeSessionTitle(session.title, index),
		modelId:
			typeof session.modelId === 'string' && session.modelId.trim()
				? session.modelId.trim()
				: DEFAULT_AI_MODEL_ID,
		history,
		createdAt,
		updatedAt: normalizeTimestamp(session.updatedAt, lastMessageAt),
		lastMessageAt
	};
};

export const isDefaultAiSessionTitle = (title: string | null | undefined) =>
	!title?.trim() || title.trim() === DEFAULT_AI_SESSION_TITLE;

export const buildAiSessionTitle = (text: string) => {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return DEFAULT_AI_SESSION_TITLE;
	return normalized.length > 44 ? `${normalized.slice(0, 43).trimEnd()}…` : normalized;
};

export const createProjectAiSession = ({
	projectId,
	title = DEFAULT_AI_SESSION_TITLE,
	modelId = DEFAULT_AI_MODEL_ID,
	history
}: {
	projectId: string;
	title?: string;
	modelId?: AiModelId;
	history?: ChatMessage[];
}): ProjectAiSession => {
	const now = Date.now();
	const nextHistory = cloneHistory(history);
	const lastMessageAt = nextHistory.at(-1)?.timestamp ?? now;
	return {
		id: createId(),
		projectId,
		title,
		modelId,
		history: nextHistory,
		createdAt: now,
		updatedAt: now,
		lastMessageAt
	};
};

export const getProjectAiSession = (
	project: Pick<Project, 'aiSessions' | 'activeAiSessionId'>,
	sessionId?: string | null
) =>
	project.aiSessions.find((session) => session.id === (sessionId || project.activeAiSessionId)) ||
	project.aiSessions[0] ||
	null;

export const getActiveProjectAiSession = (project: Pick<Project, 'aiSessions' | 'activeAiSessionId'>) =>
	getProjectAiSession(project, project.activeAiSessionId);

export const normalizeProjectAiState = (
	project: Pick<Project, 'id' | 'chatHistory' | 'aiSessions' | 'activeAiSessionId'>
) => {
	const sessionsSource =
		Array.isArray(project.aiSessions) && project.aiSessions.length
			? project.aiSessions
			: [createProjectAiSession({ projectId: project.id, history: project.chatHistory })];
	const aiSessions = sessionsSource.map((session, index) =>
		normalizeProjectAiSession(session, project.id, index)
	);
	const activeSessionId =
		getProjectAiSession(
			{ aiSessions, activeAiSessionId: project.activeAiSessionId },
			project.activeAiSessionId
		)?.id || aiSessions[0].id;
	const chatHistory = cloneHistory(
		getProjectAiSession({ aiSessions, activeAiSessionId: activeSessionId }, activeSessionId)?.history
	);
	return {
		aiSessions,
		activeAiSessionId: activeSessionId,
		chatHistory
	};
};

export const replaceProjectAiSessions = (
	project: Project,
	aiSessions: ProjectAiSession[],
	activeAiSessionId: string
) => ({
	...project,
	...normalizeProjectAiState({
		id: project.id,
		chatHistory: project.chatHistory,
		aiSessions,
		activeAiSessionId
	})
});

export const setActiveProjectAiSession = (project: Project, sessionId: string) => {
	const nextActiveSession = getProjectAiSession(project, sessionId);
	if (!nextActiveSession) return project;
	return replaceProjectAiSessions(project, project.aiSessions, nextActiveSession.id);
};

export const updateActiveProjectAiSession = (
	project: Project,
	updater: (session: ProjectAiSession) => ProjectAiSession
) => {
	const activeSession = getActiveProjectAiSession(project) || createProjectAiSession({ projectId: project.id });
	const nextSessions = (project.aiSessions.length ? project.aiSessions : [activeSession]).map(
		(session, index) =>
			session.id === activeSession.id
				? normalizeProjectAiSession(updater(activeSession), project.id, index)
				: normalizeProjectAiSession(session, project.id, index)
	);
	return replaceProjectAiSessions(project, nextSessions, activeSession.id);
};

export const addProjectAiSession = (project: Project, modelId = DEFAULT_AI_MODEL_ID) => {
	const nextSession = createProjectAiSession({ projectId: project.id, modelId });
	return replaceProjectAiSessions(project, [...project.aiSessions, nextSession], nextSession.id);
};

export const renameProjectAiSession = (project: Project, sessionId: string, title: string) =>
	replaceProjectAiSessions(
		project,
		project.aiSessions.map((session, index) =>
			session.id === sessionId
				? normalizeProjectAiSession({ ...session, title, updatedAt: Date.now() }, project.id, index)
				: session
		),
		project.activeAiSessionId
	);

export const deleteProjectAiSession = (
	project: Project,
	sessionId: string,
	fallbackModelId = DEFAULT_AI_MODEL_ID
) => {
	const remaining = project.aiSessions.filter((session) => session.id !== sessionId);
	if (!remaining.length) {
		const replacement = createProjectAiSession({
			projectId: project.id,
			modelId: fallbackModelId
		});
		return replaceProjectAiSessions(project, [replacement], replacement.id);
	}

	const nextActiveAiSessionId =
		project.activeAiSessionId === sessionId ? remaining[0].id : project.activeAiSessionId;
	return replaceProjectAiSessions(project, remaining, nextActiveAiSessionId);
};

export const resolveAiModelId = (
	modelId: string | null | undefined,
	availableModelIds: string[],
	fallbackModelId = DEFAULT_AI_MODEL_ID
) => {
	if (!availableModelIds.length) {
		return modelId?.trim() || fallbackModelId;
	}

	const normalizedModelId = modelId?.trim() || '';
	return availableModelIds.includes(normalizedModelId)
		? normalizedModelId
		: availableModelIds[0] || fallbackModelId;
};

export const syncProjectAiModelIds = (
	project: Project,
	availableModelIds: string[],
	fallbackModelId = DEFAULT_AI_MODEL_ID
) =>
	replaceProjectAiSessions(
		project,
		project.aiSessions.map((session, index) =>
			normalizeProjectAiSession(
				{
					...session,
					modelId: resolveAiModelId(session.modelId, availableModelIds, fallbackModelId)
				},
				project.id,
				index
			)
		),
		project.activeAiSessionId
	);
