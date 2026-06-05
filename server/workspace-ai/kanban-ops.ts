import fs from "fs/promises";
import { randomUUID } from "crypto";
import type { AiScopeHint, BoundTarget, KanbanData, Tag, Task } from "./types.js";
import {
    purgeTaskLinks,
    removeTaskReferenceFromMarkdown,
} from "../../src/lib/kainbu/taskLinks.js";
import { TAG_COLORS } from "../../src/lib/kainbu/constants.js";
import { formatTagsForAiContext } from "../../src/lib/kainbu/tags.js";
import {
    WORKSPACE_AI_ADD_TASKS_MAX_TITLES,
    WORKSPACE_AI_BOARD_LIST_TASKS_DEFAULT_LIMIT,
    WORKSPACE_AI_BULK_UPDATE_TASKS_MAX,
    WORKSPACE_AI_DELETE_TASKS_MAX_REFS,
    WORKSPACE_AI_UPDATE_TASK_MAX_CHARS,
} from "./constants.js";
import type { MaterializedWorkspace } from "./sync.js";
import { serializeKanbanDocument } from "./sync.js";

const DEFAULT_COLUMN_WIDTH = 268;
const DEFAULT_TAG_COLOR = "tone:blue";

const VALID_TONE_COLORS = new Set<string>(TAG_COLORS.map((entry) => entry.value));

export type TagInput = {
    label: string;
    color?: string;
};

export type RawTagInput = TagInput | string;

export type TaskUpdateFields = {
    title?: string;
    description?: string;
    color?: string | null;
    hasCheckbox?: boolean;
    checked?: boolean;
    addTags?: TagInput[];
    updateTags?: TagInput[];
    removeTags?: string[];
};

export type TaskDraft = {
    title: string;
    description?: string;
    color?: string;
    hasCheckbox?: boolean;
    checked?: boolean;
    tags?: RawTagInput[];
};

export const validateToneColor = (
    value: unknown,
    options?: { allowClear?: boolean }
): { ok: true; color?: string } | { ok: false; error: string } => {
    if (value === null || value === undefined) {
        return options?.allowClear ? { ok: true, color: undefined } : { ok: false, error: "Color is required." };
    }
    if (value === "") {
        return options?.allowClear ? { ok: true, color: undefined } : { ok: false, error: "Color is required." };
    }
    const trimmed = trimString(value);
    if (!trimmed) {
        return options?.allowClear ? { ok: true, color: undefined } : { ok: false, error: "Color is required." };
    }
    if (!VALID_TONE_COLORS.has(trimmed)) {
        return {
            ok: false,
            error: `Invalid color "${trimmed}". Use tone:red, tone:orange, tone:amber, tone:green, tone:emerald, tone:teal, tone:cyan, tone:blue, tone:indigo, tone:violet, tone:purple, tone:fuchsia, tone:pink, or tone:rose.`,
        };
    }
    return { ok: true, color: trimmed };
};

const normalizeTagLabel = (label: string) => label.trim().toLowerCase();

export const parseTagInputs = (
    value: unknown
): { ok: true; tags: TagInput[] } | { ok: false; error: string } => {
    if (value === undefined) return { ok: true, tags: [] };
    if (!Array.isArray(value)) {
        return { ok: false, error: "Tags must be an array." };
    }

    const tags: TagInput[] = [];
    for (const entry of value) {
        if (typeof entry === "string") {
            const label = trimString(entry);
            if (label) tags.push({ label });
            continue;
        }

        if (!entry || typeof entry !== "object") continue;

        const raw = entry as Record<string, unknown>;
        const label = trimString(raw.label);
        if (!label) {
            return { ok: false, error: "Each tag needs a non-empty label." };
        }

        const tag: TagInput = { label };
        if (raw.color !== undefined) {
            const colorResult = validateToneColor(raw.color);
            if (!colorResult.ok) return colorResult;
            tag.color = colorResult.color;
        }
        tags.push(tag);
    }

    return { ok: true, tags };
};

