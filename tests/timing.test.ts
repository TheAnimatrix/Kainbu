import { describe, expect, it } from 'vitest';
import {
	formatTimingLabel,
	getTaskDueAt,
	normalizeDueTimestamp
} from '../src/lib/kainbu/timing';
import type { Task } from '../src/lib/kainbu/types';

describe('normalizeDueTimestamp', () => {
	it('drops zero and invalid values', () => {
		expect(normalizeDueTimestamp(0)).toBeUndefined();
		expect(normalizeDueTimestamp(-1)).toBeUndefined();
		expect(normalizeDueTimestamp(null)).toBeUndefined();
		expect(normalizeDueTimestamp('')).toBeUndefined();
	});

	it('keeps positive millisecond timestamps', () => {
		const due = Date.parse('2026-06-01T12:00:00Z');
		expect(normalizeDueTimestamp(due)).toBe(due);
	});
});

describe('getTaskDueAt', () => {
	const baseTask: Task = {
		id: 't1',
		title: 'Test',
		tags: []
	};

	it('ignores PocketBase default zero countdown', () => {
		expect(getTaskDueAt({ ...baseTask, countdownAt: 0 })).toBeNull();
		expect(getTaskDueAt({ ...baseTask, alarmAt: 0 })).toBeNull();
	});

	it('prefers countdown over alarm when both are set', () => {
		const countdown = Date.parse('2026-07-01T00:00:00Z');
		const alarm = Date.parse('2026-08-01T00:00:00Z');
		expect(getTaskDueAt({ ...baseTask, countdownAt: countdown, alarmAt: alarm })).toBe(countdown);
	});

	it('formats no due label for zero timestamps', () => {
		expect(formatTimingLabel({ ...baseTask, countdownAt: 0 })).toBe('');
	});
});
