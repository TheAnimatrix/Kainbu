export type ViewportPoint = { x: number; y: number };

export type ViewportRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type LinkCurvePath = {
	d: string;
	kind: 'explicit' | 'reference';
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const format = (value: number) => Math.round(value * 10) / 10;

export const getRectCenter = (rect: ViewportRect): ViewportPoint => ({
	x: rect.left + rect.width / 2,
	y: rect.top + rect.height / 2
});

/** Point where the ray from rect center toward `target` exits the rectangle border. */
export const getRectEdgePointToward = (rect: ViewportRect, target: ViewportPoint): ViewportPoint => {
	const center = getRectCenter(rect);
	const dx = target.x - center.x;
	const dy = target.y - center.y;

	if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
		return center;
	}

	const halfWidth = rect.width / 2;
	const halfHeight = rect.height / 2;
	const scale = Math.min(Math.abs(halfWidth / dx), Math.abs(halfHeight / dy));

	return {
		x: center.x + dx * scale,
		y: center.y + dy * scale
	};
};

export const getHorizontalEdgePoint = (
	rect: ViewportRect,
	side: 'left' | 'right',
	y: number
): ViewportPoint => ({
	x: side === 'left' ? rect.left : rect.left + rect.width,
	y: clamp(y, rect.top + 6, rect.top + rect.height - 6)
});

const isSameColumn = (fromRect: ViewportRect, toRect: ViewportRect) => {
	const fromCenter = getRectCenter(fromRect);
	const toCenter = getRectCenter(toRect);
	const threshold = Math.min(fromRect.width, toRect.width) * 0.55;
	return Math.abs(fromCenter.x - toCenter.x) < threshold;
};

const getGutterX = (fromRect: ViewportRect, toRect: ViewportRect, fromOnLeft: boolean) => {
	if (fromOnLeft) {
		const gapStart = fromRect.left + fromRect.width;
		const gapEnd = toRect.left;
		if (gapEnd > gapStart + 8) {
			return gapStart + (gapEnd - gapStart) / 2;
		}
		return gapStart + 16;
	}

	const gapStart = toRect.left + toRect.width;
	const gapEnd = fromRect.left;
	if (gapEnd > gapStart + 8) {
		return gapStart + (gapEnd - gapStart) / 2;
	}
	return fromRect.left - 16;
};

/** Orthogonal route: card → column gutter → card (avoids crossing cards in between). */
export const buildRoutedLinkPath = (fromRect: ViewportRect, toRect: ViewportRect): string => {
	const fromCenter = getRectCenter(fromRect);
	const toCenter = getRectCenter(toRect);

	if (isSameColumn(fromRect, toRect)) {
		const fromPoint = getRectEdgePointToward(fromRect, toCenter);
		const toPoint = getRectEdgePointToward(toRect, fromCenter);
		return `M ${format(fromPoint.x)} ${format(fromPoint.y)} L ${format(toPoint.x)} ${format(toPoint.y)}`;
	}

	const fromOnLeft = fromCenter.x < toCenter.x;
	const fromY = clamp(toCenter.y, fromRect.top + 8, fromRect.top + fromRect.height - 8);
	const toY = clamp(fromCenter.y, toRect.top + 8, toRect.top + toRect.height - 8);

	const fromPoint = getHorizontalEdgePoint(fromRect, fromOnLeft ? 'right' : 'left', fromY);
	const toPoint = getHorizontalEdgePoint(toRect, fromOnLeft ? 'left' : 'right', toY);
	const gutterX = getGutterX(fromRect, toRect, fromOnLeft);

	return [
		`M ${format(fromPoint.x)} ${format(fromPoint.y)}`,
		`L ${format(gutterX)} ${format(fromPoint.y)}`,
		`L ${format(gutterX)} ${format(toPoint.y)}`,
		`L ${format(toPoint.x)} ${format(toPoint.y)}`
	].join(' ');
};
