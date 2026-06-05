import { DEFAULT_BOARD_PREFERENCES } from '$lib/kainbu/constants';
import type { BoardPreferences, KanbanData } from '$lib/kainbu/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const normalizeBoardPreferences = (
	value: unknown,
	fallbackDefaultShowCheckbox = DEFAULT_BOARD_PREFERENCES.defaultShowCheckbox
): BoardPreferences => {
	if (!isObject(value)) {
		return {
			...DEFAULT_BOARD_PREFERENCES,
			defaultShowCheckbox: fallbackDefaultShowCheckbox
		};
	}

	return {
		defaultShowCheckbox:
			typeof value.defaultShowCheckbox === 'boolean'
				? value.defaultShowCheckbox
				: fallbackDefaultShowCheckbox,
		moveCheckedTasks:
			typeof value.moveCheckedTasks === 'boolean'
				? value.moveCheckedTasks
				: DEFAULT_BOARD_PREFERENCES.moveCheckedTasks,
		checkedTaskTargetColumnId:
			typeof value.checkedTaskTargetColumnId === 'string'
				? value.checkedTaskTargetColumnId
				: DEFAULT_BOARD_PREFERENCES.checkedTaskTargetColumnId
	};
};

export const findDefaultDoneColumnId = (kanbanData: KanbanData): string | null => {
	const doneColumn = kanbanData.find((column) => column.title.trim().toLowerCase() === 'done');
	return doneColumn?.id ?? null;
};

export const resolveCheckedMoveTargetColumnId = (
	kanbanData: KanbanData,
	preferences: BoardPreferences
): string | null => {
	if (!preferences.moveCheckedTasks) return null;

	const explicitId = preferences.checkedTaskTargetColumnId.trim();
	if (explicitId) {
		return kanbanData.some((column) => column.id === explicitId) ? explicitId : null;
	}

	return findDefaultDoneColumnId(kanbanData);
};

export const getCheckedMoveTargetLabel = (
	kanbanData: KanbanData,
	preferences: BoardPreferences
): string => {
	if (!preferences.moveCheckedTasks) return 'Off';

	const explicitId = preferences.checkedTaskTargetColumnId.trim();
	if (explicitId) {
		const column = kanbanData.find((entry) => entry.id === explicitId);
		return column?.title.trim() || 'Missing column';
	}

	return findDefaultDoneColumnId(kanbanData) ? 'Done' : 'Done (no column)';
};
