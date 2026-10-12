import { createId, fetchWorkspaceMe } from '@kainbu/core';
import { TAG_COLORS } from '$lib/kainbu/constants';
import { getTaskDueAt } from '$lib/kainbu/timing';
import type { Project, Tag, Task } from '../../../../src/lib/kainbu/types.js';
import { KainbuError } from '../errors.js';
import { revisionOf } from '../revision.js';
import { splitCsv } from './shared.js';

const invalid = (message: string, hint?: string) =>
	new KainbuError(message, { code: 'invalid_arguments', exitCode: 2, hint });

/** The web app stores task, tag and column colors as `tone:<name>`. */
export const TONES = TAG_COLORS.map((color) => color.value.replace('tone:', ''));

/** `red`/`tone:red` → `tone:red`; `none` or empty → undefined (default color). */
export const parseTone = (value: string, label = 'color'): string | undefined => {
	const raw = value.trim().toLowerCase();
	if (!raw || raw === 'none' || raw === 'default') return undefined;
	const name = raw.startsWith('tone:') ? raw.slice(5) : raw;
	if (!TONES.includes(name))
		throw invalid(`Unknown ${label} "${value}".`, `Use one of: ${TONES.join(', ')}, or none.`);
	return `tone:${name}`;
};

const DAY_MS = 86_400_000;
const atFivePm = (date: Date) => {
	date.setHours(17, 0, 0, 0);
	return date.getTime();
};

/**
 * Due dates, matching the board's quick entry: `none` clears; `today`,
 * `tomorrow` and `YYYY-MM-DD` mean 17:00 local time; `3d`, `12h`, `2w`, `1m`
 * are relative to now; a full ISO timestamp is used as-is.
 */
