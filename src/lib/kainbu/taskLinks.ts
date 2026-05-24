import { DEFAULT_COLUMN_WIDTH } from '$lib/kainbu/constants';
import { createId } from '$lib/kainbu/id';
import { buildReferenceMarkdown } from '$lib/kainbu/taskMarkdown';
import type { KanbanData, Task } from '$lib/kainbu/types';

export type TaskLinkEdgeKind = 'explicit' | 'reference';

export type TaskLinkEdge = {
	fromId: string;
	toId: string;
	kind: TaskLinkEdgeKind;
};

export type TaskLinkGraph = {
	taskIds: Set<string>;
	edges: TaskLinkEdge[];
	adjacency: Map<string, Set<string>>;
};

export type TaskPlacement = {
	task: Task;
	columnId: string;
	columnTitle: string;
};

export type LinkGroupColumn = {
	id: string;
	title: string;
	subtitle: string;
	tasks: TaskPlacement[];
	isLinkGroup: true;
};

export type ResidualColumn = {
	id: string;
	title: string;
	color?: string;
	width: number;
	tasks: Task[];
	isLinkGroup?: false;
};

const TASK_REFERENCE_PATTERN = /\[([^\]]+)\]\(ref:task:([^)]+)\)/g;

export const normalizeLinkedTaskIds = (value: string[] | undefined): string[] =>
	[...new Set((value || []).filter((entry) => typeof entry === 'string' && entry.trim()))];

export const parseTaskReferenceIds = (markdown: string | undefined): string[] => {
	if (!markdown?.trim()) return [];
	const ids: string[] = [];
	let match: RegExpExecArray | null;
	const pattern = new RegExp(TASK_REFERENCE_PATTERN.source, 'g');
	while ((match = pattern.exec(markdown)) !== null) {
		const taskId = match[2]?.trim();
		if (taskId) ids.push(taskId);
	}
	return [...new Set(ids)];
};

export const removeTaskReferenceFromMarkdown = (
	markdown: string | undefined,
	targetTaskId: string
): string => {
	if (!markdown?.trim() || !targetTaskId.trim()) return markdown || '';
	const escapedId = targetTaskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`\\[([^\\]]*)\\]\\(ref:task:${escapedId}\\)`, 'g');
	return markdown
		.replace(pattern, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd();
};

export const getDescriptionReferencedPlacements = (
	data: KanbanData,
	taskId: string
): TaskPlacement[] => {
	const placement = findTaskPlacement(data, taskId);
	if (!placement) return [];

	const explicit = new Set(normalizeLinkedTaskIds(placement.task.linkedTaskIds));
	return parseTaskReferenceIds(placement.task.description)
		.filter((referencedId) => !explicit.has(referencedId))
		.map((referencedId) => findTaskPlacement(data, referencedId))
		.filter((entry): entry is TaskPlacement => Boolean(entry));
};

export const countUniqueTaskLinks = (task: Task): number => {
	const explicit = normalizeLinkedTaskIds(task.linkedTaskIds);
	const references = parseTaskReferenceIds(task.description);
	return new Set([...explicit, ...references]).size;
};

const forEachTask = (
	data: KanbanData,
	callback: (task: Task, columnId: string, columnTitle: string) => void
) => {
	for (const column of data) {
		for (const task of column.tasks) {
			callback(task, column.id, column.title);
		}
	}
};

const findTaskPlacement = (data: KanbanData, taskId: string): TaskPlacement | null => {
	for (const column of data) {
		const task = column.tasks.find((entry) => entry.id === taskId);
		if (task) {
			return {
				task,
				columnId: column.id,
				columnTitle: column.title
			};
		}
	}
	return null;
};

const mapTasks = (
	data: KanbanData,
	mapper: (task: Task, columnId: string, columnTitle: string) => Task
): KanbanData =>
	data.map((column) => ({
		...column,
		tasks: column.tasks.map((task) => mapper(task, column.id, column.title))
	}));

