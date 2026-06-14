import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import type {
    AiKanbanProposal,
    AiProposal,
    AiProposalSafety,
    AiScopeHint,
    AiScratchpadProposal,
    KanbanData,
    KanbanPatchOperation,
    ProjectBoardRow,
    ProjectColumnRow,
    ProjectPageRow,
    ProjectRow,
    ProjectTaskRow,
    ScratchpadData,
    ScratchpadPatchOperation,
    Tag,
    Task,
} from "./types.js";
import { createAdminPb, resolveAuthenticatedUserId } from "../pocketbase.js";
import { getProjectPbId, pbEscapeFilter, projectClientFilter, projectRelationFilter } from "../pbWorkspace.js";
import { areKanbanTasksEqualForDiff } from "../../src/lib/kainbu/diff.js";
import type { BoardRefMap } from "./kanban-ops.js";

const CURRENT_BOARD_FILE = "current-board.json";
const CURRENT_PAGE_FILE = "current-page.md";
const DEFAULT_COLUMN_WIDTH = 268;
const DEFAULT_TAG_COLOR = "tone:blue";

type MaterializedBoard = {
    id: string;
    name: string;
    kanbanData: KanbanData;
    filePath: string;
    originalContent: string;
    baseRevision: number;
    baseFingerprint: string;
    editCallCount: number;
    mutationCount: number;
};

type MaterializedPage = {
    id: string;
    name: string;
    content: string;
    filePath: string;
    originalContent: string;
    baseRevision: number;
    baseFingerprint: string;
    editCallCount: number;
    position: number;
};

export type MaterializedWorkspace = {
    tempDir: string;
    projectId: string;
    board: MaterializedBoard;
    page: MaterializedPage;
    pages: MaterializedPage[];
    pagesBaseFingerprint: string;
    boardRefs: BoardRefMap;
};

const PAGE_CONTENT_MAX_CHARS = 500_000;

export const sanitizePageContent = (value: unknown) => {
    if (typeof value !== "string") return "";
    return value.replace(/\0/g, "").slice(0, PAGE_CONTENT_MAX_CHARS);
};

const PAGE_TEMPLATE_MARKERS = ["## Notes", "- Add context", "- Link tasks with @", "- Use / for blocks"];

export const stripEditorTemplateFromContent = (content: string) => {
    const normalized = sanitizePageContent(content).replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (trimmed === "## Notes") return false;
        if (trimmed === "- Add context") return false;
        if (trimmed === "- Link tasks with @") return false;
        if (trimmed === "- Use / for blocks") return false;
        return true;
    });
    return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const getPagesFingerprint = (pages: Array<{ id: string; name: string; content: string }>) =>
    JSON.stringify(
        [...pages]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((page) => ({
                id: page.id,
                name: page.name,
                content: page.content,
            }))
    );

const materializedPageFilePath = (tempDir: string, pageId: string) =>
    path.join(tempDir, "pages", `${pageId}.md`);

const writeMaterializedPageFile = async (workspace: MaterializedWorkspace, page: MaterializedPage) => {
    const content = sanitizePageContent(page.content);
    await fs.mkdir(path.dirname(page.filePath), { recursive: true });
    await fs.writeFile(page.filePath, content, "utf8");
    page.content = content;
};