export const parseTagColorUpdates = (
    value: unknown
): { ok: true; tags: TagInput[] } | { ok: false; error: string } => {
    if (value === undefined) return { ok: true, tags: [] };
    if (!Array.isArray(value)) {
        return { ok: false, error: "updateTags must be an array." };
    }

    const tags: TagInput[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== "object") {
            return { ok: false, error: "Each updateTags entry must be an object with label and color." };
        }

        const raw = entry as Record<string, unknown>;
        const label = trimString(raw.label);
        if (!label) {
            return { ok: false, error: "Each updateTags entry needs a non-empty label." };
        }

        const colorResult = validateToneColor(raw.color);
        if (!colorResult.ok) {
            return { ok: false, error: `Tag "${label}": ${colorResult.error}` };
        }

        tags.push({ label, color: colorResult.color });
    }

    return { ok: true, tags };
};

const parseRemoveTagLabels = (
    value: unknown
): { ok: true; labels: string[] } | { ok: false; error: string } => {
    if (value === undefined) return { ok: true, labels: [] };
    if (!Array.isArray(value)) {
        return { ok: false, error: "removeTags must be an array of tag labels." };
    }

    const labels = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => trimString(entry))
        .filter(Boolean);

    return { ok: true, labels };
};

const buildTagsFromInputs = (inputs: TagInput[]): Tag[] =>
    inputs.map((input) => ({
        id: randomUUID(),
        label: input.label.trim(),
        color: input.color || DEFAULT_TAG_COLOR,
    }));

const findTagIndexByLabel = (tags: Tag[], label: string) =>
    tags.findIndex((tag) => normalizeTagLabel(tag.label) === normalizeTagLabel(label));

const applyTagChanges = (
    task: Task,
    options?: {
        addTags?: TagInput[];
        updateTags?: TagInput[];
        removeTags?: string[];
    }
): Task => {
    let tags = [...(task.tags || [])];
    const addTags = options?.addTags;
    const updateTags = options?.updateTags;
    const removeTags = options?.removeTags;

    if (removeTags?.length) {
        const removeSet = new Set(removeTags.map(normalizeTagLabel));
        tags = tags.filter((tag) => !removeSet.has(normalizeTagLabel(tag.label)));
    }

    if (updateTags?.length) {
        for (const input of updateTags) {
            const index = findTagIndexByLabel(tags, input.label);
            if (index === -1) {
                tags.push({
                    id: randomUUID(),
                    label: input.label.trim(),
                    color: input.color || DEFAULT_TAG_COLOR,
                });
                continue;
            }

            tags[index] = {
                ...tags[index],
                color: input.color || tags[index].color,
            };
        }
    }

    if (addTags?.length) {
        for (const input of addTags) {
            const index = findTagIndexByLabel(tags, input.label);
            if (index !== -1) {
                if (input.color) {
                    tags[index] = { ...tags[index], color: input.color };
                }
                continue;
            }

            tags.push({
                id: randomUUID(),
                label: input.label.trim(),
                color: input.color || DEFAULT_TAG_COLOR,
            });
        }
    }

    return { ...task, tags };
};

export const parseTaskUpdateFields = (
    raw: Record<string, unknown>
): { ok: true; fields: TaskUpdateFields } | { ok: false; error: string } => {
    const fields: TaskUpdateFields = {};

    if (typeof raw.title === "string") fields.title = raw.title;
    if (typeof raw.description === "string") fields.description = raw.description;
    if ("color" in raw) {
        if (raw.color === null || raw.color === "") {
            fields.color = null;
        } else {
            const colorResult = validateToneColor(raw.color);
            if (!colorResult.ok) return colorResult;
            fields.color = colorResult.color;
        }
    }
    if (typeof raw.hasCheckbox === "boolean") fields.hasCheckbox = raw.hasCheckbox;
    if (typeof raw.checked === "boolean") fields.checked = raw.checked;

    if ("addTags" in raw) {
        const addTagsResult = parseTagInputs(raw.addTags);
        if (!addTagsResult.ok) return addTagsResult;
        if (addTagsResult.tags.length) fields.addTags = addTagsResult.tags;
    }

    if ("updateTags" in raw) {
        const updateTagsResult = parseTagColorUpdates(raw.updateTags);
        if (!updateTagsResult.ok) return updateTagsResult;
        if (updateTagsResult.tags.length) fields.updateTags = updateTagsResult.tags;
    }

    if ("removeTags" in raw) {
        const removeTagsResult = parseRemoveTagLabels(raw.removeTags);
        if (!removeTagsResult.ok) return removeTagsResult;
        if (removeTagsResult.labels.length) fields.removeTags = removeTagsResult.labels;
    }

    if (
        fields.title === undefined &&
        fields.description === undefined &&
        fields.color === undefined &&
        fields.hasCheckbox === undefined &&
        fields.checked === undefined &&
        fields.addTags === undefined &&
        fields.updateTags === undefined &&
        fields.removeTags === undefined
    ) {
        return { ok: false, error: "Provide at least one field to update." };
    }

    return { ok: true, fields };
};

