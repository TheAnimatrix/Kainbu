import { describe, expect, it } from 'vitest';
import {
	buildProjectActivityStats,
	buildWorkspaceActivityEvents,
	buildWorkspaceActivitySummary,
	filterActivityEvents,
	getCalendarDayStart,
	getDailyActivity,
	paginateActivityEvents,
	summarizeActivityDelta
} from '../src/lib/kainbu/activity';
import type { Project } from '../src/lib/kainbu/types';

const now = Date.UTC(2026, 0, 15, 12, 0, 0);
const day = 24 * 60 * 60 * 1000;

const makeProject = (patch: Partial<Project> = {}): Project => ({
	id: 'project-a',
	ownerUserId: 'owner',
	accessRole: 'owner',
	name: 'Alpha',
	backgroundTheme: null,
	boards: [],
	pages: [],
	activeBoardId: 'board-a',
	activePageId: 'page-a',
	kanbanData: [
		{
			id: 'todo',
			title: 'To Do',
			tasks: [
				{
					id: 'created',
					title: 'Fresh task',
					tags: [],
					createdAt: now - day,
					updatedAt: now - day
				},
				{
					id: 'done',
					title: 'Completed task',
					tags: [],
					checked: true,
					createdAt: now - 12 * day,
					updatedAt: now - 2 * day,
					completedAt: now - 2 * day
				},
				{
					id: 'old',
					title: 'Old task',
					tags: [],
					createdAt: now - 12 * day,
					updatedAt: now - 10 * day
				}
			]
		}
	],
	scratchpadData: { activePadId: '', pads: [] },
	scratchpadRev: 0,
	aiSessions: [],
	activeAiSessionId: '',
	chatHistory: [],
	members: [
		{
			projectId: 'project-a',
			userId: 'owner',
			role: 'owner',
			email: 'owner@example.test',
			username: 'owner',
			joinedAt: now - 3 * day,
			lastOpenedAt: now,
			isCurrentUser: true
		}
	],
	invites: [
		{
			id: 'invite-a',
			projectId: 'project-a',
			inviteeUserId: '',
			inviteeEmail: 'new@example.test',
			invitedByUserId: 'owner',
			status: 'pending',
			createdAt: now - 4 * day,
			updatedAt: now - 4 * day
		}
	],
	createdAt: now - 30 * day,
	updatedAt: now - day,
	viewerLastOpenedAt: now,
	...patch
});

describe('activity summaries', () => {
	it('builds ordered activity events from tasks, members, invites, and project updates', () => {
		const events = buildWorkspaceActivityEvents([makeProject()]);

		expect(events[0].timestamp).toBeGreaterThanOrEqual(events[1].timestamp);
		expect(events.map((event) => event.kind)).toContain('task_created');
		expect(events.map((event) => event.kind)).toContain('task_completed');
		expect(events.map((event) => event.kind)).toContain('member_joined');
		expect(events.map((event) => event.kind)).toContain('invite_sent');
	});

	it('counts current and previous week activity separately', () => {
		const stats = buildProjectActivityStats(makeProject(), now);

		expect(stats.taskCount).toBe(3);
		expect(stats.completedTaskCount).toBe(1);
		expect(stats.openTaskCount).toBe(2);
		expect(stats.createdLast7d).toBe(1);
		expect(stats.completedLast7d).toBe(1);
		expect(stats.activityLast7d).toBeGreaterThan(stats.activityPrevious7d);
		expect(stats.activityDelta).toBe(stats.activityLast7d - stats.activityPrevious7d);
	});

	it('aggregates workspace totals and ranks projects by recent activity', () => {
		const active = makeProject();
		const quiet = makeProject({
			id: 'project-b',
			name: 'Beta',
			kanbanData: [{ id: 'todo-b', title: 'To Do', tasks: [] }],
			members: [],
			invites: [],
			updatedAt: now - 20 * day
		});

		const summary = buildWorkspaceActivitySummary([quiet, active], now);

		expect(summary.taskCount).toBe(3);
		expect(summary.completedLast7d).toBe(1);
		expect(summary.projectStats[0].projectId).toBe('project-a');
		expect(summary.activityDelta).toBe(summary.activityLast7d - summary.activityPrevious7d);
	});

	it('filters activity by project, group, and limit', () => {
		const events = buildWorkspaceActivityEvents([makeProject()]);

		const people = filterActivityEvents(events, { group: 'people', limit: 1 });
		const taskEvents = filterActivityEvents(events, { projectId: 'project-a', group: 'task' });

		expect(people).toHaveLength(1);
		expect(people[0].group).toBe('people');
		expect(taskEvents.every((event) => event.group === 'task')).toBe(true);
		expect(taskEvents.every((event) => event.projectId === 'project-a')).toBe(true);
	});

	it('formats activity deltas for dashboard labels', () => {
		expect(summarizeActivityDelta(3)).toBe('+3 vs previous week');
		expect(summarizeActivityDelta(-2)).toBe('-2 vs previous week');
		expect(summarizeActivityDelta(0)).toBe('even with previous week');
	});

	it('uses the local calendar day instead of a rolling 24-hour window', () => {
		const dayStart = getCalendarDayStart(now);
		const project = makeProject({
			kanbanData: [{ id: 'todo', title: 'To Do', tasks: [
				{ id: 'before-midnight', title: 'Before', tags: [], createdAt: dayStart - 1 },
				{ id: 'today', title: 'Today', tags: [], createdAt: dayStart }
			] }],
			members: [], invites: [], updatedAt: dayStart - 2 * day
		});
		const events = buildWorkspaceActivityEvents([project]);
		expect(getDailyActivity(events, now, 10).map((event) => event.taskId)).toEqual(['today']);
	});

	it('keeps deleted task and departed member history without counting them as current state', () => {
		const project = makeProject({
			kanbanData: [{ id: 'todo', title: 'To Do', tasks: [{
				id: 'deleted', title: 'Removed task', tags: [], createdAt: now - day, deletedAt: now - 1
			}] }],
			members: [{
			projectId: 'project-a', userId: 'former', role: 'member', email: 'former@example.test',
			joinedAt: now - 3 * day, leftAt: now - 1, lastOpenedAt: now - 2 * day
			}],
			invites: [], updatedAt: now - 2 * day
		});
		const summary = buildWorkspaceActivitySummary([project], now);
		expect(summary.events.map((event) => event.kind)).toContain('member_left');
		expect(summary.events.map((event) => event.taskId)).toContain('deleted');
		expect(summary.taskCount).toBe(0);
		expect(summary.memberCount).toBe(0);
	});

	it('deduplicates reconstructed records and clamps pagination after filtering', () => {
		const task = { id: 'same', title: 'Same', tags: [], createdAt: now - day };
		const project = makeProject({ kanbanData: [
			{ id: 'one', title: 'One', tasks: [task] },
			{ id: 'two', title: 'Two', tasks: [task] }
		], members: [], invites: [], updatedAt: now - 2 * day });
		const events = buildWorkspaceActivityEvents([project]);
		expect(events.filter((event) => event.taskId === 'same')).toHaveLength(1);
		expect(paginateActivityEvents(events, 99, 2).currentPage).toBe(1);
		expect(paginateActivityEvents([], 99, 2).items).toEqual([]);
	});

	it('does not manufacture activity from mutable project or task update timestamps', () => {
		const project = makeProject({
			kanbanData: [{ id: 'todo', title: 'To Do', tasks: [{ id: 'quiet', title: 'Quiet', tags: [], updatedAt: now }] }],
			members: [], invites: [], updatedAt: now
		});
		expect(buildWorkspaceActivityEvents([project])).toEqual([]);
	});
});
