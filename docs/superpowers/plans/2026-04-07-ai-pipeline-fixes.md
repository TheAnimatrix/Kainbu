# AI Pipeline Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 5 workspace AI issues: misbehavior/fallback reply, file view leaking, no view awareness, no web search, no dedicated search.

**Architecture:** Enrich the client-side scope with the active view's serialized content, rewrite the system prompt to use domain language and inject scope context, add web_search and search tools, fix the fallback reply, and strip temp paths from tool results.

**Tech Stack:** SvelteKit (client), Hono (server), OpenRouter API (LLM + web search model)

---

### Task 1: Add `activeViewContent` to `AiScopeHint`

**Files:**
- Modify: `src/lib/kainbu/types.ts:308-322`

- [ ] **Step 1: Add the `activeViewContent` field to `AiScopeHint`**

In `src/lib/kainbu/types.ts`, add the field after line 321 (`workspaceSummary`):

```ts
export interface AiScopeHint {
	currentTab: WorkspaceTab;
	selectedTaskIds: string[];
	selectedColumnIds: string[];
	activeBoardId?: string;
	activeTaskId?: string;
	activeColumnId?: string;
	activePadId: string;
	clientNowIso?: string;
	clientTimezone?: string;
	boundTarget?: BoundTarget;
	queuedTaskCards: ChatTaskCard[];
	revisions: ProjectRevisionState;
	workspaceSummary: WorkspaceSummary;
	activeViewContent?: {
		kind: 'board' | 'page' | 'none';
		name: string;
		content: string;
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kainbu/types.ts
git commit -m "feat(ai): add activeViewContent to AiScopeHint"
```

---

### Task 2: Serialize the active view in `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte:2905-2928`

- [ ] **Step 1: Add a `serializeActiveView` helper**

Add this function near the other AI helper functions (around line 2600, near `buildWorkspaceSummaryForProject`):

```ts
const serializeActiveView = (
	project: Project,
	tab: WorkspaceTab,
	boardId: string,
	padId: string
): { kind: 'board' | 'page' | 'none'; name: string; content: string } => {
	if (tab === 'kanban') {
		const board = project.boards.find((b) => b.id === boardId) || project.boards[0];
		if (!board) return { kind: 'none', name: 'kanban', content: '' };
		const lines = [`Board: "${board.name}"`];
		for (const col of board.kanbanData) {
			const taskTitles = col.tasks.map((t) => t.title).join(', ');
			lines.push(`[${col.title}] ${taskTitles || '(empty)'}`);
		}
		return { kind: 'board', name: board.name, content: lines.join('\n').slice(0, 3000) };
	}

	if (tab === 'scratchpad') {
		const pad = getScratchpadPadForProject(project, padId);
		if (!pad) return { kind: 'none', name: 'scratchpad', content: '' };
		return { kind: 'page', name: pad.name, content: pad.content.slice(0, 2000) };
	}

	return { kind: 'none', name: tab, content: '' };
};
```

- [ ] **Step 2: Wire it into the AI request scope**

In the `scope` object inside the `invokeWorkspaceAi` call (around line 2914), add `activeViewContent`:

Change the scope from:

```ts
scope: {
	currentTab: visibleWorkspaceTab,
	selectedTaskIds,
	selectedColumnIds,
	...(currentBoardId ? { activeBoardId: currentBoardId } : {}),
	...(activeTaskContext?.taskId ? { activeTaskId: activeTaskContext.taskId } : {}),
	...(activeTaskContext?.columnId ? { activeColumnId: activeTaskContext.columnId } : {}),
	activePadId,
	clientNowIso,
	...(clientTimezone ? { clientTimezone } : {}),
	boundTarget,
	queuedTaskCards: taskCards,
	revisions: revisionSnapshot,
	workspaceSummary: buildWorkspaceSummaryForProject(projectSnapshot)
},
```

to:

```ts
scope: {
	currentTab: visibleWorkspaceTab,
	selectedTaskIds,
	selectedColumnIds,
	...(currentBoardId ? { activeBoardId: currentBoardId } : {}),
	...(activeTaskContext?.taskId ? { activeTaskId: activeTaskContext.taskId } : {}),
	...(activeTaskContext?.columnId ? { activeColumnId: activeTaskContext.columnId } : {}),
	activePadId,
	clientNowIso,
	...(clientTimezone ? { clientTimezone } : {}),
	boundTarget,
	queuedTaskCards: taskCards,
	revisions: revisionSnapshot,
	workspaceSummary: buildWorkspaceSummaryForProject(projectSnapshot),
	activeViewContent: serializeActiveView(
		projectSnapshot,
		visibleWorkspaceTab,
		currentBoardId,
		activePadId
	)
},
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(ai): serialize active view content into AI request scope"
```

