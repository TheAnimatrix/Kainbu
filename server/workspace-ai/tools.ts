import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { WORKSPACE_AI_WEB_SEARCH_MODEL, WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS } from "./constants.js";
import { getEnv } from "../env.js";

const execAsync = promisify(exec);

export const VirtualFSTools = {
    read: async (filepath: string, startLine?: number, endLine?: number) => {
        try {
            const content = await fs.readFile(filepath, "utf8");
            if (startLine !== undefined && endLine !== undefined) {
                const lines = content.split("\n");
                return lines.slice(startLine - 1, endLine).join("\n");
            }
            return content;
        } catch (e: any) {
            return `Error reading file: ${e.message}`;
        }
    },
    bash: async (dirPath: string, command: string) => {
        const baseCmd = command.trim().split(" ")[0];
        if (!["ls", "grep", "find", "cat"].includes(baseCmd)) {
            return `Error: Only ls, grep, find, and cat commands are allowed. You tried: ${baseCmd}`;
        }
        try {
            const { stdout, stderr } = await execAsync(command, { cwd: dirPath, timeout: 5000 });
            return stdout || stderr || "Command completed with no output.";
        } catch (e: any) {
            return `Command error: ${e.message}`;
        }
    },
    edit: async (filepath: string, searchString: string, replaceString: string) => {
        try {
            const content = await fs.readFile(filepath, "utf8");
            if (!content.includes(searchString)) {
                return `Error: Could not find exact search string in file. Please read the file first to ensure exact match.`;
            }
            if (content.indexOf(searchString) !== content.lastIndexOf(searchString)) {
                return `Error: The search string appears multiple times in the file. Please provide a more unique string.`;
            }
            const newContent = content.replace(searchString, replaceString);
            await fs.writeFile(filepath, newContent, "utf8");
            return `File edited successfully.`;
        } catch (e: any) {
            return `Error editing file: ${e.message}`;
        }
    },
    write: async (filepath: string, content: string) => {
        try {
            await fs.writeFile(filepath, content, "utf8");
            return `File written successfully.`;
        } catch (e: any) {
            return `Error writing file: ${e.message}`;
        }
    },
    search: async (dirPath: string, query: string) => {
        if (!query.trim()) return "Error: empty search query.";
        try {
            const { stdout, stderr } = await execAsync(
                `grep -ri ${JSON.stringify(query)} .`,
                { cwd: dirPath, timeout: 5000 }
            );
            const raw = stdout || stderr || "No matches found.";
            return raw.slice(0, 2000);
        } catch (e: any) {
            if (e.code === 1) return "No matches found.";
            return `Search error: ${e.message}`;
        }
    }
};

export const webSearch = async (query: string): Promise<string> => {
    const apiKey = getEnv("OPENROUTER_API_KEY", "");
    if (!apiKey) return "Web search is not available (missing API key).";

    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "HTTP-Referer": "https://kainbu.test",
                "X-Title": "Kainbu Web Search"
            },
            body: JSON.stringify({
                model: WORKSPACE_AI_WEB_SEARCH_MODEL,
                max_tokens: WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS,
                messages: [
                    {
                        role: "system",
                        content: "Search the web for the following query. Return a concise, factual summary of the top results. Include relevant URLs where helpful."
                    },
                    { role: "user", content: query }
                ]
            })
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            return `Web search failed (${res.status}): ${errorText.slice(0, 200)}`;
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        return typeof content === "string" && content.trim()
            ? content.trim()
            : "Web search returned no results.";
    } catch (e: any) {
        return `Web search failed: ${e.message}`;
    }
};

export const OpenRouterTools = [
    {
        type: "function",
        function: {
            name: "read",
            description: "Read file contents (limit lines if needed to save context).",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string" },
                    startLine: { type: "number" },
                    endLine: { type: "number" }
                },
                required: ["filepath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "bash",
            description: "Execute read-only bash commands (ls, grep, find, cat) in the workspace directory.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string" }
                },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "edit",
            description: "Make surgical edits to files (search string -> replace string). The search string must match EXACTLY and appear only ONCE.",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string" },
                    searchString: { type: "string" },
                    replaceString: { type: "string" }
                },
                required: ["filepath", "searchString", "replaceString"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write",
            description: "Create or overwrite files entirely.",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string" },
                    content: { type: "string" }
                },
                required: ["filepath", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search",
            description: "Search across all boards and pages in the workspace for a keyword or phrase. Returns matching lines.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search term" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web for external information. Returns a concise summary of results.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The web search query" }
                },
                required: ["query"]
            }
        }
    }
];

