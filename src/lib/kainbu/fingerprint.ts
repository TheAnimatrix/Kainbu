import { DEFAULT_COLUMN_WIDTH } from '$lib/kainbu/constants';
import { normalizeScratchpadData } from '$lib/kainbu/scratchpad';
import type { KanbanData, ScratchpadData } from '$lib/kainbu/types';

export const canonicalizeKanbanData = (kanbanData: KanbanData) =>
	kanbanData.map((column) => ({
		id: column.id,
		title: column.title,
		color: column.color || null,
		width: column.width ?? DEFAULT_COLUMN_WIDTH,
		tasks: (column.tasks || []).map((task) => ({
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
			assignedTo: task.assignedTo || null
		}))
	}));

export const getKanbanFingerprint = (kanbanData: KanbanData) =>
	JSON.stringify(canonicalizeKanbanData(kanbanData));

export const canonicalizeScratchpadData = (scratchpadData: ScratchpadData) => {
	const normalized = normalizeScratchpadData(scratchpadData);

	return {
		activePadId: normalized.activePadId,
		pads: normalized.pads.map((pad) => ({
			id: pad.id,
			name: pad.name,
			content: pad.content
		}))
	};
};

export const getScratchpadFingerprint = (scratchpadData: ScratchpadData) =>
	JSON.stringify(canonicalizeScratchpadData(scratchpadData));