export const normalizeTaskUpdateFields = (
    fields: TaskUpdateFields & { addTags?: RawTagInput[] }
): { ok: true; fields: TaskUpdateFields } | { ok: false; error: string } => {
    const next: TaskUpdateFields = { ...fields };

    if (fields.addTags !== undefined) {
        const addTagsResult = parseTagInputs(fields.addTags);
        if (!addTagsResult.ok) return addTagsResult;
        next.addTags = addTagsResult.tags.length ? addTagsResult.tags : undefined;
    }

    if (fields.updateTags !== undefined) {
        const updateTagsResult = parseTagColorUpdates(fields.updateTags);
        if (!updateTagsResult.ok) return updateTagsResult;
        next.updateTags = updateTagsResult.tags.length ? updateTagsResult.tags : undefined;
    }

    if (fields.removeTags !== undefined) {
        const removeTagsResult = parseRemoveTagLabels(fields.removeTags);
        if (!removeTagsResult.ok) return removeTagsResult;
        next.removeTags = removeTagsResult.labels.length ? removeTagsResult.labels : undefined;
    }

    return { ok: true, fields: next };
};

const applyTaskUpdateFields = (task: Task, fields: TaskUpdateFields): Task => {
    let next: Task = { ...task };

    if (fields.title !== undefined) next.title = trimString(fields.title);
    if (fields.description !== undefined) next.description = String(fields.description);

    if (fields.color !== undefined) {
        if (fields.color === null) {
            const { color: _removed, ...withoutColor } = next;
            next = withoutColor as Task;
        } else {
            next = { ...next, color: fields.color };
        }
    }

    if (fields.hasCheckbox !== undefined) {
        if (fields.hasCheckbox) {
            next = { ...next, hasCheckbox: true };
        } else {
            const { hasCheckbox: _hc, checked: _c, ...withoutCheckbox } = next;
            next = withoutCheckbox as Task;
        }
    }

    if (fields.checked !== undefined) {
        if (fields.checked) {
            next = { ...next, hasCheckbox: true, checked: true };
        } else {
            const { checked: _c, ...withoutChecked } = next;
            next = withoutChecked as Task;
        }
    }

    if (
        fields.addTags !== undefined ||
        fields.updateTags !== undefined ||
        fields.removeTags !== undefined
    ) {
        next = applyTagChanges(next, {
            addTags: fields.addTags,
            updateTags: fields.updateTags,
            removeTags: fields.removeTags,
        });
    }

    return next;
};

export type ToolResultPayload =
    | {
          ok: true;
          taskIds?: string[];
          taskRefs?: string[];
          message?: string;
          columnRef?: string;
          columns?: Array<{
              ref: string;
              title: string;
              taskCount: number;
              color?: string;
          }>;
          tasks?: Array<{
              ref: string;
              title: string;
              description?: string;
              color?: string;
              hasCheckbox?: boolean;
              checked?: boolean;
              tags?: Array<{ label: string; color: string }>;
          }>;
          updatedCount?: number;
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
            const tagSuffix = task.tags?.length
                ? ` [${formatTagsForAiContext(task.tags)}]`
                : "";
            lines.push(`  ${taskRef}  ${task.title}${tagSuffix}`);
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
        ...(column.color ? { color: column.color } : {}),
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
            ...(task.color ? { color: task.color } : {}),
            ...(task.hasCheckbox ? { hasCheckbox: true } : {}),
            ...(task.checked ? { checked: true } : {}),
            ...(task.tags?.length
                ? {
                      tags: task.tags.map((tag) => ({
                          label: tag.label,
                          color: tag.color,
                      })),
                  }
                : {}),
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

export const parseTaskDraftsFromArgs = (
    args: Record<string, unknown>
): { ok: true; drafts?: TaskDraft[] } | { ok: false; error: string } => {
    if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
        return { ok: true, drafts: undefined };
    }

    const drafts: TaskDraft[] = [];
    for (const entry of args.tasks) {
        if (!entry || typeof entry !== "object") continue;
        const raw = entry as Record<string, unknown>;
        const title = trimString(raw.title);
        if (!title) return { ok: false, error: "Each task in tasks[] needs a non-empty title." };

        const draft: TaskDraft = { title };
        if (typeof raw.description === "string") draft.description = raw.description;
        if (raw.color !== undefined) {
            const colorResult = validateToneColor(raw.color);
            if (!colorResult.ok) return colorResult;
            draft.color = colorResult.color;
        }
        if (typeof raw.hasCheckbox === "boolean") draft.hasCheckbox = raw.hasCheckbox;
        if (typeof raw.checked === "boolean") draft.checked = raw.checked;
        if (raw.tags !== undefined) {
            const tagsResult = parseTagInputs(raw.tags);
            if (!tagsResult.ok) return tagsResult;
            if (tagsResult.tags.length) draft.tags = tagsResult.tags;
        }
        drafts.push(draft);
    }

    if (!drafts.length) {
        return { ok: false, error: "tasks array must contain at least one valid entry." };
    }

    return { ok: true, drafts };
};

