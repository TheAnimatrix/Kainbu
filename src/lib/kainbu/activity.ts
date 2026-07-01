import type { Project, ProjectInvite, ProjectMembership, Task } from '$lib/kainbu/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const todayStart = (now: number) => {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
};

export type WorkspaceActivityKind =
	| 'task_created'
	| 'task_completed'
	| 'task_updated'
	| 'member_joined'
	| 'invite_sent'
	| 'project_updated';

export type WorkspaceActivityGroup = 'task' | 'people' | 'project';

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

const eventWindowCount = (
	events: WorkspaceActivityEvent[],
	startInclusive: number,
	endExclusive: number
) =>
	events.filter((event) => event.timestamp >= startInclusive && event.timestamp < endExclusive)
		.length;

const pushTaskEvents = (
	events: WorkspaceActivityEvent[],
	project: Project,
	columnId: string,
	columnTitle: string,
	task: Task,
	seq: number
) => {
	if (task.deletedAt) return;

	if (isFiniteTimestamp(task.completedAt)) {
		events.push({
			id: `${project.id}:${task.id}:completed:${task.completedAt}:${seq}`,
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
		events.push({
			id: `${project.id}:${task.id}:created:${task.createdAt}:${seq}`,
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

const pushPeopleEvents = (events: WorkspaceActivityEvent[], project: Project) => {
	for (const member of project.members) {
		if (!isFiniteTimestamp(member.joinedAt)) continue;
		events.push({
			id: `${project.id}:${member.userId}:joined:${member.joinedAt}`,
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

	for (const invite of project.invites) {
		if (!isFiniteTimestamp(invite.createdAt)) continue;
		events.push({
			id: `${project.id}:${invite.id}:invite:${invite.createdAt}`,
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
};

export const buildProjectActivityEvents = (project: Project): WorkspaceActivityEvent[] => {
	const events: WorkspaceActivityEvent[] = [];

	let taskSeq = 0;
	for (const column of project.kanbanData) {
		for (const task of column.tasks) {
			pushTaskEvents(events, project, column.id, column.title, task, taskSeq++);
		}
	}

	pushPeopleEvents(events, project);

	if (isFiniteTimestamp(project.updatedAt)) {
		events.push({
			id: `${project.id}:project_updated:${project.updatedAt}`,
			kind: 'project_updated',
			group: 'project',
			projectId: project.id,
			projectName: project.name,
			title: 'Board updated',
			detail: project.name,
			timestamp: project.updatedAt
		});
	}

	return events.sort(eventTimestampDesc);
};

export const buildWorkspaceActivityEvents = (projects: Project[]) =>
	projects.flatMap(buildProjectActivityEvents).sort(eventTimestampDesc);

export const buildProjectActivityStats = (
	project: Project,
	now = Date.now(),
	events?: WorkspaceActivityEvent[]
): ProjectActivityStats => {
	const tasks = project.kanbanData.flatMap((column) => column.tasks).filter((task) => !task.deletedAt);
	const projectEvents = events ?? buildProjectActivityEvents(project);
	const last7dStart = now - WEEK_MS;
	const previous7dStart = now - 2 * WEEK_MS;
	const activityLast7d = eventWindowCount(projectEvents, last7dStart, now + 1);
	const activityPrevious7d = eventWindowCount(projectEvents, previous7dStart, last7dStart);
	const completedLast7d = tasks.filter(
		(task) => isFiniteTimestamp(task.completedAt) && task.completedAt >= last7dStart && task.completedAt <= now
	).length;
	const createdLast7d = tasks.filter(
		(task) => isFiniteTimestamp(task.createdAt) && task.createdAt >= last7dStart && task.createdAt <= now
	).length;
	const completedTaskCount = tasks.filter(taskIsComplete).length;

	return {
		projectId: project.id,
		projectName: project.name,
		taskCount: tasks.length,
		openTaskCount: tasks.length - completedTaskCount,
		completedTaskCount,
		completedLast7d,
		createdLast7d,
		activityLast7d,
		activityPrevious7d,
		activityDelta: activityLast7d - activityPrevious7d,
		memberCount: project.members.length
	};
};

export const buildWorkspaceActivitySummary = (
	projects: Project[],
	now = Date.now()
): WorkspaceActivitySummary => {
	const allEvents: WorkspaceActivityEvent[] = [];
	const projectStats = projects
		.map((project) => {
			const projectEvents = buildProjectActivityEvents(project);
			allEvents.push(...projectEvents);
			return buildProjectActivityStats(project, now, projectEvents);
		})
		.sort(
			(left, right) =>
				right.activityLast7d - left.activityLast7d ||
				right.completedLast7d - left.completedLast7d ||
				left.projectName.localeCompare(right.projectName, undefined, { sensitivity: 'base' })
		);
	allEvents.sort(eventTimestampDesc);
	const todayWindowStart = todayStart(now);
	const last7dStart = now - WEEK_MS;
	const previous7dStart = now - 2 * WEEK_MS;

	return {
		taskCount: projectStats.reduce((total, stat) => total + stat.taskCount, 0),
		openTaskCount: projectStats.reduce((total, stat) => total + stat.openTaskCount, 0),
		completedTaskCount: projectStats.reduce((total, stat) => total + stat.completedTaskCount, 0),
		completedLast7d: projectStats.reduce((total, stat) => total + stat.completedLast7d, 0),
		createdLast7d: projectStats.reduce((total, stat) => total + stat.createdLast7d, 0),
		activityToday: eventWindowCount(allEvents, todayWindowStart, now + 1),
		activityLast7d: eventWindowCount(allEvents, last7dStart, now + 1),
		activityPrevious7d: eventWindowCount(allEvents, previous7dStart, last7dStart),
		activityDelta:
			eventWindowCount(allEvents, last7dStart, now + 1) -
			eventWindowCount(allEvents, previous7dStart, last7dStart),
		memberCount: projects.reduce((total, project) => total + project.members.length, 0),
		projectStats,
		events: allEvents
	};
};

export const filterActivityEvents = (
	events: WorkspaceActivityEvent[],
	options: { projectId?: string; group?: WorkspaceActivityGroup | 'all'; limit?: number } = {}
) => {
	const group = options.group ?? 'all';
	const filtered = events.filter((event) => {
		if (options.projectId && event.projectId !== options.projectId) return false;
		if (group !== 'all' && event.group !== group) return false;
		return true;
	});

	return filtered.slice(0, Math.max(0, options.limit ?? filtered.length));
};

export const summarizeActivityDelta = (delta: number) => {
	if (delta > 0) return `+${delta} vs previous week`;
	if (delta < 0) return `${delta} vs previous week`;
	return 'even with previous week';
};
