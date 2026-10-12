import { buildBoardRefIndex } from '@kainbu/core';
import { normalizeBoardPreferences } from '$lib/kainbu/boardPreferences';
import { retainDeletedTasks } from '$lib/kainbu/boardSyncCore';
import type { KanbanData } from '../../../../src/lib/kainbu/types.js';
import { resolveContext } from '../context.js';
import { syncProjectBoard } from '../writes.js';

export type BoardTargetOptions = { project?: string; board?: string };

/**
 * A board as commands see it. `kanban` is the stored board including trashed
 * tasks; `live` hides them and is what refs (T1, C1) and edits refer to.
 */
export const loadBoard = async (options: BoardTargetOptions, mode: { exact?: boolean } = {}) => {
	const ctx = await resolveContext({ ...options, requireBoard: true, exact: mode.exact });
	const kanban = ctx.board.kanbanData;
	const live: KanbanData = kanban.map((column) => ({
		...column,
		tasks: column.tasks.filter((task) => !task.deletedAt)
	}));
	const refs = buildBoardRefIndex(live, ctx.board.name, Infinity);
	const preferences = normalizeBoardPreferences(ctx.board.preferences);
	return { ...ctx, kanban, live, refs, preferences };
};

export type BoardContext = Awaited<ReturnType<typeof loadBoard>>;

/**
 * Writes an edited live board. Like the web app, removed tasks stay on the
 * board as trash (`deletedAt`) instead of being dropped from the snapshot.
 */
export const commitBoard = async (ctx: BoardContext, nextLive: KanbanData, dryRun?: boolean) => {
	const next = retainDeletedTasks(ctx.kanban, nextLive);
	if (!dryRun) await syncProjectBoard(ctx.project.id, ctx.board.id, ctx.kanban, next);
	return next;
};