export const buildTaskLinkGraph = (data: KanbanData): TaskLinkGraph => {
	const taskIds = new Set<string>();
	const edges: TaskLinkEdge[] = [];
	const edgeKeys = new Set<string>();
	const adjacency = new Map<string, Set<string>>();

	const addEdge = (fromId: string, toId: string, kind: TaskLinkEdgeKind) => {
		if (fromId === toId || !taskIds.has(fromId) || !taskIds.has(toId)) return;
		const key = `${fromId}|${toId}|${kind}`;
		if (edgeKeys.has(key)) return;
		edgeKeys.add(key);
		edges.push({ fromId, toId, kind });
		if (!adjacency.has(fromId)) adjacency.set(fromId, new Set());
		adjacency.get(fromId)?.add(toId);
	};

	forEachTask(data, (task) => {
		taskIds.add(task.id);
	});

	forEachTask(data, (task) => {
		for (const linkedId of normalizeLinkedTaskIds(task.linkedTaskIds)) {
			addEdge(task.id, linkedId, 'explicit');
			addEdge(linkedId, task.id, 'explicit');
		}
		for (const referencedId of parseTaskReferenceIds(task.description)) {
			addEdge(task.id, referencedId, 'reference');
		}
	});

	return { taskIds, edges, adjacency };
};

export const getConnectedComponent = (taskId: string, graph: TaskLinkGraph): string[] => {
	if (!graph.taskIds.has(taskId)) return [taskId];

	const visited = new Set<string>([taskId]);
	const queue = [taskId];

	while (queue.length) {
		const current = queue.shift();
		if (!current) continue;

		for (const edge of graph.edges) {
			const neighbor =
				edge.fromId === current ? edge.toId : edge.toId === current ? edge.fromId : null;
			if (!neighbor || visited.has(neighbor)) continue;
			visited.add(neighbor);
			queue.push(neighbor);
		}
	}

	return [...visited];
};

export const getConnectedComponents = (data: KanbanData): string[][] => {
	const graph = buildTaskLinkGraph(data);
	const visited = new Set<string>();
	const components: string[][] = [];

	for (const taskId of graph.taskIds) {
		if (visited.has(taskId)) continue;
		const component = getConnectedComponent(taskId, graph);
		for (const id of component) visited.add(id);
		components.push(component);
	}

	return components.sort((left, right) => right.length - left.length);
};

export const getMultiCardComponentTaskIds = (data: KanbanData): Set<string> => {
	const grouped = new Set<string>();
	for (const component of getConnectedComponents(data)) {
		if (component.length < 2) continue;
		for (const taskId of component) grouped.add(taskId);
	}
	return grouped;
};

export const buildLinkGroupLayout = (
	data: KanbanData
): { linkGroupColumns: LinkGroupColumn[]; residualColumns: ResidualColumn[] } => {
	const groupedTaskIds = getMultiCardComponentTaskIds(data);
	const components = getConnectedComponents(data).filter((component) => component.length >= 2);

	const linkGroupColumns: LinkGroupColumn[] = components.map((component) => {
		const placements = component
			.map((taskId) => findTaskPlacement(data, taskId))
			.filter((entry): entry is TaskPlacement => Boolean(entry))
			.sort((left, right) => left.task.title.localeCompare(right.task.title));

		const anchor = placements[0];
		return {
			id: `link-group-${component[0]}`,
			title: `Linked · ${component.length} cards`,
			subtitle: anchor ? anchor.task.title : 'Link group',
			tasks: placements,
			isLinkGroup: true as const
		};
	});

	const residualColumns: ResidualColumn[] = data
		.map((column) => ({
			id: column.id,
			title: column.title,
			color: column.color,
			width: column.width ?? DEFAULT_COLUMN_WIDTH,
			tasks: column.tasks.filter((task) => !groupedTaskIds.has(task.id)),
			isLinkGroup: false as const
		}))
		.filter((column) => column.tasks.length > 0);

	return { linkGroupColumns, residualColumns };
};

