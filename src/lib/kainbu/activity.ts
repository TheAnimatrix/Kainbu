import type { Project, ProjectInvite, ProjectMembership, Task } from '$lib/kainbu/types';

export const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Activity contract
 * - Events are human-visible actions with a source timestamp, not snapshots/sync writes.
 * - Daily activity means the current local calendar day (midnight through now), never a rolling 24h window.
 * - Workspace activity is one global, newest-first history with explicit time/project/group filters.
 * - Reconstructed history is limited to timestamps that can be attributed to a task, membership, or invite.
 *   Project.updatedAt is deliberately not an event: PocketBase sync can change it without a human action.
 */

export type WorkspaceActivityKind =
	| 'task_created'
	| 'task_completed'
	| 'member_joined'
	| 'member_left'
	| 'invite_sent'
	| 'invite_accepted'
	| 'invite_rejected';

export type WorkspaceActivityGroup = 'task' | 'people';

export interface WorkspaceActivityEvent {
	id: string;
	kind: WorkspaceActivityKind;
	group: WorkspaceActivityGroup;
	projectId: string;
	projectName: string;
	title: string;
	detail: string;
	timestamp: number;
	taskId?: string;
	columnId?: string;
	memberUserId?: string;
	inviteId?: string;
}

export interface ProjectActivityStats {
	projectId: string;
	projectName: string;
	taskCount: number;
	openTaskCount: number;
	completedTaskCount: number;
	completedLast7d: number;
	createdLast7d: number;
	activityLast7d: number;
	activityPrevious7d: number;
	activityDelta: number;
	memberCount: number;
}

export interface WorkspaceActivitySummary {
	taskCount: number;
	openTaskCount: number;
	completedTaskCount: number;
	completedLast7d: number;
	createdLast7d: number;
	activityToday: number;
	activityLast7d: number;
	activityPrevious7d: number;
	activityDelta: number;
	memberCount: number;
	projectStats: ProjectActivityStats[];
	events: WorkspaceActivityEvent[];
}

const isFiniteTimestamp = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0;

const memberName = (member: ProjectMembership) =>
	member.username?.trim() || member.email?.trim() || 'A teammate';

const taskIsComplete = (task: Task) => Boolean(task.checked || task.completedAt);

const eventTimestampDesc = (left: WorkspaceActivityEvent, right: WorkspaceActivityEvent) =>
	right.timestamp - left.timestamp || left.id.localeCompare(right.id);

const eventWindowCount = (events: WorkspaceActivityEvent[], startInclusive: number, endExclusive: number) =>
	events.filter((event) => event.timestamp >= startInclusive && event.timestamp < endExclusive).length;

const addEvent = (
	events: WorkspaceActivityEvent[],
	seen: Set<string>,
	event: WorkspaceActivityEvent
) => {
	if (!seen.has(event.id)) {
		seen.add(event.id);
		events.push(event);
	}
};

const pushTaskEvents = (
	events: WorkspaceActivityEvent[],
	seen: Set<string>,
	project: Project,
	columnId: string,
	columnTitle: string,
	task: Task
) => {
	if (isFiniteTimestamp(task.completedAt)) {
		addEvent(events, seen, {
			id: `${project.id}:task:${task.id}:completed:${task.completedAt}`,
			kind: 'task_completed',
			group: 'task',
			projectId: project.id,
			projectName: project.name,
			title: 'Task completed',
			detail: `${task.title} in ${columnTitle}`,
			timestamp: task.completedAt,
			taskId: task.id,
			columnId
		});
	}
	if (isFiniteTimestamp(task.createdAt)) {
		addEvent(events, seen, {
			id: `${project.id}:task:${task.id}:created:${task.createdAt}`,
			kind: 'task_created',
			group: 'task',
			projectId: project.id,
			projectName: project.name,
			title: 'Task created',
			detail: `${task.title} in ${columnTitle}`,
			timestamp: task.createdAt,
			taskId: task.id,
			columnId
		});
	}
};