const buildTaskFromDraft = (draft: TaskDraft, id: string): Task | { error: string } => {
    const title = trimString(draft.title);
    if (!title) return { error: "Each task needs a non-empty title." };

    if (draft.color !== undefined) {
        const colorResult = validateToneColor(draft.color);
        if (!colorResult.ok) return { error: colorResult.error };
    }

    const task: Task = {
        id,
        title,
        description: typeof draft.description === "string" ? draft.description : "",
        tags: [],
    };

    if (draft.color) task.color = draft.color;
    if (draft.hasCheckbox) task.hasCheckbox = true;
    if (draft.checked) {
        task.hasCheckbox = true;
        task.checked = true;
    }

    if (draft.tags?.length) {
        const tagsResult = parseTagInputs(draft.tags);
        if (!tagsResult.ok) return { error: tagsResult.error };
        task.tags = buildTagsFromInputs(tagsResult.tags);
    }

    return task;
};

export const addTasks = async (
    workspace: MaterializedWorkspace,
    columnRef: string,
    titles: string[],
    scope?: AiScopeHint,
    drafts?: TaskDraft[]
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

    const useDrafts = drafts && drafts.length > 0;
    const itemCount = useDrafts ? drafts.length : titles.length;

    if (itemCount > WORKSPACE_AI_ADD_TASKS_MAX_TITLES) {
        return {
            ok: false,
            error: `Max ${WORKSPACE_AI_ADD_TASKS_MAX_TITLES} tasks per add_tasks call.`,
            hint: "Call add_tasks again in the next tool round to add more tasks.",
        };
    }

    const newTaskIds: string[] = [];
    const newTaskRefs: string[] = [];
    let nextTaskNum = refs.taskRefToId.size;
    const builtTasks: Task[] = [];

    if (useDrafts) {
        for (const draft of drafts!.slice(0, WORKSPACE_AI_ADD_TASKS_MAX_TITLES)) {
            const id = randomUUID();
            const built = buildTaskFromDraft(draft, id);
            if ("error" in built) return { ok: false, error: built.error };
            builtTasks.push(built);
        }
    } else {
        const normalizedTitles = titles
            .map((title) => trimString(title))
            .filter(Boolean)
            .slice(0, WORKSPACE_AI_ADD_TASKS_MAX_TITLES);

        if (!normalizedTitles.length) {
            return { ok: false, error: "Provide at least one non-empty task title or tasks array." };
        }

        for (const title of normalizedTitles) {
            builtTasks.push({
                id: randomUUID(),
                title,
                description: "",
                tags: [],
            });
        }
    }

    if (!builtTasks.length) {
        return { ok: false, error: "Provide at least one non-empty task title or tasks array." };
    }

    for (const task of builtTasks) {
        newTaskIds.push(task.id);
        nextTaskNum += 1;
        const taskRef = `T${nextTaskNum}`;
        newTaskRefs.push(taskRef);
        refs.taskRefToId.set(taskRef, task.id);
        refs.taskIdToRef.set(task.id, taskRef);
    }

    const nextKanban = kanban.map((entry) => {
        if (entry.id !== columnId) return entry;
        return {
            ...entry,
            tasks: [...entry.tasks, ...builtTasks],
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
    fields: TaskUpdateFields & { addTags?: RawTagInput[] },
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

    if (fields.color !== undefined && fields.color !== null) {
        const colorResult = validateToneColor(fields.color);
        if (!colorResult.ok) return colorResult;
        fields = { ...fields, color: colorResult.color };
    }

    const normalizedFields = normalizeTaskUpdateFields(fields);
    if (!normalizedFields.ok) return { ok: false, error: normalizedFields.error };

    const updatedTask = applyTaskUpdateFields(located.task, normalizedFields.fields);

    if (!updatedTask.title) {
        return { ok: false, error: "Task title cannot be empty." };
    }

    const combinedLength =
        updatedTask.title.length + (updatedTask.description || "").length;
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
                task.id === taskId ? updatedTask : task
            ),
        };
    });

    workspace.board.mutationCount += 1;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    return { ok: true, message: `Updated task "${updatedTask.title}".` };
};

