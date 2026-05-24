import fs from "fs/promises";
import type { AiScopeHint } from "./types.js";
import {
    WORKSPACE_AI_MAX_ADD_TASKS_CALLS,
    WORKSPACE_AI_MAX_BOARD_MUTATIONS,
    WORKSPACE_AI_MAX_DELETE_TASK_CALLS,
    WORKSPACE_AI_MAX_TOOL_CALLS,
    WORKSPACE_AI_MAX_UPDATE_TASK_CALLS,
    WORKSPACE_AI_READ_MAX_CHARS,
} from "./constants.js";
import {
    addTasks,
    deleteTasks,
    findColumn,
    formatToolResult,
    listBoardColumns,
    listBoardTasks,
    resolveColumnRef,
    updateTask,
} from "./kanban-ops.js";
import type { MaterializedWorkspace } from "./sync.js";
import { recordWorkspaceMutation } from "./sync.js";
import { webSearch } from "./tools.js";

export type ToolRunCounters = {
    toolCalls: number;
    addTasksCalls: number;
    updateTaskCalls: number;
    deleteTaskCalls: number;
    boardMutations: number;
};

export const createToolRunCounters = (): ToolRunCounters => ({
    toolCalls: 0,
    addTasksCalls: 0,
    updateTaskCalls: 0,
    deleteTaskCalls: 0,
    boardMutations: 0,
});

const checkToolBudget = (counters: ToolRunCounters) => {
    if (counters.toolCalls >= WORKSPACE_AI_MAX_TOOL_CALLS) {
        return formatToolResult({
            ok: false,
            error: `Max ${WORKSPACE_AI_MAX_TOOL_CALLS} tool calls per message reached.`,
        });
    }
    return null;
};

const checkBoardMutationBudget = (workspace: MaterializedWorkspace) => {
    if (workspace.board.mutationCount >= WORKSPACE_AI_MAX_BOARD_MUTATIONS) {
        return formatToolResult({
            ok: false,
            error: `Max ${WORKSPACE_AI_MAX_BOARD_MUTATIONS} board changes per message reached.`,
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
        const titles = Array.isArray(args.titles) ? args.titles : [];
        const columnTitle = columnTitleForRef(workspace, columnRef);
        return `Adding ${titles.length} task(s) to ${columnTitle}`;
    }
    if (name === "update_task") return "Updating task";
    if (name === "delete_tasks") {
        const taskRefs = Array.isArray(args.taskRefs) ? args.taskRefs : [];
        return `Deleting ${taskRefs.length} task(s)`;
    }
    if (name === "get_page") return "Reading page";
    if (name === "set_page") return "Updating page";
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
            });
        }
        const boardBudget = checkBoardMutationBudget(workspace);
        if (boardBudget) return boardBudget;

        counters.addTasksCalls += 1;
        const titles = Array.isArray(args.titles)
            ? args.titles.filter((entry): entry is string => typeof entry === "string")
            : [];
        const columnRef = String(args.columnRef || args.columnId || "");
        const result = await addTasks(workspace, columnRef, titles, scope);
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

        counters.updateTaskCalls += 1;
        const taskRef = String(args.taskRef || args.taskId || "");
        const result = await updateTask(
            workspace,
            taskRef,
            {
                ...(typeof args.title === "string" ? { title: args.title } : {}),
                ...(typeof args.description === "string" ? { description: args.description } : {}),
            },
            scope
        );
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

    if (name === "get_page") {
        const content = workspace.page.content;
        if (content.length <= WORKSPACE_AI_READ_MAX_CHARS) {
            return JSON.stringify({ ok: true, name: workspace.page.name, content });
        }
        return JSON.stringify({
            ok: true,
            name: workspace.page.name,
            content: content.slice(0, WORKSPACE_AI_READ_MAX_CHARS),
            truncated: true,
        });
    }

    if (name === "set_page") {
        const content = String(args.content ?? "");
        const previousContent = await fs.readFile(workspace.page.filePath, "utf8");
        await fs.writeFile(workspace.page.filePath, content, "utf8");
        try {
            workspace.page.content = content;
            recordWorkspaceMutation(workspace, workspace.page.filePath);
            return JSON.stringify({ ok: true, message: "Page updated." });
        } catch (error) {
            await fs.writeFile(workspace.page.filePath, previousContent, "utf8");
            workspace.page.content = previousContent;
            return JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : "Invalid page content.",
            });
        }
    }

    if (name === "web_search") {
        return await webSearch(String(args.query || ""));
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