const pushPeopleEvents = (events: WorkspaceActivityEvent[], seen: Set<string>, project: Project) => {
	for (const member of project.members) {
		if (isFiniteTimestamp(member.joinedAt)) {
			addEvent(events, seen, {
				id: `${project.id}:member:${member.userId}:joined:${member.joinedAt}`,
				kind: 'member_joined',
				group: 'people',
				projectId: project.id,
				projectName: project.name,
				title: 'Member joined',
				detail: memberName(member),
				timestamp: member.joinedAt,
				memberUserId: member.userId
			});
		}
		if (isFiniteTimestamp(member.leftAt)) {
			addEvent(events, seen, {
				id: `${project.id}:member:${member.userId}:left:${member.leftAt}`,
				kind: 'member_left',
				group: 'people',
				projectId: project.id,
				projectName: project.name,
				title: 'Member left',
				detail: memberName(member),
				timestamp: member.leftAt,
				memberUserId: member.userId
			});
		}
	}

	for (const invite of project.invites) {
		if (isFiniteTimestamp(invite.createdAt)) {
			addEvent(events, seen, {
				id: `${project.id}:invite:${invite.id}:sent:${invite.createdAt}`,
				kind: 'invite_sent',
				group: 'people',
				projectId: project.id,
				projectName: project.name,
				title: 'Invite sent',
				detail: invite.inviteeEmail,
				timestamp: invite.createdAt,
				inviteId: invite.id
			});
		}
		const responseKind = invite.status === 'accepted' ? 'invite_accepted' : invite.status === 'rejected' ? 'invite_rejected' : null;
		if (responseKind && isFiniteTimestamp(invite.respondedAt)) {
			addEvent(events, seen, {
				id: `${project.id}:invite:${invite.id}:${responseKind}:${invite.respondedAt}`,
				kind: responseKind,
				group: 'people',
				projectId: project.id,
				projectName: project.name,
				title: responseKind === 'invite_accepted' ? 'Invite accepted' : 'Invite declined',
				detail: invite.inviteeEmail,
				timestamp: invite.respondedAt,
				inviteId: invite.id
			});
		}
	}
};

export const buildProjectActivityEvents = (project: Project): WorkspaceActivityEvent[] => {
	const events: WorkspaceActivityEvent[] = [];
	const seen = new Set<string>();
	for (const column of project.kanbanData) {
		for (const task of column.tasks) pushTaskEvents(events, seen, project, column.id, column.title, task);
	}
	pushPeopleEvents(events, seen, project);
	return events.sort(eventTimestampDesc);
};

export const buildWorkspaceActivityEvents = (projects: Project[]) =>
	projects.flatMap(buildProjectActivityEvents).sort(eventTimestampDesc);

export const getCalendarDayStart = (now: number) => {
	const date = new Date(now);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
};

export const getActivityWindowStart = (window: '7d' | '30d' | 'all', now: number) =>
	window === 'all' ? -Infinity : now - (window === '30d' ? 30 : 7) * DAY_MS;

export const filterActivityEvents = (
	events: WorkspaceActivityEvent[],
	options: {
		projectId?: string;
		group?: WorkspaceActivityGroup | 'all';
		startInclusive?: number;
		endExclusive?: number;
		limit?: number;
	} = {}
) => {
	const group = options.group ?? 'all';
	const filtered = events.filter((event) =>
		(!options.projectId || event.projectId === options.projectId) &&
		(group === 'all' || event.group === group) &&
		(options.startInclusive === undefined || event.timestamp >= options.startInclusive) &&
		(options.endExclusive === undefined || event.timestamp < options.endExclusive)
	);
	return filtered.slice(0, Math.max(0, options.limit ?? filtered.length));
};