export const bulkUpdateTasks = async (
    workspace: MaterializedWorkspace,
    updates: Array<{ taskRef: string } & TaskUpdateFields>,
    scope?: AiScopeHint
): Promise<ToolResultPayload> => {
    const refs = workspace.boardRefs;
    const kanban = workspace.board.kanbanData;

    if (!updates.length) {
        return { ok: false, error: "Provide at least one update entry." };
    }

    if (updates.length > WORKSPACE_AI_BULK_UPDATE_TASKS_MAX) {
        return {
            ok: false,
            error: `Max ${WORKSPACE_AI_BULK_UPDATE_TASKS_MAX} updates per bulk_update_tasks call.`,
            hint: "Call bulk_update_tasks again in the next tool round for remaining tasks.",
        };
    }

    const resolved: Array<{
        taskRef: string;
        taskId: string;
        columnId: string;
        fields: TaskUpdateFields;
        title: string;
    }> = [];
    const unknownRefs: string[] = [];
    const fieldErrors: string[] = [];

    for (const entry of updates) {
        const taskRef = trimString(entry.taskRef);
        if (!taskRef) continue;

        const parsed = parseTaskUpdateFields(entry as Record<string, unknown>);
        if (!parsed.ok) {
            fieldErrors.push(`${taskRef}: ${parsed.error}`);
            continue;
        }

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
            columnId: located.column.id,
            fields: parsed.fields,
            title: located.task.title,
        });
    }

    if (fieldErrors.length && !resolved.length) {
        return { ok: false, error: fieldErrors.join("; ") };
    }

    if (!resolved.length) {
        return {
            ok: false,
            error: "No matching tasks found for the given updates.",
            taskRefs: [...refs.taskRefToId.keys()].slice(0, 50),
            ...(unknownRefs.length ? { hint: `Unknown refs: ${unknownRefs.join(", ")}` } : {}),
        };
    }

    let nextKanban = kanban;
    const updatedRefs: string[] = [];

    for (const entry of resolved) {
        if (entry.fields.color !== undefined && entry.fields.color !== null) {
            const colorResult = validateToneColor(entry.fields.color);
            if (!colorResult.ok) {
                fieldErrors.push(`${entry.taskRef}: ${colorResult.error}`);
                continue;
            }
            entry.fields = { ...entry.fields, color: colorResult.color };
        }

        const located = findTask(nextKanban, entry.taskId);
        if (!located) continue;

        const updatedTask = applyTaskUpdateFields(located.task, entry.fields);
        if (!updatedTask.title) {
            fieldErrors.push(`${entry.taskRef}: Task title cannot be empty.`);
            continue;
        }

        const combinedLength =
            updatedTask.title.length + (updatedTask.description || "").length;
        if (combinedLength > WORKSPACE_AI_UPDATE_TASK_MAX_CHARS) {
            fieldErrors.push(
                `${entry.taskRef}: Title and description combined must be under ${WORKSPACE_AI_UPDATE_TASK_MAX_CHARS} characters.`
            );
            continue;
        }

        nextKanban = nextKanban.map((column) => {
            if (column.id !== entry.columnId) return column;
            return {
                ...column,
                tasks: column.tasks.map((task) =>
                    task.id === entry.taskId ? updatedTask : task
                ),
            };
        });
        updatedRefs.push(entry.taskRef);
    }

    if (!updatedRefs.length) {
        return {
            ok: false,
            error: fieldErrors.join("; ") || "No tasks were updated.",
        };
    }

    workspace.board.mutationCount += updatedRefs.length;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    const hints: string[] = [];
    if (unknownRefs.length) hints.push(`Skipped unknown refs: ${unknownRefs.join(", ")}`);
    if (fieldErrors.length) hints.push(fieldErrors.join("; "));

    return {
        ok: true,
        taskRefs: updatedRefs,
        updatedCount: updatedRefs.length,
        message: `Updated ${updatedRefs.length} task(s).`,
        ...(hints.length ? { hint: hints.join(" ") } : {}),
    };
};

