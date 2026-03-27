import type { DashboardTimedTask, Project, Task } from '$lib/kainbu/types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const getTaskDueAt = (task: Task) => task.countdownAt ?? task.alarmAt ?? null;

export const isTaskTimed = (task: Task) => getTaskDueAt(task) !== null;

export const setTaskDueAt = (task: Task, dueAt?: number): Task => ({
	...task,
	countdownAt: dueAt,
	alarmAt: undefined
});

export const clearTaskDueAt = (task: Task): Task => ({
	...task,
	countdownAt: undefined,
	alarmAt: undefined
});

export const isTaskActiveForDashboard = (task: Task) =>
	!task.checked && !task.completedAt && isTaskTimed(task);

export const buildTimedTasks = (projects: Project[]): DashboardTimedTask[] =>
	projects
		.flatMap((project) =>
			project.kanbanData.flatMap((column) =>
				column.tasks.flatMap((task) => {
					if (!isTaskActiveForDashboard(task)) return [];
					const dueAt = getTaskDueAt(task);
					if (dueAt === null) return [];

					return [
						{
							projectId: project.id,
							projectName: project.name,
							accessRole: project.accessRole,
							columnId: column.id,
							columnTitle: column.title,
							task,
							dueAt
						}
					];
				})
			)
		)
		.sort((left, right) => left.dueAt - right.dueAt);

export const formatTimingRelative = (target: number, now = Date.now()) => {
	const delta = target - now;
	const absDelta = Math.abs(delta);

	if (absDelta < HOUR_MS) {
		const minutes = Math.max(1, Math.round(absDelta / (60 * 1000)));
		return delta >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
	}

	if (absDelta < DAY_MS) {
		const hours = Math.max(1, Math.round(absDelta / HOUR_MS));
		return delta >= 0 ? `in ${hours}h` : `${hours}h ago`;
	}

	const days = Math.max(1, Math.round(absDelta / DAY_MS));
	return delta >= 0 ? `in ${days}d` : `${days}d ago`;
};

export const formatDueDateValue = (target: number) =>
	new Date(target).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

export const formatTimingLabel = (task: Task) => {
	const dueAt = getTaskDueAt(task);
	if (dueAt === null) return '';

	return `Due ${formatTimingRelative(dueAt)}`;
};
