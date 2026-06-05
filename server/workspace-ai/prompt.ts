import type { AiScopeHint } from './types.js';
import {
	WORKSPACE_AI_ADD_TASKS_MAX_TITLES,
	WORKSPACE_AI_CACHE_BREAKPOINT_KEY,
	WORKSPACE_AI_MAX_BOARD_MUTATIONS,
	WORKSPACE_AI_MAX_MODEL_TURNS,
	WORKSPACE_AI_MAX_MODEL_TURNS_LARGE_BOARD,
	WORKSPACE_AI_MAX_TOOL_CALLS
} from './constants.js';
import { findColumn, findTask } from './kanban-ops.js';
import type { KanbanData } from './types.js';
import type { OpenRouterMessage } from './openrouter-stream.js';

const TONE_COLORS_DOC =
	'tone:red, tone:orange, tone:amber, tone:green, tone:emerald, tone:teal, tone:cyan, tone:blue, tone:indigo, tone:violet, tone:purple, tone:fuchsia, tone:pink, tone:rose';

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
		`- ask_questions: Open a structured Q&A panel for one or more user answers, then wait for the continuation.`,
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
		`- If the user asks to test, use, or invoke the Q&A/questionnaire tool, call ask_questions. Do not claim that no Q&A UI exists.`,
		`- When you need more information, prefer ask_questions over plain numbered questions, especially for multiple questions.`,
		`- If the user asks about the current board, inspect the board and answer with concrete board details. Do not stop at "I'll look" or "let me pull it up."`,
		`- When the user attaches images, read them and use visible text (e.g. checklist items) for board or page edits.`
	].join('\n');

const formatBoundTarget = (scope: AiScopeHint, kanban: KanbanData) => {
	const bound = scope.boundTarget;
	if (!bound?.locked || !bound.id) return '';

	if (bound.kind === 'task') {
		const located = findTask(kanban, bound.id);
		const title =
			located?.task.title || scope.queuedTaskCards?.find((c) => c.taskId === bound.id)?.title;
		const columnTitle = located?.column.title;
		if (title && columnTitle) {
			return `Only change the task "${title}" in column "${columnTitle}" unless the user explicitly asks for broader board edits.`;
		}
		if (title) {
			return `Only change the task "${title}" unless the user explicitly asks for broader board edits.`;
		}
	}

	if (bound.kind === 'column') {
		const column = findColumn(kanban, bound.id);
		if (column) {
			return `Only change column "${column.title}" unless the user explicitly asks for broader board edits.`;
		}
	}

	return '';
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
		sections.push(`## Referenced tasks\n${lines.join('\n')}`);
	}

	if (scope?.activeViewContent && scope.activeViewContent.kind !== 'none') {
		const { kind, name, content } = scope.activeViewContent;
		const label = kind === 'board' ? 'board' : 'page';
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

	return sections.join('\n\n');
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
			kanban: []
		})
	]
		.filter(Boolean)
		.join('\n\n');
};

export const buildQueuedTaskCardsContext = (scope?: AiScopeHint) => {
	const cards = scope?.queuedTaskCards || [];
	if (!cards.length) return '';

	const lines = cards.map((card) => `- ${card.title} (column: ${card.columnTitle})`);
	return `The user attached these task cards:\n${lines.join('\n')}`;
};

export const resolveMaxModelTurns = (kanbanFullAllowed: boolean) =>
	kanbanFullAllowed ? WORKSPACE_AI_MAX_MODEL_TURNS : WORKSPACE_AI_MAX_MODEL_TURNS_LARGE_BOARD;

// ── Prompt-cache-friendly message layout ────────────────────────────────────
// Volatile per-turn data (board index, scope, queued cards) is wrapped in a
// <session_context> block placed immediately before the latest user message,
// so the static system prompt and the stable conversation history both stay
// byte-identical across turns and remain prompt-cacheable.