export const addColumn = async (
    workspace: MaterializedWorkspace,
    title: string,
    options?: { color?: string; afterColumnRef?: string },
    scope?: AiScopeHint
): Promise<ToolResultPayload> => {
    const refs = workspace.boardRefs;
    const kanban = workspace.board.kanbanData;
    const nextTitle = trimString(title);

    if (!nextTitle) {
        return { ok: false, error: "Column title cannot be empty." };
    }

    let columnColor: string | undefined;
    if (options?.color !== undefined) {
        const colorResult = validateToneColor(options.color);
        if (!colorResult.ok) return colorResult;
        columnColor = colorResult.color;
    }

    const newColumnId = randomUUID();
    const newColumn = {
        id: newColumnId,
        title: nextTitle,
        width: DEFAULT_COLUMN_WIDTH,
        tasks: [] as Task[],
        ...(columnColor ? { color: columnColor } : {}),
    };

    let insertIndex = kanban.length;
    if (options?.afterColumnRef) {
        const afterId = resolveColumnRef(refs, options.afterColumnRef);
        if (!afterId) {
            return {
                ok: false,
                error: `Unknown column ref "${options.afterColumnRef}".`,
                columnRefs: [...refs.columnRefToId.keys()],
            };
        }
        const afterIndex = kanban.findIndex((column) => column.id === afterId);
        if (afterIndex !== -1) insertIndex = afterIndex + 1;
    }

    const bound = scope?.boundTarget;
    if (bound?.locked && bound.kind === "task") {
        return {
            ok: false,
            error: "Cannot add columns while scoped to a single task.",
            hint: "Ask the user to widen scope for board structure changes.",
        };
    }

    const nextKanban = [...kanban];
    nextKanban.splice(insertIndex, 0, newColumn);

    workspace.board.mutationCount += 1;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    const columnRef = workspace.boardRefs.columnIdToRef.get(newColumnId) || newColumnId;

    return {
        ok: true,
        columnRef,
        message: `Added column "${nextTitle}".`,
    };
};

export const updateColumn = async (
    workspace: MaterializedWorkspace,
    columnRef: string,
    fields: { title?: string; color?: string | null },
    scope?: AiScopeHint
): Promise<ToolResultPayload> => {
    const refs = workspace.boardRefs;
    const kanban = workspace.board.kanbanData;
    const columnId = resolveColumnRef(refs, columnRef);

    if (!columnId) {
        return {
            ok: false,
            error: `Unknown column ref "${columnRef}".`,
            columnRefs: [...refs.columnRefToId.keys()],
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

    if (fields.title === undefined && fields.color === undefined) {
        return { ok: false, error: "Provide at least one field to update (title or color)." };
    }

    const nextTitle = fields.title !== undefined ? trimString(fields.title) : column.title;
    if (!nextTitle) {
        return { ok: false, error: "Column title cannot be empty." };
    }

    let nextColor: string | undefined | null = column.color;
    if (fields.color !== undefined) {
        if (fields.color === null || fields.color === "") {
            nextColor = null;
        } else {
            const colorResult = validateToneColor(fields.color);
            if (!colorResult.ok) return colorResult;
            nextColor = colorResult.color;
        }
    }

    const nextKanban = kanban.map((entry) => {
        if (entry.id !== columnId) return entry;
        const updated = { ...entry, title: nextTitle };
        if (nextColor === null) {
            const { color: _c, ...withoutColor } = updated;
            return withoutColor;
        }
        if (nextColor) {
            return { ...updated, color: nextColor };
        }
        return updated;
    });

    workspace.board.mutationCount += 1;
    await persistBoardKanbanData(workspace, nextKanban);
    refreshBoardRefs(workspace);
    workspace.board.editCallCount += 1;

    return { ok: true, message: `Updated column "${nextTitle}".` };
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
            hint: "Call delete_tasks again in the next tool round for remaining tasks.",
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
