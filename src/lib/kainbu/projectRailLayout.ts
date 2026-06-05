export const PROJECT_RAIL_COMPACT_STORAGE_KEY = 'kainbu-project-rail-compact';

export const DEFAULT_PROJECT_RAIL_COMPACT = true;

export const readStoredProjectRailCompact = (): boolean => {
	if (typeof localStorage === 'undefined') return DEFAULT_PROJECT_RAIL_COMPACT;

	try {
		const stored = localStorage.getItem(PROJECT_RAIL_COMPACT_STORAGE_KEY);
		if (stored === 'false') return false;
		if (stored === 'true') return true;
		return DEFAULT_PROJECT_RAIL_COMPACT;
	} catch {
		return DEFAULT_PROJECT_RAIL_COMPACT;
	}
};

export const persistProjectRailCompact = (compact: boolean) => {
	if (typeof localStorage === 'undefined') return;

	try {
		localStorage.setItem(PROJECT_RAIL_COMPACT_STORAGE_KEY, compact ? 'true' : 'false');
	} catch {
		// ignore quota / private mode
	}
};
