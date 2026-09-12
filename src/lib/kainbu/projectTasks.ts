import type { Project } from './types';

/** Walk every board once. kanbanData is the active board's legacy alias. */
export const projectTaskEntries = (project: Project) => {
	const boards = project.boards.length
		? project.boards
		: [{ id: project.activeBoardId, name: project.name, kanbanData: project.kanbanData }];
	const seen = new Set<string>();
	return boards.flatMap((board) =>
		board.kanbanData.flatMap((column) =>
			column.tasks.flatMap((task) => {
				if (seen.has(task.id)) return [];
				seen.add(task.id);
				return [{ boardId: board.id, boardName: board.name, column, task }];
			})
		)
	);
};
