import { describe, expect, it } from 'vitest';
import {
	buildProjectActivityStats,
	buildWorkspaceActivityEvents,
	buildWorkspaceActivitySummary,
	filterActivityEvents,
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
});
