import fs from "fs/promises";
import { randomUUID } from "crypto";
import type { AiScopeHint, BoundTarget, KanbanData, Task } from "./types.js";
import {
    purgeTaskLinks,
    removeTaskReferenceFromMarkdown,
} from "../../src/lib/kainbu/taskLinks.js";
import {
    WORKSPACE_AI_ADD_TASKS_MAX_TITLES,
    WORKSPACE_AI_BOARD_LIST_TASKS_DEFAULT_LIMIT,
    WORKSPACE_AI_DELETE_TASKS_MAX_REFS,
    WORKSPACE_AI_UPDATE_TASK_MAX_CHARS,
} from "./constants.js";
import type { MaterializedWorkspace } from "./sync.js";
import { serializeKanbanDocument } from "./sync.js";

export type ToolResultPayload =
    | {
          ok: true;
          taskIds?: string[];
          taskRefs?: string[];
          message?: string;
          columns?: Array<{ ref: string; title: string; taskCount: number }>;
          tasks?: Array<{ ref: string; title: string; description?: string }>;
          hasMore?: boolean;
          nextOffset?: number;
      }
    | {
          ok: false;
          error: string;
          columnRefs?: string[];
          taskRefs?: string[];
          hint?: string;
      };

export type BoardRefMap = {
    boardName: string;
    indexText: string;
    columnRefToId: Map<string, string>;
    taskRefToId: Map<string, string>;
    columnIdToRef: Map<string, string>;
    taskIdToRef: Map<string, string>;
};

const trimString = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_PATTERN.test(value.trim());

export const buildBoardRefIndex = (
    kanban: KanbanData,
    boardName: string,
    maxLines = 120
): BoardRefMap => {
    const columnRefToId = new Map<string, string>();
    const taskRefToId = new Map<string, string>();
    const columnIdToRef = new Map<string, string>();
    const taskIdToRef = new Map<string, string>();

    let columnCounter = 0;
    let taskCounter = 0;
    const lines: string[] = [`Board: ${boardName}`, "Internal refs (tools only — never show to user):"];

    for (const column of kanban) {
        if (lines.length >= maxLines) {
            lines.push("…(index truncated — use board_list_columns / board_list_tasks)");
            break;
        }
        columnCounter += 1;
        const columnRef = `C${columnCounter}`;
        columnRefToId.set(columnRef, column.id);
        columnIdToRef.set(column.id, columnRef);
        lines.push(`${column.title} [${columnRef}]`);

        for (const task of column.tasks) {
            if (lines.length >= maxLines) {
                lines.push("…(index truncated — use board_list_columns / board_list_tasks)");
                return {
                    boardName,
                    indexText: lines.join("\n"),
                    columnRefToId,
                    taskRefToId,
                    columnIdToRef,
                    taskIdToRef,
                };
            }
            taskCounter += 1;
            const taskRef = `T${taskCounter}`;
            taskRefToId.set(taskRef, task.id);
            taskIdToRef.set(task.id, taskRef);
            lines.push(`  ${taskRef}  ${task.title}`);
        }
    }

    return {
        boardName,
        indexText: lines.join("\n"),
        columnRefToId,
        taskRefToId,
        columnIdToRef,
        taskIdToRef,
    };
};

export const resolveColumnRef = (refs: BoardRefMap, ref: string): string | null => {
    const trimmed = trimString(ref);
    if (!trimmed) return null;
    if (refs.columnRefToId.has(trimmed)) return refs.columnRefToId.get(trimmed)!;
    if (refs.columnIdToRef.has(trimmed)) return trimmed;
    const normalized = trimmed.toUpperCase();
    if (refs.columnRefToId.has(normalized)) return refs.columnRefToId.get(normalized)!;
    return null;
};

export const resolveTaskRef = (refs: BoardRefMap, ref: string): string | null => {
    const trimmed = trimString(ref);
    if (!trimmed) return null;
    if (refs.taskRefToId.has(trimmed)) return refs.taskRefToId.get(trimmed)!;
    if (refs.taskIdToRef.has(trimmed)) return trimmed;
    const normalized = trimmed.toUpperCase();
    if (refs.taskRefToId.has(normalized)) return refs.taskRefToId.get(normalized)!;
    return null;
};

export const getColumnIds = (kanban: KanbanData) => kanban.map((column) => column.id);

