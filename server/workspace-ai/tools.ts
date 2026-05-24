import {
    WORKSPACE_AI_ADD_TASKS_MAX_TITLES,
    WORKSPACE_AI_DELETE_TASKS_MAX_REFS,
    WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS,
    WORKSPACE_AI_WEB_SEARCH_MODEL,
} from "./constants.js";
import { getEnv } from "../env.js";

export const webSearch = async (query: string): Promise<string> => {
    const apiKey = getEnv("OPENROUTER_API_KEY", "");
    if (!apiKey) return JSON.stringify({ ok: false, error: "Web search is not available (missing API key)." });

    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "HTTP-Referer": "https://kainbu.test",
                "X-Title": "Kainbu Web Search",
            },
            body: JSON.stringify({
                model: WORKSPACE_AI_WEB_SEARCH_MODEL,
                max_tokens: WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS,
                messages: [
                    {
                        role: "system",
                        content:
                            "Search the web for the following query. Return a concise, factual summary of the top results. Include relevant URLs where helpful.",
                    },
                    { role: "user", content: query },
                ],
            }),
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            return JSON.stringify({
                ok: false,
                error: `Web search failed (${res.status}): ${errorText.slice(0, 200)}`,
            });
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        return JSON.stringify({
            ok: true,
            summary:
                typeof content === "string" && content.trim()
                    ? content.trim()
                    : "Web search returned no results.",
        });
    } catch (e: unknown) {
        return JSON.stringify({
            ok: false,
            error: `Web search failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        });
    }
};

export const OpenRouterTools = [
    {
        type: "function",
        function: {
            name: "board_list_columns",
            description: "List all columns on the current board with refs (C1, C2, …) and task counts.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function",
        function: {
            name: "board_list_tasks",
            description:
                "List tasks in one column. Use columnRef from board_list_columns or the board index.",
            parameters: {
                type: "object",
                properties: {
                    columnRef: { type: "string", description: "Column ref e.g. C1" },
                    offset: { type: "number", description: "Skip this many tasks (default 0)" },
                    limit: { type: "number", description: "Max tasks to return (default 15)" },
                },
                required: ["columnRef"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "add_tasks",
            description: `Add new tasks to a column. Use columnRef from the board index or board_list_columns. Max ${WORKSPACE_AI_ADD_TASKS_MAX_TITLES} titles per call.`,
            parameters: {
                type: "object",
                properties: {
                    columnRef: { type: "string", description: "Column ref e.g. C1" },
                    titles: {
                        type: "array",
                        items: { type: "string" },
                        description: "Task titles to create",
                    },
                },
                required: ["columnRef", "titles"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "update_task",
            description:
                "Update one existing task by taskRef from the board index or board_list_tasks.",
            parameters: {
                type: "object",
                properties: {
                    taskRef: { type: "string", description: "Task ref e.g. T1" },
                    title: { type: "string" },
                    description: { type: "string" },
                },
                required: ["taskRef"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "delete_tasks",
            description: `Delete existing tasks by taskRef from the board index or board_list_tasks. Max ${WORKSPACE_AI_DELETE_TASKS_MAX_REFS} refs per call.`,
            parameters: {
                type: "object",
                properties: {
                    taskRefs: {
                        type: "array",
                        items: { type: "string" },
                        description: "Task refs to delete e.g. T1, T2",
                    },
                },
                required: ["taskRefs"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_page",
            description: "Read the current page content.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function",
        function: {
            name: "set_page",
            description: "Replace the entire current page with new markdown/plain text content.",
            parameters: {
                type: "object",
                properties: {
                    content: { type: "string", description: "Full page content" },
                },
                required: ["content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web for external information.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The web search query" },
                },
                required: ["query"],
            },
        },
    },
];
