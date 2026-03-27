import { normalizeNullableBackgroundTheme } from '$lib/kainbu/backgrounds';
import { normalizeScratchpadData } from '$lib/kainbu/scratchpad';
import { normalizeUserSettings } from '$lib/kainbu/settings';
import type { LocalWorkspaceSnapshot } from '$lib/kainbu/types';

const SNAPSHOT_VERSION = 2;
const SNAPSHOT_KEY_PREFIX = 'kainbu:workspace:';

const isBrowser = typeof window !== 'undefined';

const getSnapshotKey = (userId: string) => `${SNAPSHOT_KEY_PREFIX}${userId}`;

const isSnapshot = (value: unknown): value is LocalWorkspaceSnapshot => {
	if (!value || typeof value !== 'object') return false;

	const candidate = value as Partial<LocalWorkspaceSnapshot>;
	return (
		candidate.version === SNAPSHOT_VERSION &&
		typeof candidate.userId === 'string' &&
		typeof candidate.currentProjectId === 'string' &&
		Array.isArray(candidate.projects) &&
		Boolean(candidate.settings) &&
		typeof candidate.dirtySettings === 'boolean' &&
		typeof candidate.projectRevisions === 'object' &&
		candidate.projectRevisions !== null &&
		typeof candidate.lastProjectSyncAt === 'object' &&
		candidate.lastProjectSyncAt !== null
	);
};

const normalizeSnapshot = (snapshot: LocalWorkspaceSnapshot): LocalWorkspaceSnapshot => ({
	...snapshot,
	settings: normalizeUserSettings(snapshot.settings),
	projects: snapshot.projects.map((project) => ({
		...project,
		backgroundTheme: normalizeNullableBackgroundTheme(project.backgroundTheme),
		scratchpadData: normalizeScratchpadData(project.scratchpadData)
	}))
});

export const loadWorkspaceSnapshot = (userId: string): LocalWorkspaceSnapshot | null => {
	if (!isBrowser) return null;

	try {
		const raw = window.localStorage.getItem(getSnapshotKey(userId));
		if (!raw) return null;

		const parsed = JSON.parse(raw) as unknown;
		return isSnapshot(parsed) ? normalizeSnapshot(parsed) : null;
	} catch {
		window.localStorage.removeItem(getSnapshotKey(userId));
		return null;
	}
};

export const saveWorkspaceSnapshot = (snapshot: LocalWorkspaceSnapshot) => {
	if (!isBrowser) return;

	try {
		window.localStorage.setItem(getSnapshotKey(snapshot.userId), JSON.stringify(snapshot));
	} catch (error) {
		console.error(error);
	}
};

export const clearWorkspaceSnapshot = (userId: string) => {
	if (!isBrowser) return;

	try {
		window.localStorage.removeItem(getSnapshotKey(userId));
	} catch (error) {
		console.error(error);
	}
};