export const findColumn = (kanban: KanbanData, columnId: string) =>
    kanban.find((column) => column.id === columnId);

export const findTask = (kanban: KanbanData, taskId: string) => {
    for (const column of kanban) {
        const index = column.tasks.findIndex((task) => task.id === taskId);
        if (index !== -1) {
            return { column, task: column.tasks[index], index };
        }
    }
    return null;
};

export const listBoardColumns = (kanban: KanbanData, refs: BoardRefMap): ToolResultPayload => ({
    ok: true,
    columns: kanban.map((column) => ({
        ref: refs.columnIdToRef.get(column.id) || column.id,
        title: column.title,
        taskCount: column.tasks.length,
    })),
});

export const listBoardTasks = (
    kanban: KanbanData,
    refs: BoardRefMap,
    columnRef: string,
    offset = 0,
    limit = WORKSPACE_AI_BOARD_LIST_TASKS_DEFAULT_LIMIT
): ToolResultPayload => {
    const columnId = resolveColumnRef(refs, columnRef);
    if (!columnId) {
        return {
            ok: false,
            error: `Unknown column ref "${columnRef}".`,
            columnRefs: [...refs.columnRefToId.keys()],
            hint: "Call board_list_columns first.",
        };
    }

    const column = findColumn(kanban, columnId);
    if (!column) {
        return {
            ok: false,
            error: `Column not found for ref "${columnRef}".`,
            columnRefs: [...refs.columnRefToId.keys()],
        };
    }

    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const slice = column.tasks.slice(safeOffset, safeOffset + safeLimit);
    const hasMore = safeOffset + slice.length < column.tasks.length;

    return {
        ok: true,
        tasks: slice.map((task) => ({
            ref: refs.taskIdToRef.get(task.id) || task.id,
            title: task.title,
            ...(task.description ? { description: task.description } : {}),
        })),
        hasMore,
        ...(hasMore ? { nextOffset: safeOffset + slice.length } : {}),
        message: `${column.title}: showing ${slice.length} task(s)${hasMore ? " (more available)" : ""}.`,
    };
};

const isBoundToTask = (bound?: BoundTarget) => bound?.locked && bound.kind === "task" && bound.id;

const isBoundToColumn = (bound?: BoundTarget) => bound?.locked && bound.kind === "column" && bound.id;

export const assertBoundTargetForBoardMutation = (
    scope: AiScopeHint | undefined,
    refs: BoardRefMap,
    kanban: KanbanData,
    touched: { taskIds?: string[]; columnIds?: string[] }
): ToolResultPayload | null => {
    const bound = scope?.boundTarget;
    if (!bound?.locked) return null;

    if (isBoundToTask(bound) && bound.id) {
        const foreignTasks = (touched.taskIds || []).filter((id) => id !== bound.id);
        if (foreignTasks.length) {
            const taskRef = refs.taskIdToRef.get(bound.id);
            const title =
                scope?.queuedTaskCards?.find((card) => card.taskId === bound.id)?.title || "the focused task";
            return {
                ok: false,
                error: `This request is scoped to "${title}".`,
                taskRefs: taskRef ? [taskRef] : undefined,
                hint: "Only update that task, or ask the user to widen scope.",
            };
        }
    }

    if (isBoundToColumn(bound) && bound.id) {
        const foreignColumns = (touched.columnIds || []).filter((id) => id !== bound.id);
        if (foreignColumns.length) {
            const columnTitle = findColumn(kanban, bound.id)?.title || "the focused column";
            return {
                ok: false,
                error: `This request is scoped to column "${columnTitle}".`,
                columnRefs: refs.columnIdToRef.get(bound.id)
                    ? [refs.columnIdToRef.get(bound.id)!]
                    : undefined,
                hint: "Only change tasks in that column, or ask the user to widen scope.",
            };
        }
    }

    return null;
};

export const persistBoardKanbanData = async (
    workspace: MaterializedWorkspace,
    kanbanData: KanbanData
) => {
    workspace.board.kanbanData = kanbanData;
    const content = serializeKanbanDocument(kanbanData);
    await fs.writeFile(workspace.board.filePath, content, "utf8");
};

const refreshBoardRefs = (workspace: MaterializedWorkspace) => {
    workspace.boardRefs = buildBoardRefIndex(workspace.board.kanbanData, workspace.board.name);
};