---

### Task 3: Add web search model constant

**Files:**
- Modify: `server/workspace-ai/constants.ts`

- [ ] **Step 1: Add the web search model constant**

Replace the entire file:

```ts
export const WORKSPACE_AI_MODEL = "google/gemini-3-flash-preview:nitro";
export const WORKSPACE_AI_MAX_TOKENS = 8192;
export const WORKSPACE_AI_THINKING = { type: "enabled", budget_tokens: 4096 };
export const WORKSPACE_AI_WEB_SEARCH_MODEL = "openai/gpt-4o-mini-search-preview";
export const WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS = 2048;
```

- [ ] **Step 2: Commit**

```bash
git add server/workspace-ai/constants.ts
git commit -m "feat(ai): add web search model constants"
```

---

### Task 4: Add `search` and `webSearch` tools

**Files:**
- Modify: `server/workspace-ai/tools.ts`

- [ ] **Step 1: Add the `webSearch` function**

Add at the top of the file, after the existing imports:

```ts
import { WORKSPACE_AI_WEB_SEARCH_MODEL, WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS } from "./constants.js";
import { getEnv } from "../env.js";
```

Add after the `VirtualFSTools` object (after line 57):

```ts
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
```

- [ ] **Step 2: Add `search` to `VirtualFSTools`**

Add inside the `VirtualFSTools` object, after the `write` method:

```ts
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
```

- [ ] **Step 3: Add `search` and `web_search` to `OpenRouterTools`**

Add these two entries to the `OpenRouterTools` array (after the `write` tool definition):

```ts
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
```

- [ ] **Step 4: Commit**

```bash
git add server/workspace-ai/tools.ts
git commit -m "feat(ai): add search and web_search tools"
```

---

### Task 5: Rewrite the system prompt

**Files:**
- Modify: `server/workspace-ai/prompt.ts`

- [ ] **Step 1: Rewrite `buildSystemPrompt` to accept scope and inject context**

Replace the entire file:

```ts
import type { AiScopeHint } from "./types.js";

export const buildSystemPrompt = (scope?: AiScopeHint) => {
    const sections: string[] = [];

    sections.push(`You are Kainbu AI, an assistant for this workspace.
You help users manage their boards (columns and tasks) and pages (notes).`);

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
        sections.push(`## Workspace overview
${s.columnCount} columns, ${s.taskCount} tasks, ${s.padCount} pages, ${s.memberCount} member(s).`);
    }

    sections.push(`## Tools
You have access to these tools:
1. read: Read a board or page to see its full content.
2. edit: Make a precise edit (find text -> replace text). Read first to ensure an exact match.
3. write: Create or overwrite a board or page entirely.
4. search: Search across all boards and pages for a keyword or phrase.
5. web_search: Search the web for external information.
6. bash: Run read-only commands (ls, grep, find, cat) in the workspace.`);

    sections.push(`## Guidelines
- Respond directly about what you can see in the current view.
- Use search to find content not visible in the current view.
- Use web_search when the user asks about external information.
- Always read a board or page before editing it to ensure exact match.
- Be concise and helpful.
- NEVER mention file names, file paths, file extensions, or directory paths to the user. Refer to content as boards, columns, tasks, or pages.`);

    return sections.join('\n\n');
};
```

- [ ] **Step 2: Commit**

```bash
git add server/workspace-ai/prompt.ts
git commit -m "feat(ai): rewrite system prompt with scope injection and domain language"
```

---

### Task 6: Update agent — scope, new tools, fallback fix, path stripping

**Files:**
- Modify: `server/workspace-ai/agent.ts`

- [ ] **Step 1: Rewrite `agent.ts`**

Replace the entire file:

```ts
import type { AiWorkspaceRequest, AiWorkspaceResponse } from "./types.js";
type OpenRouterMessage = any;
import { randomUUID } from "crypto";
import { buildSystemPrompt } from "./prompt.js";
import { VirtualFSTools, OpenRouterTools, webSearch } from "./tools.js";
import { materializeWorkspace, syncWorkspace } from "./sync.js";
import { WORKSPACE_AI_MODEL, WORKSPACE_AI_MAX_TOKENS } from "./constants.js";
import { getEnv } from "../env.js";

const fetchCompletion = async (messages: OpenRouterMessage[], useTools: boolean) => {
    const apiKey = getEnv("OPENROUTER_API_KEY", "");
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    const body: Record<string, unknown> = {
        model: WORKSPACE_AI_MODEL,
        max_tokens: WORKSPACE_AI_MAX_TOKENS,
        messages,
    };

    if (useTools) {
        body.tools = OpenRouterTools;
        body.tool_choice = "auto";
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://kainbu.test",
            "X-Title": "Kainbu"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("OpenRouter error: " + await res.text());
    return res.json();
};

const stripTempDir = (text: string, tempDir: string) =>
    text.replaceAll(tempDir + '/', '').replaceAll(tempDir, '');

export const handleWorkspaceAiRequest = async (
    req: AiWorkspaceRequest,
    auth: string | undefined,
    progressReporter?: (p: any) => void
): Promise<AiWorkspaceResponse> => {
    const tempDir = await materializeWorkspace(req.projectId);

    let messages: OpenRouterMessage[] = [
        { role: "system", content: buildSystemPrompt(req.scope) },
        ...req.history.map(m => ({ role: m.role, content: m.text } as OpenRouterMessage))
    ];

    let reply = "";
    let turns = 0;
    const maxTurns = 5;

    while (turns < maxTurns) {
        turns++;
        const response = await fetchCompletion(messages, true);
        const choice = response.choices[0];
        const message = choice.message;

        messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const call of message.tool_calls) {
                const name = call.function.name;
                const args = JSON.parse(call.function.arguments);
                let result = "";

                if (name === "read") {
                    result = await VirtualFSTools.read(args.filepath, args.startLine, args.endLine);
                } else if (name === "bash") {
                    result = await VirtualFSTools.bash(tempDir, args.command);
                } else if (name === "edit") {
                    result = await VirtualFSTools.edit(args.filepath, args.searchString, args.replaceString);
                } else if (name === "write") {
                    result = await VirtualFSTools.write(args.filepath, args.content);
                } else if (name === "search") {
                    result = await VirtualFSTools.search(tempDir, args.query);
                } else if (name === "web_search") {
                    result = await webSearch(args.query);
                } else {
                    result = `Unknown tool: ${name}`;
                }

                result = stripTempDir(result, tempDir);

                messages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: result
                });
            }
        } else {
            reply = message.content;
            break;
        }
    }

    // If the model exhausted turns without a text reply, ask for a summary
    if (!reply) {
        messages.push({
            role: "system",
            content: "Summarize what you did and respond to the user. Do not mention file names, file paths, or extensions."
        });
        const summaryResponse = await fetchCompletion(messages, false);
        reply = summaryResponse.choices?.[0]?.message?.content || "I made changes to your workspace.";
    }

    // Sanitize the final reply
    reply = stripTempDir(reply, tempDir);

    await syncWorkspace(req.projectId, tempDir);

    return {
        reply,
        model: WORKSPACE_AI_MODEL,
        latencyMs: 0,
        requestId: randomUUID(),
        proposals: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        highlightedTaskIds: [],
        annotations: [],
        toolActions: []
    } as any;
};
```

- [ ] **Step 2: Commit**

```bash
git add server/workspace-ai/agent.ts
git commit -m "feat(ai): pass scope to prompt, dispatch new tools, fix fallback, strip paths"
```

---

### Task 7: Verify the full chain compiles

**Files:** None (verification only)

- [ ] **Step 1: Check TypeScript compilation**

Run: `npx tsc --noEmit`

Expected: No new type errors related to the changed files. Fix any that appear.

- [ ] **Step 2: Verify the server imports resolve**

Run: `node -e "import('./server/workspace-ai/index.ts')"` or check that the Hono app starts without import errors.

- [ ] **Step 3: Commit any type fixes**

```bash
git add -A
git commit -m "fix(ai): resolve type errors from pipeline changes"
```

---

## Summary of changes

| File | What changed |
|------|-------------|
| `src/lib/kainbu/types.ts` | Added `activeViewContent` to `AiScopeHint` |
| `src/routes/+page.svelte` | Added `serializeActiveView`, wired into AI request |
| `server/workspace-ai/constants.ts` | Added `WORKSPACE_AI_WEB_SEARCH_MODEL`, `WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS` |
| `server/workspace-ai/tools.ts` | Added `webSearch()`, `VirtualFSTools.search()`, two new tool defs |
| `server/workspace-ai/prompt.ts` | Full rewrite — accepts scope, domain language, no file leaks |
| `server/workspace-ai/agent.ts` | Full rewrite — scope to prompt, new tool dispatch, fallback fix, path stripping |