export const paginateActivityEvents = <T>(items: T[], page: number, pageSize: number) => {
	const safePageSize = Math.max(1, pageSize);
	const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
	const currentPage = Math.min(Math.max(1, page), totalPages);
	return {
		items: items.slice((currentPage - 1) * safePageSize, currentPage * safePageSize),
		totalCount: items.length,
		totalPages,
		currentPage
	};
};

export const getDailyActivity = (events: WorkspaceActivityEvent[], now: number, limit = 6) =>
	filterActivityEvents(events, { startInclusive: getCalendarDayStart(now), endExclusive: now + 1, limit });

export const buildProjectActivityStats = (
	project: Project,
	now = Date.now(),
	events?: WorkspaceActivityEvent[]
): ProjectActivityStats => {
	const tasks = project.kanbanData.flatMap((column) => column.tasks).filter((task) => !task.deletedAt);
	const projectEvents = events ?? buildProjectActivityEvents(project);
	const last7dStart = now - WEEK_MS;
	const previous7dStart = now - 2 * WEEK_MS;
	const completedLast7d = tasks.filter((task) => isFiniteTimestamp(task.completedAt) && task.completedAt >= last7dStart && task.completedAt <= now).length;
	const createdLast7d = tasks.filter((task) => isFiniteTimestamp(task.createdAt) && task.createdAt >= last7dStart && task.createdAt <= now).length;
	const completedTaskCount = tasks.filter(taskIsComplete).length;
	return {
		projectId: project.id,
		projectName: project.name,
		taskCount: tasks.length,
		openTaskCount: tasks.length - completedTaskCount,
		completedTaskCount,
		completedLast7d,
		createdLast7d,
		activityLast7d: eventWindowCount(projectEvents, last7dStart, now + 1),
		activityPrevious7d: eventWindowCount(projectEvents, previous7dStart, last7dStart),
		activityDelta: eventWindowCount(projectEvents, last7dStart, now + 1) - eventWindowCount(projectEvents, previous7dStart, last7dStart),
		memberCount: project.members.filter((member) => !member.leftAt).length
	};
};

export const buildWorkspaceActivitySummary = (projects: Project[], now = Date.now()): WorkspaceActivitySummary => {
	const allEvents = buildWorkspaceActivityEvents(projects);
	const projectStats = projects
		.map((project) => buildProjectActivityStats(project, now, allEvents.filter((event) => event.projectId === project.id)))
		.sort((left, right) => right.activityLast7d - left.activityLast7d || left.projectName.localeCompare(right.projectName, undefined, { sensitivity: 'base' }));
	const last7dStart = now - WEEK_MS;
	const previous7dStart = now - 2 * WEEK_MS;
	return {
		taskCount: projectStats.reduce((total, stat) => total + stat.taskCount, 0),
		openTaskCount: projectStats.reduce((total, stat) => total + stat.openTaskCount, 0),
		completedTaskCount: projectStats.reduce((total, stat) => total + stat.completedTaskCount, 0),
		completedLast7d: projectStats.reduce((total, stat) => total + stat.completedLast7d, 0),
		createdLast7d: projectStats.reduce((total, stat) => total + stat.createdLast7d, 0),
		activityToday: getDailyActivity(allEvents, now, Number.MAX_SAFE_INTEGER).length,
		activityLast7d: eventWindowCount(allEvents, last7dStart, now + 1),
		activityPrevious7d: eventWindowCount(allEvents, previous7dStart, last7dStart),
		activityDelta: eventWindowCount(allEvents, last7dStart, now + 1) - eventWindowCount(allEvents, previous7dStart, last7dStart),
		memberCount: projects.reduce((total, project) => total + project.members.filter((member) => !member.leftAt).length, 0),
		projectStats,
		events: allEvents
	};
};

export const summarizeActivityDelta = (delta: number) => {
	if (delta > 0) return `+${delta} vs previous week`;
	if (delta < 0) return `${delta} vs previous week`;
	return 'even with previous week';
};