export const SESSION_CONTEXT_OPEN = '<session_context>';
export const SESSION_CONTEXT_CLOSE = '</session_context>';
export const CONVERSATION_SUMMARY_OPEN = '<conversation_summary>';
export const CONVERSATION_SUMMARY_CLOSE = '</conversation_summary>';
export const INSTRUCTION_REFRESH_OPEN = '<instruction_refresh>';
export const INSTRUCTION_REFRESH_CLOSE = '</instruction_refresh>';

export const wrapSessionContext = (body: string): string =>
	`${SESSION_CONTEXT_OPEN}\n${body.trim()}\n${SESSION_CONTEXT_CLOSE}`;

export const wrapConversationSummary = (summary: unknown): string => {
	const body = typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2);
	return `${CONVERSATION_SUMMARY_OPEN}\n${body.trim()}\n${CONVERSATION_SUMMARY_CLOSE}`;
};

/** Re-injected editing contract to fight instruction drift on long or compacted chats. */
export const buildInstructionRefresh = (): string =>
	[
		INSTRUCTION_REFRESH_OPEN,
		'Reminder of the editing contract:',
		'- Use tools to change the board or pages. Plain text never stages or saves anything.',
		'- Staged changes stay pending until the user applies them in the UI. They are not saved yet.',
		'- Prefer batch tools (add_tasks, bulk_update_tasks) even for a single item.',
		'- Never claim a board or page change was saved, added, updated, removed, or staged unless a tool returned a successful result in this turn.',
		'- Internal refs (C1, T1, UUIDs) are for tools only. Never show them to the user; use titles and column names.',
		INSTRUCTION_REFRESH_CLOSE
	].join('\n');

const SESSION_CONTEXT_PREFIX = `${SESSION_CONTEXT_OPEN}`;

const isSessionContextMessage = (message: OpenRouterMessage): boolean =>
	message.role === 'user' &&
	typeof message.content === 'string' &&
	message.content.trim().startsWith(SESSION_CONTEXT_PREFIX);

/** Defensive: drop any stale <session_context> user blocks that leaked into history. */
const stripSessionContextMessages = (history: OpenRouterMessage[]): OpenRouterMessage[] =>
	history.filter((message) => !isSessionContextMessage(message));

/**
 * Assemble the per-turn message list for prefix caching:
 *   [stable history] → [conversation summary?] → [instruction refresh?] → [session_context] → [last user]
 *
 * The static system prompt is prepended by the caller. The last stable-history message is
 * tagged with a transient cache breakpoint so the history prefix is cacheable too.
 */
export const assembleWorkspaceMessages = (
	historyMessages: OpenRouterMessage[],
	sessionContextBody: string,
	options: { summary?: unknown; instructionRefresh?: string | null } = {}
): OpenRouterMessage[] => {
	const core = stripSessionContextMessages(historyMessages);

	const summaryPrefix: OpenRouterMessage[] = options.summary
		? [{ role: 'user', content: wrapConversationSummary(options.summary) }]
		: [];
	const refresh: OpenRouterMessage[] = options.instructionRefresh
		? [{ role: 'user', content: options.instructionRefresh }]
		: [];
	const sessionContext: OpenRouterMessage = {
		role: 'user',
		content: wrapSessionContext(sessionContextBody)
	};

	// Split off the trailing user message so volatile context sits right before it.
	const last = core[core.length - 1];
	const trailingUser = last && last.role === 'user' ? last : undefined;
	const stableHistory = trailingUser ? core.slice(0, -1) : core;

	// Mark the end of the stable, cacheable prefix (static system is marked separately).
	const lastStable =
		stableHistory.length > 0 ? stableHistory[stableHistory.length - 1] : undefined;
	if (lastStable) {
		lastStable[WORKSPACE_AI_CACHE_BREAKPOINT_KEY] = true;
	}

	return [
		...stableHistory,
		...summaryPrefix,
		...refresh,
		sessionContext,
		...(trailingUser ? [trailingUser] : [])
	];
};
