import type { Project } from './types';

export interface PendingBoardSync {
	projectId: string;
	boardId: string;
	previousKanbanData: Project['kanbanData'];
	nextKanbanData: Project['kanbanData'];
}
export interface PendingPageSync {
	projectId: string;
	pageId: string;
	previousContent: string;
	content: string;
}

/** Serializable entries, one writer per key, and no acknowledgement of newer edits. */
export class SyncQueue<T> extends Map<string, T> {
	private running = new Map<string, Promise<void>>();
	readonly errors = new Map<string, unknown>();
	constructor(private rebase: (current: T, sent: T) => T) {
		super();
	}
	delete(key: string) {
		this.errors.delete(key);
		return super.delete(key);
	}
	clear() {
		this.errors.clear();
		super.clear();
	}
	canRetryAutomatically(key: string) {
		const error = this.errors.get(key) as { status?: number } | undefined;
		return !error?.status || error.status >= 500;
	}

	flush(key: string, write: (pending: T) => Promise<void>): Promise<void> {
		const running = this.running.get(key);
		if (running) return running;
		const work = (async () => {
			while (this.has(key)) {
				const sent = this.get(key)!;
				await write(sent);
				this.errors.delete(key);
				const current = this.get(key);
				if (current === sent) this.delete(key);
				else if (current) this.set(key, this.rebase(current, sent));
			}
		})().catch((error) => {
			if (this.has(key)) this.errors.set(key, error);
			throw error;
		});
		this.running.set(key, work);
		// Return the same promise to every caller and always release the writer on failure.
		void work
			.finally(() => {
				if (this.running.get(key) === work) this.running.delete(key);
			})
			.catch(() => {});
		return work;
	}
}

export const createBoardSyncQueue = () =>
	new SyncQueue<PendingBoardSync>((current, sent) => ({
		...current,
		previousKanbanData: sent.nextKanbanData
	}));
export const createPageSyncQueue = () =>
	new SyncQueue<PendingPageSync>((current, sent) => ({
		...current,
		previousContent: sent.content
	}));
