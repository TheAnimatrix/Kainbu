import type { AiScopeHint } from "./types.js";
import {
    WORKSPACE_AI_MAX_ADD_COLUMN_CALLS,
    WORKSPACE_AI_MAX_ADD_TASKS_CALLS,
    WORKSPACE_AI_MAX_BOARD_MUTATIONS,
    WORKSPACE_AI_MAX_BULK_UPDATE_TASK_CALLS,
    WORKSPACE_AI_MAX_DELETE_TASK_CALLS,
    WORKSPACE_AI_MAX_TOOL_CALLS,
    WORKSPACE_AI_MAX_UPDATE_COLUMN_CALLS,
    WORKSPACE_AI_MAX_UPDATE_TASK_CALLS,
    WORKSPACE_AI_READ_MAX_CHARS,
} from "./constants.js";
import {
    addColumn,
    addTasks,
    bulkUpdateTasks,
    deleteTasks,
    findColumn,
    formatToolResult,
    listBoardColumns,
    listBoardTasks,
    parseTaskDraftsFromArgs,
    parseTaskUpdateFields,
    resolveColumnRef,
    searchBoardTasks,
    updateColumn,
    updateTask,
} from "./kanban-ops.js";
import type { MaterializedWorkspace } from "./sync.js";
import {
    createWorkspacePage,
    listWorkspacePages,
    recordWorkspaceMutation,
    setWorkspacePageContent,
} from "./sync.js";
import { webSearch } from "./tools.js";

export type ToolRunCounters = {
    toolCalls: number;
    addTasksCalls: number;
    updateTaskCalls: number;
    bulkUpdateTaskCalls: number;
    deleteTaskCalls: number;
    addColumnCalls: number;
    updateColumnCalls: number;
    boardMutations: number;
};

const trimString = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

export const createToolRunCounters = (): ToolRunCounters => ({
    toolCalls: 0,
    addTasksCalls: 0,
    updateTaskCalls: 0,
    bulkUpdateTaskCalls: 0,
    deleteTaskCalls: 0,
    addColumnCalls: 0,
    updateColumnCalls: 0,
    boardMutations: 0,
});

const checkToolBudget = (counters: ToolRunCounters) => {
    if (counters.toolCalls >= WORKSPACE_AI_MAX_TOOL_CALLS) {
        return formatToolResult({
            ok: false,
            error: `Max ${WORKSPACE_AI_MAX_TOOL_CALLS} tool calls per message reached.`,
            hint: "Summarize progress for the user; they can send another message to continue.",
        });
    }
    return null;
};

const checkBoardMutationBudget = (workspace: MaterializedWorkspace) => {
    if (workspace.board.mutationCount >= WORKSPACE_AI_MAX_BOARD_MUTATIONS) {
        return formatToolResult({
            ok: false,
            error: `Max ${WORKSPACE_AI_MAX_BOARD_MUTATIONS} board changes per message reached.`,
            hint: "Summarize what was done; the user can send another message to continue remaining work.",
        });
    }
    return null;
};

const columnTitleForRef = (workspace: MaterializedWorkspace, columnRef: string) => {
    const columnId = resolveColumnRef(workspace.boardRefs, columnRef);
    if (!columnId) return columnRef;
    return findColumn(workspace.board.kanbanData, columnId)?.title || columnRef;
};

export const humanizeToolCall = (
    name: string,
    args: Record<string, unknown>,
    workspace: MaterializedWorkspace
) => {
    if (name === "board_list_columns") return "Listing board columns";
    if (name === "board_list_tasks") {
        const columnRef = String(args.columnRef || "");
        return `Listing tasks in ${columnTitleForRef(workspace, columnRef)}`;
    }
    if (name === "add_tasks") {
        const columnRef = String(args.columnRef || "");
        const tasks = Array.isArray(args.tasks) ? args.tasks : [];
        const titles = Array.isArray(args.titles) ? args.titles : [];
        const count = tasks.length || titles.length;
        const columnTitle = columnTitleForRef(workspace, columnRef);
        return `Adding ${count} task(s) to ${columnTitle}`;
    }
    if (name === "update_task") return "Updating task";
    if (name === "bulk_update_tasks") {
        const updates = Array.isArray(args.updates) ? args.updates : [];
        return `Updating ${updates.length} task(s)`;
    }
    if (name === "add_column") return `Adding column "${String(args.title || "")}"`;
    if (name === "update_column") return "Updating column";
    if (name === "delete_tasks") {
        const taskRefs = Array.isArray(args.taskRefs) ? args.taskRefs : [];
        return `Deleting ${taskRefs.length} task(s)`;
    }
    if (name === "list_pages") return "Listing pages";
    if (name === "get_page") return "Reading page";
    if (name === "set_page") return "Updating current page";
    if (name === "create_page") {
        const title = String(args.title || "");
        return `Creating page "${title}"`;
    }
    if (name === "web_search") return "Searching the web";
    return `Using ${name}`;
};