const stripRemovedTaskFromBoard = (kanban: KanbanData, removedTaskId: string): KanbanData => {
    const withoutLinks = purgeTaskLinks(kanban, removedTaskId);
    return withoutLinks.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => ({
            ...task,
            title: removeTaskReferenceFromMarkdown(task.title, removedTaskId),
            description: removeTaskReferenceFromMarkdown(task.description, removedTaskId),
        })),
    }));
};

export const addTasks = async (
    workspace: MaterializedWorkspace,
    columnRef: string,
    titles: string[],
    scope?: AiScopeHint
): Promise<ToolResultPayload> => {
    const refs = workspace.boardRefs;
    const columnId = resolveColumnRef(refs, columnRef);
    const kanban = workspace.board.kanbanData;

    if (!columnId) {
        return {
            ok: false,
            error: `Unknown column ref "${columnRef}".`,
            columnRefs: [...refs.columnRefToId.keys()],
            hint: "Use a column ref from the board index or board_list_columns.",
        };
    }

    const column = findColumn(kanban, columnId);
    if (!column) {
        return {
            ok: false,
            error: `Column not found for ref "${columnRef}".`,
            columnRefs: [...refs.columnRefToId.keys()],
        };
    }

    const boundCheck = assertBoundTargetForBoardMutation(scope, refs, kanban, {
        columnIds: [columnId],
    });
    if (boundCheck) return boundCheck;

    const normalizedTitles = titles
        .map((title) => trimString(title))
        .filter(Boolean)
        .slice(0, WORKSPACE_AI_ADD_TASKS_MAX_TITLES);

    if (!normalizedTitles.length) {
        return { ok: false, error: "Provide at least one non-empty task title." };
    }

    if (titles.length > WORKSPACE_AI_ADD_TASKS_MAX_TITLES) {
        return {
            ok: false,
            error: `Max ${WORKSPACE_AI_ADD_TASKS_MAX_TITLES} titles per add_tasks call.`,
            hint: "Split into multiple calls or ask the user to send fewer tasks.",
        };
    }

    const newTaskIds: string[] = [];
    const newTaskRefs: string[] = [];
    let nextTaskNum = refs.taskRefToId.size;

    const nextKanban = kanban.map((entry) => {
        if (entry.id !== columnId) return entry;
        const newTasks: Task[] = normalizedTitles.map((title) => {
            const id = randomUUID();
            newTaskIds.push(id);
            nextTaskNum += 1;
            const taskRef = `T${nextTaskNum}`;
            newTaskRefs.push(taskRef);
            refs.taskRefToId.set(taskRef, id);
            refs.taskIdToRef.set(id, taskRef);
            return {
                id,
                title,
                description: "",
                tags: [],
            };
        });
        return {
            ...entry,
            tasks: [...entry.tasks, ...newTasks],
        };
    });

    workspace.board.mutationCount += newTaskIds.length;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    return {
        ok: true,
        taskRefs: newTaskRefs,
        message: `Added ${newTaskIds.length} task(s) to ${column.title}.`,
    };
};

export const updateTask = async (
    workspace: MaterializedWorkspace,
    taskRef: string,
    fields: { title?: string; description?: string },
    scope?: AiScopeHint
): Promise<ToolResultPayload> => {
    const refs = workspace.boardRefs;
    const taskId = resolveTaskRef(refs, taskRef);
    const kanban = workspace.board.kanbanData;

    if (!taskId) {
        return {
            ok: false,
            error: `Unknown task ref "${taskRef}".`,
            taskRefs: [...refs.taskRefToId.keys()].slice(0, 50),
            hint: "Use a task ref from the board index or board_list_tasks.",
        };
    }

    const located = findTask(kanban, taskId);
    if (!located) {
        return {
            ok: false,
            error: `Task not found for ref "${taskRef}".`,
            taskRefs: [...refs.taskRefToId.keys()].slice(0, 50),
        };
    }

    const boundCheck = assertBoundTargetForBoardMutation(scope, refs, kanban, {
        taskIds: [taskId],
        columnIds: [located.column.id],
    });
    if (boundCheck) return boundCheck;

    const nextTitle = fields.title !== undefined ? trimString(fields.title) : located.task.title;
    const nextDescription =
        fields.description !== undefined ? String(fields.description) : located.task.description || "";

    if (!nextTitle) {
        return { ok: false, error: "Task title cannot be empty." };
    }

    const combinedLength = nextTitle.length + nextDescription.length;
    if (combinedLength > WORKSPACE_AI_UPDATE_TASK_MAX_CHARS) {
        return {
            ok: false,
            error: `Title and description combined must be under ${WORKSPACE_AI_UPDATE_TASK_MAX_CHARS} characters.`,
        };
    }

    const nextKanban = kanban.map((column) => {
        if (column.id !== located.column.id) return column;
        return {
            ...column,
            tasks: column.tasks.map((task) =>
                task.id === taskId
                    ? {
                          ...task,
                          title: nextTitle,
                          description: nextDescription,
                      }
                    : task
            ),
        };
    });

    workspace.board.mutationCount += 1;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    return { ok: true, message: `Updated task "${nextTitle}".` };
};

