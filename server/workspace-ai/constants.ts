import { DEFAULT_AI_MODEL_CONFIGS } from '../../src/lib/kainbu/models.js';

export const WORKSPACE_AI_MODELS = DEFAULT_AI_MODEL_CONFIGS;
export const WORKSPACE_AI_MAX_TOKENS = 60_000;
export const WORKSPACE_AI_READ_MAX_CHARS = 12_000;
export const WORKSPACE_AI_WEB_SEARCH_MODEL = "x-ai/grok-4.1-fast";
export const WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS = 2048;

export const WORKSPACE_AI_ADD_TASKS_MAX_TITLES = 10;
export const WORKSPACE_AI_DELETE_TASKS_MAX_REFS = 10;
export const WORKSPACE_AI_BULK_UPDATE_TASKS_MAX = 10;
export const WORKSPACE_AI_UPDATE_TASK_MAX_CHARS = 8_000;
export const WORKSPACE_AI_MAX_TOOL_CALLS = 16;
export const WORKSPACE_AI_MAX_BOARD_MUTATIONS = 40;
export const WORKSPACE_AI_MAX_ADD_TASKS_CALLS = 6;
export const WORKSPACE_AI_MAX_UPDATE_TASK_CALLS = 10;
export const WORKSPACE_AI_MAX_DELETE_TASK_CALLS = 4;
export const WORKSPACE_AI_MAX_BULK_UPDATE_TASK_CALLS = 2;
export const WORKSPACE_AI_MAX_ADD_COLUMN_CALLS = 4;
export const WORKSPACE_AI_MAX_UPDATE_COLUMN_CALLS = 4;
export const WORKSPACE_AI_MAX_MODEL_TURNS = 3;
export const WORKSPACE_AI_MAX_MODEL_TURNS_LARGE_BOARD = 5;
export const WORKSPACE_AI_STREAM_DELTA_THROTTLE_MS = 50;
export const WORKSPACE_AI_BOARD_INDEX_MAX_LINES = 120;
export const WORKSPACE_AI_BOARD_LIST_TASKS_DEFAULT_LIMIT = 15;
export const WORKSPACE_AI_TURN_NOTE_MAX_CHARS = 400;
export const WORKSPACE_AI_PROMPT_CACHE_ENABLED = process.env.WORKSPACE_AI_PROMPT_CACHE !== "0";

/** Transient message key (stripped before the wire) requesting a prompt-cache breakpoint. */
export const WORKSPACE_AI_CACHE_BREAKPOINT_KEY = "__cacheBreakpoint" as const;

/** Cheap model used to compact long chat history into a durable summary. */
export const WORKSPACE_AI_COMPACT_MODEL = process.env.WORKSPACE_AI_COMPACT_MODEL || "x-ai/grok-4.1-fast";

/** Token budget for the chat context window before compaction kicks in. */
export const WORKSPACE_AI_CONTEXT_BUDGET_TOKENS = 24_000;
/** Compact once the live context reaches this fraction of the budget. */
export const WORKSPACE_AI_CONTEXT_COMPACT_RATIO = 0.7;
/** Re-inject the editing contract once context reaches this fraction of the budget. */
export const WORKSPACE_AI_INSTRUCTION_REFRESH_RATIO = 0.55;
/** Recent user turns always kept verbatim (never folded into the summary). */
export const WORKSPACE_AI_CONTEXT_RECENT_TURNS = 8;
/** Minimum user turns that must be compactable before a summary is generated. */
export const WORKSPACE_AI_CONTEXT_MIN_COMPACTABLE_TURNS = 4;