const withLinkedIds = (task: Task, linkedTaskIds: string[]): Task => ({
	...task,
	linkedTaskIds: normalizeLinkedTaskIds(linkedTaskIds)
});

export const addBidirectionalLink = (data: KanbanData, taskAId: string, taskBId: string): KanbanData => {
	if (taskAId === taskBId) return data;

	return mapTasks(data, (task) => {
		if (task.id === taskAId) {
			return withLinkedIds(task, [...normalizeLinkedTaskIds(task.linkedTaskIds), taskBId]);
		}
		if (task.id === taskBId) {
			return withLinkedIds(task, [...normalizeLinkedTaskIds(task.linkedTaskIds), taskAId]);
		}
		return task;
	});
};

export const removeBidirectionalLink = (
	data: KanbanData,
	taskAId: string,
	taskBId: string
): KanbanData =>
	mapTasks(data, (task) => {
		if (task.id !== taskAId && task.id !== taskBId) return task;
		const otherId = task.id === taskAId ? taskBId : taskAId;
		return withLinkedIds(
			task,
			normalizeLinkedTaskIds(task.linkedTaskIds).filter((entry) => entry !== otherId)
		);
	});

export const purgeTaskLinks = (data: KanbanData, removedTaskId: string): KanbanData =>
	mapTasks(data, (task) =>
		withLinkedIds(
			task,
			normalizeLinkedTaskIds(task.linkedTaskIds).filter((entry) => entry !== removedTaskId)
		)
	);

export type CreateLinkedTaskResult = {
	data: KanbanData;
	taskId: string;
	columnId: string;
};

export const createLinkedTask = (
	data: KanbanData,
	sourceTaskId: string,
	columnId: string,
	createTaskId: () => string = createId
): CreateLinkedTaskResult | null => {
	const source = findTaskPlacement(data, sourceTaskId);
	if (!source) return null;

	const timestamp = Date.now();
	const newTaskId = createTaskId();
	const referenceMarkdown = buildReferenceMarkdown({
		kind: 'task',
		id: source.task.id,
		label: source.task.title.trim() || 'Untitled task',
		searchText: source.task.title,
		columnId: source.columnId,
		columnTitle: source.columnTitle
	});

	const nextTask: Task = {
		id: newTaskId,
		title: `Linked: ${source.task.title.trim() || 'Untitled task'}`,
		description: referenceMarkdown,
		tags: [],
		linkedTaskIds: [source.task.id],
		createdAt: timestamp,
		updatedAt: timestamp
	};

	let nextData = data.map((column) =>
		column.id === columnId
			? {
					...column,
					tasks: [nextTask, ...column.tasks]
				}
			: column
	);

	nextData = addBidirectionalLink(nextData, sourceTaskId, newTaskId);

	return {
		data: nextData,
		taskId: newTaskId,
		columnId
	};
};

export const getExplicitLinkedTasks = (data: KanbanData, taskId: string): TaskPlacement[] => {
	const placement = findTaskPlacement(data, taskId);
	if (!placement) return [];

	return normalizeLinkedTaskIds(placement.task.linkedTaskIds)
		.map((linkedId) => findTaskPlacement(data, linkedId))
		.filter((entry): entry is TaskPlacement => Boolean(entry));
};

export const getComponentEdges = (
	graph: TaskLinkGraph,
	componentTaskIds: Set<string>
): TaskLinkEdge[] => {
	const unique = new Map<string, TaskLinkEdge>();
	for (const edge of graph.edges) {
		if (!componentTaskIds.has(edge.fromId) || !componentTaskIds.has(edge.toId)) continue;
		const [leftId, rightId] = [edge.fromId, edge.toId].sort();
		const key = `${leftId}|${rightId}|${edge.kind}`;
		unique.set(key, edge);
	}
	return [...unique.values()];
};