const readMaterializedPages = async (workspace: MaterializedWorkspace) => {
    const pages: MaterializedPage[] = [];
    for (const page of workspace.pages) {
        const content = sanitizePageContent(await fs.readFile(page.filePath, "utf8"));
        pages.push({ ...page, content });
    }
    return pages;
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const trimString = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

const normalizeOptionalString = (value: unknown) => {
    const trimmed = trimString(value);
    return trimmed || undefined;
};

const normalizeTag = (value: unknown, seenTagIds: Set<string>): Tag | null => {
    if (!value || typeof value !== "object") return null;

    const raw = value as Record<string, unknown>;
    const label = trimString(raw.label) || "Tag";
    const rawId = trimString(raw.id);
    const id = rawId && !seenTagIds.has(rawId) ? rawId : randomUUID();
    seenTagIds.add(id);

    return {
        id,
        label,
        color: normalizeOptionalString(raw.color) || DEFAULT_TAG_COLOR,
    };
};

const normalizeTask = (value: unknown, index: number, seenTaskIds: Set<string>): Task | null => {
    if (!value || typeof value !== "object") return null;

    const raw = value as Record<string, unknown>;
    const rawId = trimString(raw.id);
    const id = rawId && !seenTaskIds.has(rawId) ? rawId : randomUUID();
    seenTaskIds.add(id);

    const seenTagIds = new Set<string>();
    const tags = Array.isArray(raw.tags)
        ? raw.tags.flatMap((entry) => {
            const tag = normalizeTag(entry, seenTagIds);
            return tag ? [tag] : [];
        })
        : [];

    return {
        id,
        title: trimString(raw.title) || `Task ${index + 1}`,
        description: typeof raw.description === "string" ? raw.description : "",
        ...(normalizeOptionalString(raw.color) ? { color: normalizeOptionalString(raw.color)! } : {}),
        tags,
        ...(typeof raw.hasCheckbox === "boolean" ? { hasCheckbox: raw.hasCheckbox } : {}),
        ...(typeof raw.checked === "boolean" ? { checked: raw.checked } : {}),
        ...(isFiniteNumber(raw.completedAt) ? { completedAt: raw.completedAt } : {}),
        ...(isFiniteNumber(raw.countdownAt) ? { countdownAt: raw.countdownAt } : {}),
        ...(isFiniteNumber(raw.alarmAt) ? { alarmAt: raw.alarmAt } : {}),
        ...(normalizeOptionalString(raw.assignedTo)
            ? { assignedTo: normalizeOptionalString(raw.assignedTo)! }
            : {}),
        ...(isFiniteNumber(raw.createdAt) ? { createdAt: raw.createdAt } : {}),
        ...(isFiniteNumber(raw.updatedAt) ? { updatedAt: raw.updatedAt } : {}),
    };
};

const normalizeKanbanData = (value: unknown): KanbanData => {
    if (!Array.isArray(value)) {
        throw new Error("Board files must contain a JSON array of columns.");
    }

    const seenColumnIds = new Set<string>();
    const seenTaskIds = new Set<string>();

    return value.flatMap((columnValue, columnIndex) => {
        if (!columnValue || typeof columnValue !== "object") return [];

        const raw = columnValue as Record<string, unknown>;
        const rawId = trimString(raw.id);
        const id = rawId && !seenColumnIds.has(rawId) ? rawId : randomUUID();
        seenColumnIds.add(id);

        const tasks = Array.isArray(raw.tasks)
            ? raw.tasks.flatMap((taskValue, taskIndex) => {
                const task = normalizeTask(taskValue, taskIndex, seenTaskIds);
                return task ? [task] : [];
            })
            : [];

        return [
            {
                id,
                title: trimString(raw.title) || `Column ${columnIndex + 1}`,
                ...(normalizeOptionalString(raw.color)
                    ? { color: normalizeOptionalString(raw.color)! }
                    : {}),
                width: isFiniteNumber(raw.width) ? Math.round(raw.width) : DEFAULT_COLUMN_WIDTH,
                tasks,
            }
        ];
    });
};

export const serializeKanbanDocument = (kanbanData: KanbanData) =>
    `${JSON.stringify(kanbanData, null, 2)}\n`;

const parseKanbanDocument = (content: string) => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Board files must stay valid JSON. ${error instanceof Error ? error.message : "Unable to parse JSON."}`
        );
    }

    return normalizeKanbanData(parsed);
};

const canonicalizeKanbanData = (kanbanData: KanbanData) =>
    kanbanData.map((column) => ({
        id: column.id,
        title: column.title,
        color: column.color || null,
        width: column.width ?? DEFAULT_COLUMN_WIDTH,
        tasks: (column.tasks || []).map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description || "",
            color: task.color || null,
            tags: (task.tags || []).map((tag) => ({
                id: tag.id,
                label: tag.label,
                color: tag.color || null,
            })),
            hasCheckbox: Boolean(task.hasCheckbox),
            checked: Boolean(task.checked),
            completedAt: task.completedAt ?? null,
            countdownAt: task.countdownAt ?? null,
            alarmAt: task.alarmAt ?? null,
            assignedTo: task.assignedTo || null,
        })),
    }));

const getKanbanFingerprint = (kanbanData: KanbanData) => JSON.stringify(canonicalizeKanbanData(kanbanData));

export const buildScratchpadPreviewState = (
    pageId: string,
    pageName: string,
    content: string
): ScratchpadData => ({
    activePadId: pageId,
    pads: [
        {
            id: pageId,
            name: pageName,
            content,
        }
    ]
});

const getScratchpadFingerprint = (scratchpadData: ScratchpadData) =>
    JSON.stringify({
        activePadId: scratchpadData.activePadId,
        pads: scratchpadData.pads.map((pad) => ({
            id: pad.id,
            name: pad.name,
            content: pad.content,
        })),
    });

const mapTaskRow = (row: ProjectTaskRow): Task => ({
    id: row.id,
    title: row.title,
    description: row.description,
    ...(row.color ? { color: row.color } : {}),
    tags: Array.isArray(row.tags)
        ? row.tags.flatMap((tag) =>
            tag && typeof tag === "object" && typeof tag.id === "string" && typeof tag.label === "string"
                ? [
                    {
                        id: tag.id,
                        label: tag.label,
                        color:
                            typeof tag.color === "string" && tag.color.trim()
                                ? tag.color
                                : DEFAULT_TAG_COLOR,
                    }
                ]
                : []
        )
        : [],
    hasCheckbox: row.has_checkbox,
    checked: row.checked,
    ...(row.completed_at != null ? { completedAt: row.completed_at } : {}),
    ...(row.countdown_at != null ? { countdownAt: row.countdown_at } : {}),
    ...(row.alarm_at != null ? { alarmAt: row.alarm_at } : {}),
    ...(row.assigned_to ? { assignedTo: row.assigned_to } : {}),
    ...(Array.isArray(row.linked_task_ids) && row.linked_task_ids.length
        ? {
              linkedTaskIds: row.linked_task_ids.filter(
                  (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
              ),
          }
        : {}),
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
});

const buildKanbanData = (columns: ProjectColumnRow[], tasks: ProjectTaskRow[]) => {
    const tasksByColumn = new Map<string, Task[]>();

    for (const row of [...tasks].sort((left, right) => left.position - right.position)) {
        const current = tasksByColumn.get(row.column_id) || [];
        current.push(mapTaskRow(row));
        tasksByColumn.set(row.column_id, current);
    }

    return [...columns]
        .sort((left, right) => left.position - right.position)
        .map((row) => ({
            id: row.id,
            title: row.title,
            ...(row.color ? { color: row.color } : {}),
            width: row.width || DEFAULT_COLUMN_WIDTH,
            tasks: tasksByColumn.get(row.id) || [],
        }));
};

const mapBoardRow = (
    row: ProjectBoardRow,
    columns: ProjectColumnRow[],
    tasks: ProjectTaskRow[]
) => ({
    id: row.id,
    name: row.name,
    kanbanData: buildKanbanData(columns, tasks),
});

const mapPageRow = (row: ProjectPageRow) => ({
    id: row.id,
    name: row.name,
    content: row.content || "",
    position: row.position,
});

const relationId = (value: unknown) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof (value as { id?: string }).id === "string") {
        return (value as { id: string }).id;
    }
    return "";
};

/** Map PocketBase board record ids to client ids (matches client persistence). */
export const buildBoardClientIdByPbId = (boardRecords: Array<Record<string, unknown>>) =>
    new Map(
        boardRecords.map((record) => [
            String(record.id),
            String(record.client_id || record.id),
        ])
    );

export const resolveBoardClientIdForRecord = (
    record: Record<string, unknown>,
    boardClientIdByPbId: Map<string, string>
) => {
    const boardPbId = relationId(record.board);
    if (!boardPbId) return null;
    return boardClientIdByPbId.get(boardPbId) || null;
};

const iso = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : new Date().toISOString();

const mapPbProject = (record: Record<string, unknown>): ProjectRow => ({
    id: String(record.client_id || record.id),
    user_id: relationId(record.owner),
    name: String(record.name || ""),
    background_theme: (record.background_theme as ProjectRow["background_theme"]) ?? null,
    scratchpad_data: String(record.scratchpad_data || ""),
    scratchpad_rev: typeof record.scratchpad_rev === "number" ? record.scratchpad_rev : 0,
    created_at: iso(record.created),
    updated_at: iso(record.updated),
});

const mapPbBoard = (record: Record<string, unknown>, projectId: string): ProjectBoardRow => ({
    id: String(record.client_id || record.id),
    project_id: projectId,
    name: String(record.name || ""),
    position: typeof record.position === "number" ? record.position : 0,
    preferences:
        record.preferences && typeof record.preferences === "object"
            ? (record.preferences as ProjectBoardRow["preferences"])
            : null,
    created_at: iso(record.created),
    updated_at: iso(record.updated),
});

const mapPbPage = (record: Record<string, unknown>, projectId: string): ProjectPageRow => ({
    id: String(record.client_id || record.id),
    project_id: projectId,
    name: String(record.name || ""),
    content: String(record.content || ""),
    position: typeof record.position === "number" ? record.position : 0,
    created_at: iso(record.created),
    updated_at: iso(record.updated),
});

const mapPbColumn = (
    record: Record<string, unknown>,
    projectId: string,
    boardId: string | null
): ProjectColumnRow => ({
    project_id: projectId,
    board_id: boardId,
    id: String(record.client_id || record.id),
    title: String(record.title || ""),
    color: typeof record.color === "string" ? record.color : null,
    width: typeof record.width === "number" ? record.width : DEFAULT_COLUMN_WIDTH,
    position: typeof record.position === "number" ? record.position : 0,
    created_at: iso(record.created),
    updated_at: iso(record.updated),
});

const mapPbTask = (
    record: Record<string, unknown>,
    projectId: string,
    boardId: string | null
): ProjectTaskRow => ({
    project_id: projectId,
    board_id: boardId,
    id: String(record.client_id || record.id),
    column_id: String(record.column_id || ""),
    title: String(record.title || ""),
    description: String(record.description || ""),
    color: typeof record.color === "string" ? record.color : null,
    tags: Array.isArray(record.tags) ? (record.tags as Tag[]) : [],
    has_checkbox: Boolean(record.has_checkbox),
    checked: Boolean(record.checked),
    completed_at: typeof record.completed_at === "number" ? record.completed_at : null,
    countdown_at: typeof record.countdown_at === "number" ? record.countdown_at : null,
    alarm_at: typeof record.alarm_at === "number" ? record.alarm_at : null,
    assigned_to: record.assigned_to ? relationId(record.assigned_to) : null,
    linked_task_ids: Array.isArray(record.linked_task_ids)
        ? (record.linked_task_ids as string[])
        : null,
    position: typeof record.position === "number" ? record.position : 0,
    created_at: iso(record.created),
    updated_at: iso(record.updated),
});

const ensureProjectAccess = async (projectId: string, authorization: string | undefined) => {
    const userId = (await resolveAuthenticatedUserId(authorization)).userId;
    const admin = await createAdminPb();
    const projectPbId = await getProjectPbId(admin, projectId);

    try {
        await admin.collection("project_memberships").getFirstListItem(
            `${projectRelationFilter(projectPbId)} && user = "${pbEscapeFilter(userId)}"`
        );
    } catch {
        throw new Error("Project not found or you do not have access.");
    }

    return admin;
};

const loadProjectWorkspaceState = async (
    projectId: string,
    authorization: string | undefined,
    scope?: AiScopeHint
) => {
    const admin = await ensureProjectAccess(projectId, authorization);
    const projectPbId = await getProjectPbId(admin, projectId);

    const [projectRecord, boardRecords, pageRecords, columnRecords, taskRecords] = await Promise.all([
        admin.collection("projects").getFirstListItem(projectClientFilter(projectId)),
        admin.collection("project_boards").getFullList({
            filter: projectRelationFilter(projectPbId),
            sort: "position",
        }),
        admin.collection("project_pages").getFullList({
            filter: projectRelationFilter(projectPbId),
            sort: "position",
        }),
        admin.collection("project_columns").getFullList({
            filter: projectRelationFilter(projectPbId),
            sort: "position",
        }),
        admin.collection("project_tasks").getFullList({
            filter: projectRelationFilter(projectPbId),
            sort: "position",
        }),
    ]);

    const project = mapPbProject(projectRecord);
    const boards = boardRecords
        .map((record) => mapPbBoard(record, projectId))
        .sort(
            (left, right) =>
                left.position - right.position || left.created_at.localeCompare(right.created_at)
        );
    const pages = pageRecords
        .map((record) => mapPbPage(record, projectId))
        .sort(
            (left, right) =>
                left.position - right.position || left.created_at.localeCompare(right.created_at)
        );
    const boardClientIdByPbId = buildBoardClientIdByPbId(boardRecords);
    const columns = columnRecords.map((record) =>
        mapPbColumn(
            record,
            projectId,
            resolveBoardClientIdForRecord(record, boardClientIdByPbId)
        )
    );
    const tasks = taskRecords.map((record) =>
        mapPbTask(record, projectId, resolveBoardClientIdForRecord(record, boardClientIdByPbId))
    );

    if (!boards.length) {
        throw new Error("The project does not have a board to edit yet.");
    }

    if (!pages.length) {
        throw new Error("The project does not have a page to edit yet.");
    }

    const activeBoardId =
        typeof scope?.activeBoardId === "string" && boards.some((board) => board.id === scope.activeBoardId)
            ? scope.activeBoardId
            : boards[0].id;
    const activePageId =
        typeof scope?.activePadId === "string" && pages.some((page) => page.id === scope.activePadId)
            ? scope.activePadId
            : pages[0].id;

    const activeBoardRow = boards.find((board) => board.id === activeBoardId) || boards[0];
    const activePageRow = pages.find((page) => page.id === activePageId) || pages[0];
    const fallbackBoardId = boards[0].id;

    const board = mapBoardRow(
        activeBoardRow,
        columns.filter((column) => (column.board_id || fallbackBoardId) === activeBoardRow.id),
        tasks.filter((task) => (task.board_id || fallbackBoardId) === activeBoardRow.id)
    );
    const page = mapPageRow(activePageRow);
    const allPages = pages
        .map((row) => mapPageRow(row))
        .sort((left, right) => left.position - right.position);

    return {
        board,
        page,
        pages: allPages,
        boardBaseRevision: scope?.revisions?.kanban ?? 0,
        pageBaseRevision: scope?.revisions?.scratchpad ?? 0,
    };
};

export const materializeWorkspace = async (
    projectId: string,
    authorization: string | undefined,
    scope?: AiScopeHint
): Promise<MaterializedWorkspace> => {
    const loaded = await loadProjectWorkspaceState(projectId, authorization, scope);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `kainbu-workspace-${projectId}-`));
    const boardFilePath = path.join(tempDir, CURRENT_BOARD_FILE);
    const activePageFilePath = path.join(tempDir, CURRENT_PAGE_FILE);
    const boardContent = serializeKanbanDocument(loaded.board.kanbanData);

    await fs.writeFile(boardFilePath, boardContent, "utf8");

    const materializedPages: MaterializedPage[] = [];
    for (const [index, sourcePage] of loaded.pages.entries()) {
        const filePath =
            sourcePage.id === loaded.page.id
                ? activePageFilePath
                : materializedPageFilePath(tempDir, sourcePage.id);
        const content = sanitizePageContent(sourcePage.content);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf8");
        materializedPages.push({
            id: sourcePage.id,
            name: sourcePage.name,
            content,
            filePath,
            originalContent: content,
            baseRevision: loaded.pageBaseRevision,
            baseFingerprint: "",
            editCallCount: 0,
            position: Number.isFinite(sourcePage.position) ? sourcePage.position : index,
        });
    }

    const activePage =
        materializedPages.find((entry) => entry.id === loaded.page.id) || materializedPages[0];
    const pagesBaseFingerprint = getPagesFingerprint(materializedPages);

    return {
        tempDir,
        projectId,
        board: {
            id: loaded.board.id,
            name: loaded.board.name,
            kanbanData: structuredClone(loaded.board.kanbanData),
            filePath: boardFilePath,
            originalContent: boardContent,
            baseRevision: loaded.boardBaseRevision,
            baseFingerprint: getKanbanFingerprint(loaded.board.kanbanData),
            editCallCount: 0,
            mutationCount: 0,
        },
        page: activePage,
        pages: materializedPages,
        pagesBaseFingerprint,
        boardRefs: {
            boardName: loaded.board.name,
            indexText: "",
            columnRefToId: new Map(),
            taskRefToId: new Map(),
            columnIdToRef: new Map(),
            taskIdToRef: new Map(),
        },
    };
};

export const cleanupMaterializedWorkspace = async (workspace: MaterializedWorkspace) => {
    await fs.rm(workspace.tempDir, { recursive: true, force: true });
};

export const resolveWorkspaceFilePath = (workspace: MaterializedWorkspace, filepath: string) => {
    const candidate = path.isAbsolute(filepath)
        ? path.normalize(filepath)
        : path.resolve(workspace.tempDir, filepath);
    const relative = path.relative(workspace.tempDir, candidate);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Workspace file paths must stay inside the AI workspace.");
    }

    return candidate;
};

export const canMutateWorkspacePath = (workspace: MaterializedWorkspace, filepath: string) =>
    filepath === workspace.board.filePath ||
    workspace.pages.some((page) => page.filePath === filepath);

export const validateWorkspaceFile = async (workspace: MaterializedWorkspace, filepath: string) => {
    if (filepath === workspace.board.filePath) {
        const content = await fs.readFile(filepath, "utf8");
        parseKanbanDocument(content);
    }
};

export const recordWorkspaceMutation = (workspace: MaterializedWorkspace, filepath: string) => {
    if (filepath === workspace.board.filePath) {
        workspace.board.editCallCount += 1;
    }

    if (filepath === workspace.page.filePath) {
        workspace.page.editCallCount += 1;
    }
};

const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((entry, index) => entry === right[index]);

const diffTaskFields = (original: Task, next: Task) => {
    if (areKanbanTasksEqualForDiff(original, next)) {
        return {};
    }

    const fields: Record<string, unknown> = {};

    if ((original.title || "").trim() !== (next.title || "").trim()) {
        fields.title = next.title;
    }
    if ((original.description || "").trim() !== (next.description || "").trim()) {
        fields.description = next.description || "";
    }

    const originalColor = (original.color || "").trim() || null;
    const nextColor = (next.color || "").trim() || null;
    if (originalColor !== nextColor) {
        fields.color = nextColor;
    }

    if (Boolean(original.hasCheckbox) !== Boolean(next.hasCheckbox)) {
        fields.hasCheckbox = Boolean(next.hasCheckbox);
    }

    if (Boolean(original.checked) !== Boolean(next.checked)) {
        fields.checked = Boolean(next.checked);
    }

    const originalCountdown =
        typeof original.countdownAt === "number" && original.countdownAt > 0
            ? original.countdownAt
            : null;
    const nextCountdown =
        typeof next.countdownAt === "number" && next.countdownAt > 0 ? next.countdownAt : null;
    if (originalCountdown !== nextCountdown) {
        fields.countdownAt = nextCountdown;
    }

    const originalAlarm =
        typeof original.alarmAt === "number" && original.alarmAt > 0 ? original.alarmAt : null;
    const nextAlarm = typeof next.alarmAt === "number" && next.alarmAt > 0 ? next.alarmAt : null;
    if (originalAlarm !== nextAlarm) {
        fields.alarmAt = nextAlarm;
    }

    if ((original.assignedTo || "").trim() !== (next.assignedTo || "").trim()) {
        fields.assignedTo = (next.assignedTo || "").trim() || null;
    }

    const originalTags = JSON.stringify(
        (original.tags || []).map((tag) => ({
            label: tag.label,
            color: tag.color || DEFAULT_TAG_COLOR,
        }))
    );
    const nextTags = JSON.stringify(
        (next.tags || []).map((tag) => ({
            label: tag.label,
            color: tag.color || DEFAULT_TAG_COLOR,
        }))
    );
    if (originalTags !== nextTags) {
        fields.tags = structuredClone(next.tags || []);
    }

    return fields;
};

const diffColumnFields = (original: KanbanData[number], next: KanbanData[number]) => {
    const fields: Record<string, unknown> = {};

    if (original.title !== next.title) fields.title = next.title;

    const originalColor = original.color || null;
    const nextColor = next.color || null;
    if (originalColor !== nextColor) {
        fields.color = nextColor;
    }

    if ((original.width ?? DEFAULT_COLUMN_WIDTH) !== (next.width ?? DEFAULT_COLUMN_WIDTH)) {
        fields.width = next.width ?? DEFAULT_COLUMN_WIDTH;
    }

    return fields;
};

export const deriveKanbanOps = (
    original: KanbanData,
    next: KanbanData
): KanbanPatchOperation[] => {
    const ops: KanbanPatchOperation[] = [];
    const originalColumns = new Map(original.map((column) => [column.id, column]));
    const nextColumns = new Map(next.map((column) => [column.id, column]));
    const originalColumnIds = original.map((column) => column.id);
    const nextColumnIds = next.map((column) => column.id);

    for (const [columnIndex, column] of next.entries()) {
        if (!originalColumns.has(column.id)) {
            ops.push({
                type: "add_column",
                column: {
                    id: column.id,
                    title: column.title,
                    ...(column.color ? { color: column.color } : {}),
                    width: column.width,
                },
                index: columnIndex,
            });
        }
    }

    for (const column of original) {
        if (!nextColumns.has(column.id)) {
            ops.push({
                type: "delete_column",
                columnId: column.id,
            });
        }
    }

    if (
        originalColumnIds.length === nextColumnIds.length &&
        [...originalColumnIds].sort().join("|") === [...nextColumnIds].sort().join("|") &&
        !areStringArraysEqual(originalColumnIds, nextColumnIds)
    ) {
        ops.push({
            type: "reorder_columns",
            columnIds: nextColumnIds,
        });
    }

    const originalTaskLocations = new Map<string, { task: Task; columnId: string; index: number }>();
    const nextTaskLocations = new Map<string, { task: Task; columnId: string; index: number }>();

    for (const column of original) {
        column.tasks.forEach((task, taskIndex) => {
            originalTaskLocations.set(task.id, { task, columnId: column.id, index: taskIndex });
        });
    }

    for (const column of next) {
        column.tasks.forEach((task, taskIndex) => {
            nextTaskLocations.set(task.id, { task, columnId: column.id, index: taskIndex });
        });
    }

    for (const column of next) {
        for (const [taskIndex, task] of column.tasks.entries()) {
            const originalLocation = originalTaskLocations.get(task.id);
            if (!originalLocation) {
                ops.push({
                    type: "add_task",
                    columnId: column.id,
                    task: {
                        id: task.id,
                        title: task.title,
                        ...(task.description ? { description: task.description } : {}),
                        ...(task.color ? { color: task.color } : {}),
                        ...(task.tags?.length ? { tags: structuredClone(task.tags) } : {}),
                        ...(typeof task.hasCheckbox === "boolean" ? { hasCheckbox: task.hasCheckbox } : {}),
                        ...(typeof task.checked === "boolean" ? { checked: task.checked } : {}),
                        ...(task.countdownAt != null ? { countdownAt: task.countdownAt } : {}),
                        ...(task.assignedTo ? { assignedTo: task.assignedTo } : {}),
                    },
                    index: taskIndex,
                });
                continue;
            }

            if (originalLocation.columnId !== column.id) {
                ops.push({
                    type: "move_task",
                    taskId: task.id,
                    targetColumnId: column.id,
                    index: taskIndex,
                });
            }

            const fields = diffTaskFields(originalLocation.task, task);
            if (Object.keys(fields).length) {
                ops.push({
                    type: "update_task",
                    taskId: task.id,
                    fields,
                });
            }
        }
    }

    for (const column of original) {
        for (const task of column.tasks) {
            if (!nextTaskLocations.has(task.id)) {
                ops.push({
                    type: "delete_task",
                    taskId: task.id,
                });
            }
        }
    }

    for (const column of next) {
        const originalColumn = originalColumns.get(column.id);
        if (!originalColumn) continue;

        const columnFields = diffColumnFields(originalColumn, column);
        if (Object.keys(columnFields).length) {
            ops.push({
                type: "update_column",
                columnId: column.id,
                fields: columnFields,
            });
        }

        const originalTaskIds = originalColumn.tasks.map((task) => task.id);
        const nextTaskIds = column.tasks.map((task) => task.id);
        if (
            originalTaskIds.length === nextTaskIds.length &&
            [...originalTaskIds].sort().join("|") === [...nextTaskIds].sort().join("|") &&
            !areStringArraysEqual(originalTaskIds, nextTaskIds)
        ) {
            ops.push({
                type: "reorder_tasks",
                columnId: column.id,
                taskIds: nextTaskIds,
            });
        }
    }

    return ops;
};

const isOutOfScope = (
    scope: AiScopeHint | undefined,
    ops: Array<KanbanPatchOperation | ScratchpadPatchOperation>
) => {
    const bound = scope?.boundTarget;
    if (!bound?.locked || !bound.id) return false;

    if (bound.kind === "task") {
        for (const op of ops) {
            if (op.type === "update_task" && op.taskId !== bound.id) return true;
            if (op.type === "delete_task" && op.taskId !== bound.id) return true;
            if (op.type === "move_task" && op.taskId !== bound.id) return true;
        }
        return false;
    }

    if (bound.kind === "column") {
        for (const op of ops) {
            if (op.type === "add_task" && op.columnId !== bound.id) return true;
            if (op.type === "update_column" && op.columnId !== bound.id) return true;
            if (op.type === "delete_column" && op.columnId !== bound.id) return true;
            if (op.type === "move_task" && op.targetColumnId !== bound.id) return true;
            if (op.type === "reorder_tasks" && op.columnId !== bound.id) return true;
        }
    }

    return false;
};

const buildProposalSafety = (
    ops: Array<KanbanPatchOperation | ScratchpadPatchOperation>,
    scope?: AiScopeHint
): AiProposalSafety => {
    const touchedTaskIds = new Set<string>();
    const touchedColumnIds = new Set<string>();
    const touchedPadIds = new Set<string>();
    let moveCount = 0;
    let deleteCount = 0;
    let reorderCount = 0;

    for (const op of ops) {
        switch (op.type) {
            case "add_column":
                if (op.column.id) touchedColumnIds.add(op.column.id);
                break;
            case "update_column":
            case "delete_column":
                touchedColumnIds.add(op.columnId);
                if (op.type === "delete_column") deleteCount += 1;
                break;
            case "reorder_columns":
                op.columnIds.forEach((columnId) => touchedColumnIds.add(columnId));
                reorderCount += 1;
                break;
            case "add_task":
                touchedColumnIds.add(op.columnId);
                if (op.task.id) touchedTaskIds.add(op.task.id);
                break;
            case "update_task":
                touchedTaskIds.add(op.taskId);
                break;
            case "move_task":
                touchedTaskIds.add(op.taskId);
                touchedColumnIds.add(op.targetColumnId);
                moveCount += 1;
                break;
            case "delete_task":
                touchedTaskIds.add(op.taskId);
                deleteCount += 1;
                break;
            case "reorder_tasks":
                touchedColumnIds.add(op.columnId);
                op.taskIds.forEach((taskId) => touchedTaskIds.add(taskId));
                reorderCount += 1;
                break;
            case "create_pad":
                if (op.pad?.id) touchedPadIds.add(op.pad.id);
                break;
            case "rename_pad":
            case "delete_pad":
            case "set_active_pad":
            case "replace_pad_content":
            case "replace_pad_lines":
                touchedPadIds.add(op.padId);
                if (op.type === "delete_pad") deleteCount += 1;
                break;
        }
    }

    const safety = {
        touchedTaskIds: [...touchedTaskIds],
        touchedColumnIds: [...touchedColumnIds],
        ...(touchedPadIds.size ? { touchedPadIds: [...touchedPadIds] } : {}),
        moveCount,
        deleteCount,
        reorderCount,
        outOfScope: false,
    };

    safety.outOfScope = isOutOfScope(scope, ops);
    return safety;
};

const resolveKanbanScope = (ops: KanbanPatchOperation[], safety: AiProposalSafety): AiKanbanProposal["scope"] => {
    if (
        safety.touchedTaskIds.length === 1 &&
        ops.every((op) => op.type === "update_task" || op.type === "move_task")
    ) {
        return "task";
    }

    if (
        safety.touchedTaskIds.length === 0 &&
        safety.touchedColumnIds.length === 1 &&
        ops.every((op) => op.type === "update_column" || op.type === "reorder_tasks")
    ) {
        return "column";
    }

    return "board";
};

const summarizeKanbanProposal = (boardName: string, safety: AiProposalSafety) => {
    if (safety.touchedTaskIds.length === 1 && !safety.deleteCount && !safety.reorderCount) {
        return `Review the board change in ${boardName}.`;
    }

    return `Review the staged board changes for ${boardName}.`;
};

const summarizeScratchpadProposal = (pageName: string) => `Review the staged page changes for ${pageName}.`;

const buildKanbanProposal = (
    board: MaterializedBoard,
    nextKanbanData: KanbanData,
    scope?: AiScopeHint
): AiKanbanProposal => {
    const originalKanbanData = parseKanbanDocument(board.originalContent);
    const ops = deriveKanbanOps(originalKanbanData, nextKanbanData);
    const proposalSafety = buildProposalSafety(ops, scope);

    return {
        id: randomUUID(),
        target: "kanban",
        summary: summarizeKanbanProposal(board.name, proposalSafety),
        scope: resolveKanbanScope(ops, proposalSafety),
        editCallCount: Math.max(1, board.editCallCount),
        ops,
        proposalSafety,
        originalKanbanData,
        preview: {
            kanbanData: nextKanbanData,
        },
        baseRevision: board.baseRevision,
        baseFingerprint: board.baseFingerprint,
    };
};

const buildScratchpadStateFromPages = (pages: MaterializedPage[], activePadId: string) => ({
    activePadId: pages.some((page) => page.id === activePadId) ? activePadId : pages[0]?.id || activePadId,
    pads: pages.map((page) => ({
        id: page.id,
        name: page.name,
        content: page.content,
    })),
});

const derivePagePatchOps = (
    originalPages: MaterializedPage[],
    nextPages: MaterializedPage[]
): ScratchpadPatchOperation[] => {
    const ops: ScratchpadPatchOperation[] = [];
    const originalById = new Map(originalPages.map((page) => [page.id, page]));
    const nextById = new Map(nextPages.map((page) => [page.id, page]));

    for (const [index, page] of nextPages.entries()) {
        if (!originalById.has(page.id)) {
            ops.push({
                type: "create_pad",
                pad: {
                    id: page.id,
                    name: page.name,
                    content: page.content,
                },
                index,
            });
        }
    }

    for (const page of nextPages) {
        const original = originalById.get(page.id);
        if (!original) continue;
        if (original.name !== page.name) {
            ops.push({
                type: "rename_pad",
                padId: page.id,
                name: page.name,
            });
        }
        if (original.content !== page.content) {
            ops.push({
                type: "replace_pad_content",
                padId: page.id,
                content: page.content,
            });
        }
    }

    for (const page of originalPages) {
        if (!nextById.has(page.id)) {
            ops.push({
                type: "delete_pad",
                padId: page.id,
            });
        }
    }

    return ops;
};

export const listWorkspacePages = (workspace: MaterializedWorkspace) => ({
    ok: true as const,
    pages: workspace.pages.map((page) => ({
        pageId: page.id,
        title: page.name,
        isActive: page.id === workspace.page.id,
    })),
});

export const setWorkspacePageContent = async (
    workspace: MaterializedWorkspace,
    content: string,
    options?: { pageId?: string }
) => {
    const pageId = trimString(options?.pageId) || workspace.page.id;
    const page = workspace.pages.find((entry) => entry.id === pageId);
    if (!page) {
        return {
            ok: false as const,
            error: `Unknown page id "${pageId}".`,
            pageIds: workspace.pages.map((entry) => entry.id),
        };
    }

    const nextContent = stripEditorTemplateFromContent(content);
    const previousContent = await fs.readFile(page.filePath, "utf8");
    page.content = nextContent;
    await writeMaterializedPageFile(workspace, page);
    try {
        recordWorkspaceMutation(workspace, page.filePath);
        page.editCallCount += 1;
        if (page.id === workspace.page.id) {
            workspace.page.content = nextContent;
        }
        return { ok: true as const, message: `Updated page "${page.name}".`, pageId: page.id };
    } catch (error) {
        await fs.writeFile(page.filePath, previousContent, "utf8");
        page.content = previousContent;
        if (page.id === workspace.page.id) {
            workspace.page.content = previousContent;
        }
        return {
            ok: false as const,
            error: error instanceof Error ? error.message : "Invalid page content.",
        };
    }
};

export const createWorkspacePage = async (
    workspace: MaterializedWorkspace,
    title: string,
    content: string
) => {
    const name = trimString(title) || "Untitled";
    const nextContent = stripEditorTemplateFromContent(content);
    const id = randomUUID();
    const page: MaterializedPage = {
        id,
        name,
        content: nextContent,
        filePath: materializedPageFilePath(workspace.tempDir, id),
        originalContent: "",
        baseRevision: workspace.page.baseRevision,
        baseFingerprint: "",
        editCallCount: 0,
        position: workspace.pages.length,
    };

    await writeMaterializedPageFile(workspace, page);
    recordWorkspaceMutation(workspace, page.filePath);
    page.editCallCount += 1;
    workspace.pages.push(page);

    return {
        ok: true as const,
        pageId: id,
        message: `Created page "${name}".`,
    };
};

const buildScratchpadProposal = (
    pages: MaterializedPage[],
    activePadId: string,
    ops: ScratchpadPatchOperation[],
    scope?: AiScopeHint,
    baseRevision = 0,
    baseFingerprint = ""
): AiScratchpadProposal => {
    const proposalSafety = buildProposalSafety(ops, scope);
    const previewState = buildScratchpadStateFromPages(pages, activePadId);
    const activePage = pages.find((page) => page.id === activePadId) || pages[0];

    return {
        id: randomUUID(),
        target: "scratchpad",
        summary: summarizeScratchpadProposal(activePage?.name || "page"),
        scope: ops.some((op) => op.type === "create_pad") ? "scratchpad" : "pad",
        editCallCount: Math.max(
            1,
            pages.reduce((total, page) => total + page.editCallCount, 0)
        ),
        ops,
        proposalSafety,
        preview: {
            scratchpadState: previewState,
        },
        baseRevision,
        baseFingerprint,
        padId: activePadId,
    };
};

export const collectWorkspaceProposals = async (
    workspace: MaterializedWorkspace,
    scope?: AiScopeHint
): Promise<AiProposal[]> => {
    const proposals: AiProposal[] = [];

    const boardContent = await fs.readFile(workspace.board.filePath, "utf8");
    const nextKanbanData = parseKanbanDocument(boardContent);
    if (getKanbanFingerprint(nextKanbanData) !== workspace.board.baseFingerprint) {
        proposals.push(buildKanbanProposal(workspace.board, nextKanbanData, scope));
    }

    const originalPages = workspace.pages.map((page) => ({
        ...page,
        content: page.originalContent,
    }));
    const nextPages = await readMaterializedPages(workspace);
    if (getPagesFingerprint(nextPages) !== workspace.pagesBaseFingerprint) {
        const ops = derivePagePatchOps(originalPages, nextPages);
        if (ops.length) {
            proposals.push(
                buildScratchpadProposal(
                    nextPages,
                    workspace.page.id,
                    ops,
                    scope,
                    workspace.page.baseRevision,
                    workspace.pagesBaseFingerprint
                )
            );
        }
    }

    return proposals;
};