export const deleteTasks = async (
    workspace: MaterializedWorkspace,
    taskRefs: string[],
    scope?: AiScopeHint
): Promise<ToolResultPayload> => {
    const refs = workspace.boardRefs;
    const kanban = workspace.board.kanbanData;

    const normalizedRefs = [
        ...new Set(taskRefs.map((ref) => trimString(ref)).filter(Boolean)),
    ].slice(0, WORKSPACE_AI_DELETE_TASKS_MAX_REFS);

    if (!normalizedRefs.length) {
        return { ok: false, error: "Provide at least one taskRef to delete." };
    }

    if (taskRefs.length > WORKSPACE_AI_DELETE_TASKS_MAX_REFS) {
        return {
            ok: false,
            error: `Max ${WORKSPACE_AI_DELETE_TASKS_MAX_REFS} taskRefs per delete_tasks call.`,
            hint: "Split into multiple calls or ask the user to send fewer tasks.",
        };
    }

    const resolved: Array<{ taskRef: string; taskId: string; title: string; columnId: string }> =
        [];
    const unknownRefs: string[] = [];

    for (const taskRef of normalizedRefs) {
        const taskId = resolveTaskRef(refs, taskRef);
        if (!taskId) {
            unknownRefs.push(taskRef);
            continue;
        }

        const located = findTask(kanban, taskId);
        if (!located) {
            unknownRefs.push(taskRef);
            continue;
        }

        const boundCheck = assertBoundTargetForBoardMutation(scope, refs, kanban, {
            taskIds: [taskId],
            columnIds: [located.column.id],
        });
        if (boundCheck) return boundCheck;

        resolved.push({
            taskRef,
            taskId,
            title: located.task.title,
            columnId: located.column.id,
        });
    }

    if (!resolved.length) {
        return {
            ok: false,
            error: "No matching tasks found for the given taskRefs.",
            taskRefs: [...refs.taskRefToId.keys()].slice(0, 50),
            ...(unknownRefs.length ? { hint: `Unknown refs: ${unknownRefs.join(", ")}` } : {}),
        };
    }

    const deleteIds = new Set(resolved.map((entry) => entry.taskId));
    let nextKanban = kanban.map((column) => ({
        ...column,
        tasks: column.tasks.filter((task) => !deleteIds.has(task.id)),
    }));

    for (const taskId of deleteIds) {
        nextKanban = stripRemovedTaskFromBoard(nextKanban, taskId);
    }

    workspace.board.mutationCount += resolved.length;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    const titles = resolved.map((entry) => `"${entry.title}"`).join(", ");
    return {
        ok: true,
        taskRefs: resolved.map((entry) => entry.taskRef),
        message: `Deleted ${resolved.length} task(s): ${titles}.`,
        ...(unknownRefs.length
            ? { hint: `Skipped unknown refs: ${unknownRefs.join(", ")}` }
            : {}),
    };
};

export const formatToolResult = (payload: ToolResultPayload) => JSON.stringify(payload);

export const sanitizeUserFacingReply = (text: string) =>
    text
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
        .replace(/\((?:taskId|columnId|taskRef|columnRef):[^)]+\)/gi, "")
        .replace(/\b(?:taskId|columnId|taskRef|columnRef):\s*[^\s,)]+/gi, "")
        .replace(/\(\s*\)/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
