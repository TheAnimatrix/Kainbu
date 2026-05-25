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

const TONE_COLORS_DOC =
    "tone:red, tone:orange, tone:amber, tone:green, tone:emerald, tone:teal, tone:cyan, tone:blue, tone:indigo, tone:violet, tone:purple, tone:fuchsia, tone:pink, tone:rose";

/** Stable prefix for OpenRouter prompt caching — do not add per-request data here. */
export const buildStaticSystemPrompt = (maxModelTurns = WORKSPACE_AI_MAX_MODEL_TURNS) =>
    [
        `You are Kainbu AI, an assistant for this workspace.`,
        `You help users manage their boards (columns and tasks) and pages (notes).`,
        ``,
        `## Tools`,
        `- board_list_columns / board_list_tasks: Inspect the board (required on large boards). List results include color and checkbox state.`,
        `- add_tasks: Create tasks in a column (max ${WORKSPACE_AI_ADD_TASKS_MAX_TITLES} per call). Use titles[] or tasks[] with optional description, color, hasCheckbox, checked.`,
        `- update_task: Change one task (title, description, color, hasCheckbox, checked). Use taskRef.`,
        `- bulk_update_tasks: Update up to 10 tasks at once (same fields as update_task).`,
        `- add_column / update_column: Add or rename columns and set column color.`,
        `- delete_tasks: Remove tasks by taskRef.`,
        `- list_pages / get_page: List or read notes (pages).`,
        `- set_page: Replace the page the user is viewing (or pageId if given).`,
        `- create_page: Add a new note with title and content — use unless the user asked to edit the current page.`,
        `- web_search: External information only when needed.`,
        ``,
        `## Card and column colors`,
        `Valid color values: ${TONE_COLORS_DOC}. Pass null to clear a color.`,
        ``,
        `## Limits (per user message)`,
        `- Max ${WORKSPACE_AI_MAX_TOOL_CALLS} tool calls.`,
        `- Max ${WORKSPACE_AI_MAX_BOARD_MUTATIONS} board changes (adds, updates, deletes, columns).`,
        `- Up to ${maxModelTurns} tool rounds — use multiple rounds when needed.`,
        ``,
        `## Guidelines`,
        `- Internal refs (C1, T1, etc.) are for tools only. Never show refs or UUIDs to the user.`,
        `- In user-facing text, use task titles and column names only.`,
        `- Never invent columnRef or taskRef values — use the board index or list tools.`,
        `- For large batches (many tasks): call add_tasks or bulk_update_tasks repeatedly across tool rounds until done or limits hit. Do not ask the user to send another message to continue the same request.`,
        `- When a tool returns ok: false with a hint about limits, split work and continue in the next tool round in this same message.`,
        `- When board_list_tasks returns hasMore: true, paginate with offset before bulk edits.`,
        `- Be concise. Never mention file names, paths, or extensions to the user.`,
        `- When the user attaches images, read them and use visible text (e.g. checklist items) for board or page edits.`,
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