export const executeWorkspaceTool = async (
    name: string,
    args: Record<string, unknown>,
    workspace: MaterializedWorkspace,
    scope: AiScopeHint | undefined,
    counters: ToolRunCounters
): Promise<string> => {
    const budgetError = checkToolBudget(counters);
    if (budgetError) return budgetError;

    counters.toolCalls += 1;
    const refs = workspace.boardRefs;
    const kanban = workspace.board.kanbanData;

    if (name === "board_list_columns") {
        return formatToolResult(listBoardColumns(kanban, refs));
    }

    if (name === "board_list_tasks") {
        const columnRef = String(args.columnRef || "");
        const offset = typeof args.offset === "number" ? args.offset : 0;
        const limit = typeof args.limit === "number" ? args.limit : undefined;
        return formatToolResult(listBoardTasks(kanban, refs, columnRef, offset, limit));
    }

    if (name === "add_tasks") {
        if (counters.addTasksCalls >= WORKSPACE_AI_MAX_ADD_TASKS_CALLS) {
            return formatToolResult({
                ok: false,
                error: `Max ${WORKSPACE_AI_MAX_ADD_TASKS_CALLS} add_tasks calls per message.`,
                hint: "Call add_tasks again in the next tool round if board change budget remains.",
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        counters.addTasksCalls += 1;
        const titles = Array.isArray(args.titles)
            ? args.titles.filter((entry): entry is string => typeof entry === "string")
            : [];
        const draftsResult = parseTaskDraftsFromArgs(args);
        if (!draftsResult.ok) return formatToolResult(draftsResult);
        const columnRef = String(args.columnRef || args.columnId || "");
        const result = await addTasks(
            workspace,
            columnRef,
            titles,
            scope,
            draftsResult.drafts
        );
        if (result.ok && result.taskRefs) {
            counters.boardMutations += result.taskRefs.length;
        }
        return formatToolResult(result);
    }

    if (name === "update_task") {
        if (counters.updateTaskCalls >= WORKSPACE_AI_MAX_UPDATE_TASK_CALLS) {
            return formatToolResult({
                ok: false,
                error: `Max ${WORKSPACE_AI_MAX_UPDATE_TASK_CALLS} update_task calls per message.`,
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        const parsed = parseTaskUpdateFields(args);
        if (!parsed.ok) return formatToolResult(parsed);

        counters.updateTaskCalls += 1;
        const taskRef = String(args.taskRef || args.taskId || "");
        const result = await updateTask(workspace, taskRef, parsed.fields, scope);
        if (result.ok) counters.boardMutations += 1;
        return formatToolResult(result);
    }

    if (name === "bulk_update_tasks") {
        if (counters.bulkUpdateTaskCalls >= WORKSPACE_AI_MAX_BULK_UPDATE_TASK_CALLS) {
            return formatToolResult({
                ok: false,
                error: `Max ${WORKSPACE_AI_MAX_BULK_UPDATE_TASK_CALLS} bulk_update_tasks calls per message.`,
                hint: "Call bulk_update_tasks again in the next tool round for remaining tasks.",
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        counters.bulkUpdateTaskCalls += 1;
        const updates = Array.isArray(args.updates)
            ? args.updates.filter(
                  (entry): entry is Record<string, unknown> =>
                      Boolean(entry) && typeof entry === "object"
              )
            : [];
        const result = await bulkUpdateTasks(
            workspace,
            updates.map((entry) => ({
                taskRef: String(entry.taskRef || ""),
                ...entry,
            })),
            scope
        );
        if (result.ok && result.updatedCount) {
            counters.boardMutations += result.updatedCount;
        }
        return formatToolResult(result);
    }

    if (name === "add_column") {
        if (counters.addColumnCalls >= WORKSPACE_AI_MAX_ADD_COLUMN_CALLS) {
            return formatToolResult({
                ok: false,
                error: `Max ${WORKSPACE_AI_MAX_ADD_COLUMN_CALLS} add_column calls per message.`,
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        counters.addColumnCalls += 1;
        const result = await addColumn(workspace, String(args.title || ""), {
            ...(typeof args.color === "string" ? { color: args.color } : {}),
            ...(typeof args.afterColumnRef === "string"
                ? { afterColumnRef: args.afterColumnRef }
                : {}),
        }, scope);
        if (result.ok) counters.boardMutations += 1;
        return formatToolResult(result);
    }

    if (name === "update_column") {
        if (counters.updateColumnCalls >= WORKSPACE_AI_MAX_UPDATE_COLUMN_CALLS) {
            return formatToolResult({
                ok: false,
                error: `Max ${WORKSPACE_AI_MAX_UPDATE_COLUMN_CALLS} update_column calls per message.`,
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        counters.updateColumnCalls += 1;
        const columnRef = String(args.columnRef || "");
        const result = await updateColumn(workspace, columnRef, {
            ...(typeof args.title === "string" ? { title: args.title } : {}),
            ...("color" in args ? { color: args.color as string | null } : {}),
        }, scope);
        if (result.ok) counters.boardMutations += 1;
        return formatToolResult(result);
    }

    if (name === "delete_tasks") {
        if (counters.deleteTaskCalls >= WORKSPACE_AI_MAX_DELETE_TASK_CALLS) {
            return formatToolResult({
                ok: false,
                error: `Max ${WORKSPACE_AI_MAX_DELETE_TASK_CALLS} delete_tasks calls per message.`,
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        counters.deleteTaskCalls += 1;
        const taskRefs = Array.isArray(args.taskRefs)
            ? args.taskRefs.filter((entry): entry is string => typeof entry === "string")
            : [];
        const result = await deleteTasks(workspace, taskRefs, scope);
        if (result.ok && result.taskRefs) {
            counters.boardMutations += result.taskRefs.length;
        }
        return formatToolResult(result);
    }

    if (name === "list_pages") {
        return formatToolResult(listWorkspacePages(workspace));
    }

    if (name === "get_page") {
        const pageId = trimString(args.pageId) || workspace.page.id;
        const page = workspace.pages.find((entry) => entry.id === pageId) || workspace.page;
        const content = page.content;
        if (content.length <= WORKSPACE_AI_READ_MAX_CHARS) {
            return JSON.stringify({
                ok: true,
                pageId: page.id,
                name: page.name,
                isActive: page.id === workspace.page.id,
                content,
            });
        }
        return JSON.stringify({
            ok: true,
            pageId: page.id,
            name: page.name,
            isActive: page.id === workspace.page.id,
            content: content.slice(0, WORKSPACE_AI_READ_MAX_CHARS),
            truncated: true,
        });
    }

    if (name === "set_page") {
        const content = String(args.content ?? "");
        const pageId = typeof args.pageId === "string" ? args.pageId : undefined;
        const result = await setWorkspacePageContent(workspace, content, { pageId });
        return formatToolResult(result);
    }

    if (name === "create_page") {
        const title = String(args.title || "");
        const content = String(args.content ?? "");
        const result = await createWorkspacePage(workspace, title, content);
        return formatToolResult(result);
    }

    if (name === "web_search") {
        return await webSearch(String(args.query || ""));
    }

    if (name === "search_tasks") {
        const query = String(args.query || "");
        const columnRef = typeof args.columnRef === "string" ? args.columnRef : undefined;
        const tag = typeof args.tag === "string" ? args.tag : undefined;
        const color = typeof args.color === "string" ? args.color : undefined;
        const hasCheckbox = typeof args.hasCheckbox === "boolean" ? args.hasCheckbox : undefined;
        const checked = typeof args.checked === "boolean" ? args.checked : undefined;
        const offset = typeof args.offset === "number" ? args.offset : 0;
        const limit = typeof args.limit === "number" ? args.limit : 20;
        return formatToolResult(
            searchBoardTasks(kanban, refs, { query, columnRef, tag, color, hasCheckbox, checked, offset, limit })
        );
    }

    return formatToolResult({ ok: false, error: `Unknown tool: ${name}` });
};

export const summarizeToolResult = (name: string, result: string) => {
    try {
        const parsed = JSON.parse(result) as { ok?: boolean; error?: string; message?: string };
        if (parsed.ok === false) {
            return parsed.error || "Failed";
        }
        if (parsed.ok === true) {
            return parsed.message || "Done";
        }
    } catch {
        // fall through
    }
    return `${name} finished`;
};
