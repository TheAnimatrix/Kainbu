import type { KanbanData } from './types';

const DEFAULT_COLUMN_WIDTH = 268;

/**
 * Canonical board state shared by the browser and AI server.
 *
 * Deleted tasks are local sync tombstones and are intentionally excluded: the
 * AI workspace is materialized from live PocketBase tasks only. Keeping this
 * contract in one module prevents freshly generated proposals from comparing
 * two different representations of the same board.
 */
export const canonicalizeKanbanData = (kanbanData: KanbanData) =>
	kanbanData.map((column) => ({
		id: column.id,
		title: column.title,
		color: column.color || null,
		width: column.width ?? DEFAULT_COLUMN_WIDTH,
		tasks: (column.tasks || [])
			.filter((task) => !task.deletedAt)
			.map((task) => ({
				id: task.id,
				title: task.title,
				description: task.description || '',
				color: task.color || null,
				tags: (task.tags || []).map((tag) => ({
					id: tag.id,
					label: tag.label,
					color: tag.color || null
				})),
				hasCheckbox: Boolean(task.hasCheckbox),
				checked: Boolean(task.checked),
				completedAt: task.completedAt ?? null,
				countdownAt: task.countdownAt ?? null,
				alarmAt: task.alarmAt ?? null,
				assignedTo: task.assignedTo || null,
				linkedTaskIds: [...new Set(task.linkedTaskIds || [])].sort()
			}))
	}));

export const getKanbanFingerprint = (kanbanData: KanbanData) =>
	JSON.stringify(canonicalizeKanbanData(kanbanData));
