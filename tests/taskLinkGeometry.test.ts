import { describe, expect, it } from 'vitest';
import {
	buildRoutedLinkPath,
	getHorizontalEdgePoint,
	getRectEdgePointToward
} from '../src/lib/kainbu/taskLinkGeometry';

describe('taskLinkGeometry', () => {
	it('anchors on the nearest card edge toward the other task', () => {
		const fromRect = { left: 0, top: 0, width: 100, height: 60 };
		const point = getRectEdgePointToward(fromRect, { x: 220, y: 30 });
		expect(point.x).toBeCloseTo(100, 0);
		expect(point.y).toBeCloseTo(30, 0);
	});

	it('routes cross-column links through the gutter between columns', () => {
		const fromRect = { left: 0, top: 40, width: 200, height: 80 };
		const toRect = { left: 260, top: 200, width: 200, height: 80 };

		const path = buildRoutedLinkPath(fromRect, toRect);
		const gutterX = 230;

		expect(path).toBe('M 200 112 L 230 112 L 230 208 L 260 208');
		expect(path).toContain(`L ${gutterX} `);
	});

	it('uses a direct segment for tasks in the same column', () => {
		const fromRect = { left: 40, top: 0, width: 180, height: 70 };
		const toRect = { left: 50, top: 120, width: 180, height: 70 };
		const path = buildRoutedLinkPath(fromRect, toRect);
		expect(path).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
	});

	it('places horizontal edge points on the requested side', () => {
		const rect = { left: 100, top: 20, width: 80, height: 50 };
		const right = getHorizontalEdgePoint(rect, 'right', 45);
		expect(right.x).toBe(180);
		expect(right.y).toBe(45);
	});
});
