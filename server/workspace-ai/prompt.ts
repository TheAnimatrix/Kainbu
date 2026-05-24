import type { AiScopeHint } from "./types.js";
import {
    WORKSPACE_AI_ADD_TASKS_MAX_TITLES,
    WORKSPACE_AI_MAX_BOARD_MUTATIONS,
    WORKSPACE_AI_MAX_MODEL_TURNS,
    WORKSPACE_AI_MAX_MODEL_TURNS_LARGE_BOARD,
    WORKSPACE_AI_MAX_TOOL_CALLS,
} from "./constants.js";
import { findColumn, findTask } from "./kanban-ops.js";
import type { KanbanData } from "./types.js";

/** Stable prefix for OpenRouter prompt caching — do not add per-request data here. */
export const buildStaticSystemPrompt = (maxModelTurns = WORKSPACE_AI_MAX_MODEL_TURNS) =>
    [
        `You are Kainbu AI, an assistant for this workspace.`,
        `You help users manage their boards (columns and tasks) and pages (notes).`,
        ``,
        `## Tools`,
        `- board_list_columns / board_list_tasks: Inspect the board (required on large boards).`,
        `- add_tasks: Create tasks in a column (max ${WORKSPACE_AI_ADD_TASKS_MAX_TITLES} titles per call). Use columnRef.`,
        `- update_task: Change one task's title or description. Use taskRef.`,
        `- delete_tasks: Remove tasks by taskRef (from board index or board_list_tasks).`,
        `- get_page / set_page: Read or replace the current page.`,
        `- web_search: External information only when needed.`,
        ``,
        `## Limits (per user message)`,
        `- Max ${WORKSPACE_AI_MAX_TOOL_CALLS} tool calls.`,
        `- Max ${WORKSPACE_AI_MAX_BOARD_MUTATIONS} board task changes (adds, updates, deletes).`,
        `- Up to ${maxModelTurns} tool rounds — prefer one board tool call, then reply in text.`,
        ``,
        `## Guidelines`,
        `- Internal refs (C1, T1, etc.) are for tools only. Never show refs or UUIDs to the user.`,
        `- In user-facing text, use task titles and column names only.`,
        `- Never invent columnRef or taskRef values — use the board index or list tools.`,
        `- Prefer one board mutation call (add_tasks, update_task, or delete_tasks), then answer the user.`,
        `- Do not call tools again unless the previous tool returned ok: false.`,
        `- Be concise. Never mention file names, paths, or extensions to the user.`,
    ].join("\n");

const formatBoundTarget = (scope: AiScopeHint, kanban: KanbanData) => {
    const bound = scope.boundTarget;
    if (!bound?.locked || !bound.id) return "";

    if (bound.kind === "task") {
        const located = findTask(kanban, bound.id);
        const title = located?.task.title || scope.queuedTaskCards?.find((c) => c.taskId === bound.id)?.title;
        const columnTitle = located?.column.title;
        if (title && columnTitle) {
            return `Only change the task "${title}" in column "${columnTitle}" unless the user explicitly asks for broader board edits.`;
        }
        if (title) {
            return `Only change the task "${title}" unless the user explicitly asks for broader board edits.`;
        }
    }

    if (bound.kind === "column") {
        const column = findColumn(kanban, bound.id);
        if (column) {
            return `Only change column "${column.title}" unless the user explicitly asks for broader board edits.`;
        }
    }

    return "";
};

export const buildVariableSystemContext = (
    scope: AiScopeHint | undefined,
    options: {
        boardIndexText?: string;
        kanbanFullAllowed: boolean;
        kanban: KanbanData;
    }
) => {
    const sections: string[] = [];

    if (options.kanbanFullAllowed && options.boardIndexText) {
        sections.push(`## Board index (internal refs for tools)\n${options.boardIndexText}`);
    } else if (!options.kanbanFullAllowed) {
        sections.push(
            `## Board
This board is large. Call board_list_columns, then board_list_tasks for relevant columns, before add_tasks or update_task.`
        );
    }

    if (scope?.boundTarget?.locked) {
        const targetLine = formatBoundTarget(scope, options.kanban);
        if (targetLine) {
            sections.push(`## Target\n${targetLine}`);
        }
    }

    if (scope?.queuedTaskCards?.length) {
        const lines = scope.queuedTaskCards.map(
            (card) => `- ${card.title} (column: ${card.columnTitle})`
        );
        sections.push(`## Referenced tasks\n${lines.join("\n")}`);
    }

    if (scope?.activeViewContent && scope.activeViewContent.kind !== "none") {
        const { kind, name, content } = scope.activeViewContent;
        const label = kind === "board" ? "board" : "page";
        sections.push(`## Current view
The user is on the ${scope.currentTab} tab, viewing ${label} "${name}":
${content}`);
    } else if (scope) {
        sections.push(`## Current view
The user is on the ${scope.currentTab} tab.`);
    }

    if (scope?.workspaceSummary) {
        const s = scope.workspaceSummary;
        sections.push(
            `## Workspace overview
${s.columnCount} columns, ${s.taskCount} tasks, ${s.padCount} pages, ${s.memberCount} member(s).`
        );
    }

    return sections.join("\n\n");
};

/** @deprecated Use buildStaticSystemPrompt + buildVariableSystemContext */
export const buildSystemPrompt = (scope?: AiScopeHint, boardIndex?: string) => {
    const kanbanFullAllowed = scope?.workspaceSummary?.kanbanFullAllowed ?? true;
    return [
        buildStaticSystemPrompt(
            kanbanFullAllowed ? WORKSPACE_AI_MAX_MODEL_TURNS : WORKSPACE_AI_MAX_MODEL_TURNS_LARGE_BOARD
        ),
        buildVariableSystemContext(scope, {
            boardIndexText: boardIndex,
            kanbanFullAllowed,
            kanban: [],
        }),
    ]
        .filter(Boolean)
        .join("\n\n");
};

export const buildQueuedTaskCardsContext = (scope?: AiScopeHint) => {
    const cards = scope?.queuedTaskCards || [];
    if (!cards.length) return "";

    const lines = cards.map((card) => `- ${card.title} (column: ${card.columnTitle})`);
    return `The user attached these task cards:\n${lines.join("\n")}`;
};

export const resolveMaxModelTurns = (kanbanFullAllowed: boolean) =>
    kanbanFullAllowed ? WORKSPACE_AI_MAX_MODEL_TURNS : WORKSPACE_AI_MAX_MODEL_TURNS_LARGE_BOARD;