export const parseDue = (value: string, now = Date.now()): number | null => {
	const raw = value.trim().toLowerCase();
	if (raw === 'none' || raw === 'clear') return null;
	if (raw === 'today') return atFivePm(new Date(now));
	if (raw === 'tomorrow') return atFivePm(new Date(now + DAY_MS));
	const relative = raw.match(/^(\d+)([hdwm])$/);
	if (relative) {
		const unit = { h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS, m: 30 * DAY_MS }[
			relative[2] as 'h' | 'd' | 'w' | 'm'
		];
		return now + Number(relative[1]) * unit;
	}
	const day = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (day) {
		const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
		if (date.getMonth() === Number(day[2]) - 1) return atFivePm(date);
	} else if (/^\d{4}-\d{2}-\d{2}t/.test(raw)) {
		const parsed = Date.parse(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	throw invalid(
		`Invalid due date "${value}".`,
		'Use YYYY-MM-DD, an ISO timestamp, today, tomorrow, 3d/12h/2w/1m, or none.'
	);
};

export type DueFilter = 'overdue' | 'today' | 'week' | 'none' | 'any';
export const DUE_FILTERS: DueFilter[] = ['overdue', 'today', 'week', 'none', 'any'];

export const parseDueFilter = (value?: string): DueFilter | undefined => {
	if (value === undefined) return undefined;
	const raw = value.trim().toLowerCase() as DueFilter;
	if (!DUE_FILTERS.includes(raw))
		throw invalid(`Unknown due filter "${value}".`, `Use one of: ${DUE_FILTERS.join(', ')}.`);
	return raw;
};

const endOfDay = (now: number, days = 0) => {
	const date = new Date(now + days * DAY_MS);
	date.setHours(23, 59, 59, 999);
	return date.getTime();
};

export const matchesDue = (task: Task, filter: DueFilter, now = Date.now()) => {
	const due = getTaskDueAt(task);
	if (filter === 'none') return due === null;
	if (due === null) return false;
	if (filter === 'any') return true;
	if (filter === 'overdue') return due < now && !task.checked;
	if (filter === 'today') return due <= endOfDay(now);
	return due <= endOfDay(now, 6);
};

export type Member = { userId: string; username: string | null; email: string | null };

export const projectMembers = (project: Project): Member[] =>
	(project.members || [])
		.filter((member) => !member.leftAt)
		.map((member) => ({
			userId: member.userId,
			username: member.username ?? null,
			email: member.email ?? null
		}));

export const memberLabel = (project: Project, userId?: string) => {
	if (!userId) return undefined;
	const member = projectMembers(project).find((entry) => entry.userId === userId);
	return member?.username ? `@${member.username}` : member?.email || userId;
};

let currentUserId: Promise<string> | undefined;
export const getCurrentUserId = () =>
	(currentUserId ??= fetchWorkspaceMe().then((me) => {
		if (!me?.id)
			throw new KainbuError('Server returned no user identity.', { code: 'invalid_response' });
		return me.id;
	}));

/** `me`, a user ID, `@username`/`username`, or an email of a current project member. */
export const resolveMember = async (scope: Project | Project[], value: string): Promise<Member> => {
	const raw = value.trim().replace(/^@/, '');
	const members = (Array.isArray(scope) ? scope : [scope]).flatMap(projectMembers);
	const userId = raw.toLowerCase() === 'me' ? await getCurrentUserId() : undefined;
	const lower = raw.toLowerCase();
	const found = members.find(
		(member) =>
			member.userId === (userId ?? raw) ||
			member.username?.toLowerCase() === lower ||
			member.email?.toLowerCase() === lower
	);
	if (!found)
		throw new KainbuError(`No project member matches "${value}".`, {
			code: 'not_found',
			exitCode: 4,
			hint: 'Run: kainbu project members'
		});
	return found;
};

/** Reuse the color of an existing tag with the same label on the board. */
export const buildTags = (
	labels: string[],
	existing: Tag[],
	boardTags: Tag[],
	color: string | undefined
): Tag[] => {
	const result = [...existing];
	for (const label of labels) {
		if (result.some((tag) => tag.label.toLowerCase() === label.toLowerCase())) continue;
		const known = boardTags.find((tag) => tag.label.toLowerCase() === label.toLowerCase());
		result.push({
			id: createId(),
			label,
			color: color ?? known?.color ?? TAG_COLORS[0].value
		});
	}
	return result;
};

export const removeTags = (tags: Tag[], labels: string[]) =>
	tags.filter((tag) => !labels.some((label) => label.toLowerCase() === tag.label.toLowerCase()));

export const parseTagList = (value?: string) => {
	const labels = splitCsv(value);
	for (const label of labels)
		if (label.length > 200) throw invalid('Tag labels are limited to 200 characters.');
	return labels;
};

/**
 * Revision of what a person can change on a task. Server-managed timestamps
 * are excluded: reordering a column re-saves every sibling and bumps their
 * `updatedAt` without changing anything the revision protects.
 */
export const taskRevision = (task: Task, columnId: string) =>
	revisionOf({ task: { ...task, updatedAt: undefined }, columnId });

export const assertTaskRevision = (expected: string | undefined, task: Task, columnId: string) => {
	if (expected !== undefined && expected !== taskRevision(task, columnId))
		throw new KainbuError('Task changed since the supplied revision.', {
			code: 'conflict',
			exitCode: 5,
			hint: 'Read the task again, review the changes, and use its latest revision.'
		});
};

export const formatDue = (due: number, now = Date.now()) => {
	const date = new Date(due);
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
	return due < now ? `${stamp} (overdue)` : stamp;
};

/** Where a task lands in its column: `top`, `bottom`, or a 1-based position. */
export type Placement = 'top' | 'bottom' | number;

export const parsePlacement = (value: string): Placement => {
	const raw = value.trim().toLowerCase();
	if (raw === 'top' || raw === 'bottom') return raw;
	if (/^\d+$/.test(raw) && Number(raw) >= 1) return Number(raw);
	throw invalid(`Invalid position "${value}".`, 'Use top, bottom, or a 1-based number.');
};

export const insertAt = <T>(items: T[], item: T, placement: Placement): T[] => {
	const index =
		placement === 'top'
			? 0
			: placement === 'bottom'
				? items.length
				: Math.min(placement - 1, items.length);
	return [...items.slice(0, index), item, ...items.slice(index)];
};
