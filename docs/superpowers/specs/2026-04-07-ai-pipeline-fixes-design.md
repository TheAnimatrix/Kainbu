# AI Pipeline Fixes — Design Spec

## Problem

The workspace AI has five issues:

1. **Misbehaving** — returns "I have completed your request" without doing anything useful. Caused by dummy materialization data and a hardcoded fallback reply.
2. **Leaks virtual file view** — system prompt mentions `.kanban` and `.md` files; the AI parrots these to users.
3. **No awareness of current view** — `req.scope` (currentTab, activeBoardId, activePadId, etc.) is sent by the client but ignored by the server.
4. **No web search** — no tool for the AI to search the web.
5. **No dedicated search** — the AI has grep via bash but no guided search tool.

## Approach

Prompt-first with minimal architecture change. The virtual FS stays for mutations. The AI gets context upfront via the system prompt.

---

## 1. Scope Enrichment (Client)

### Changes to `AiScopeHint` in `types.ts`

Add:

```ts
activeViewContent?: {
  kind: 'board' | 'page' | 'none';
  name: string;
  content: string;
};
```

### Changes to `+page.svelte`

When building the AI request, serialize the active view based on `currentTab`:

- **`kanban`** — find the active board via `activeBoardId`. Serialize as:
  ```
  Board: "Sprint 3"
  [Todo] Task A, Task B
  [In Progress] Task C
  [Done] Task D, Task E
  ```
  Include task descriptions if short. Trim total to ~3000 chars.

- **`scratchpad`** — find the active pad via `activePadId`. Serialize as:
  ```
  Page: "Meeting Notes"
  <first ~2000 chars of content>
  ```

- **Other tabs** — `{ kind: 'none', name: currentTab, content: '' }`

---

## 2. System Prompt Rewrite

### Changes to `prompt.ts`

`buildSystemPrompt()` becomes `buildSystemPrompt(scope: AiScopeHint)`.

The prompt:
- Never mentions file names, file extensions, or file paths
- Describes the workspace in domain terms: boards, columns, tasks, pages
- Injects the active view name and trimmed content from `scope.activeViewContent`
- Injects workspace summary from `scope.workspaceSummary`
- Describes tools in domain terms ("search across your workspace" not "run grep")
- Includes a hard rule: "Never mention file names, paths, or extensions to the user"

### Prompt structure

```
You are Kainbu AI, an assistant for this workspace.

## Current view
The user is on the {currentTab} tab, viewing {kind} "{name}":
{trimmed content}

## Workspace overview
{columnCount} columns, {taskCount} tasks, {padCount} pages, {memberCount} members.

## Tools
- read: Read a board or page by name.
- edit: Make a precise edit to a board or page (find & replace).
- write: Create or overwrite a board or page.
- search: Search across all boards and pages for a keyword.
- web_search: Search the web for information.

## Guidelines
- Respond directly about what you can see in the current view.
- Use search to find content not visible in the current view.
- Use web_search when the user asks about external information.
- Never mention file names, file paths, or file extensions to the user.
- Always read a board or page before editing it.
- Be concise.
```

---

## 3. Web Search Tool

### New tool: `web_search`

Added to `tools.ts` and `OpenRouterTools`.

```ts
{
  name: "web_search",
  description: "Search the web for information. Returns a text summary.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" }
    },
    required: ["query"]
  }
}
```

### Implementation in `tools.ts`

New function `webSearch(query: string): Promise<string>`:
- Makes a chat completion call to OpenRouter using an `:online` model (e.g. `openai/gpt-4o-mini-search-preview`)
- System prompt: "Search the web for the following query and return a concise summary of the results."
- User message: the query
- Returns the model's response text
- On error: returns `"Web search failed: {message}"`
- Uses a separate constant `WORKSPACE_AI_WEB_SEARCH_MODEL` in `constants.ts`

### Dispatch in `agent.ts`

Add `web_search` to the tool dispatch switch:
```ts
} else if (name === "web_search") {
    result = await webSearch(args.query);
}
```

---

## 4. Search Tool

### New tool: `search`

Added to `tools.ts` and `OpenRouterTools`.

```ts
{
  name: "search",
  description: "Search across all boards and pages in the workspace for a keyword or phrase.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search term" }
    },
    required: ["query"]
  }
}
```

### Implementation in `tools.ts`

Wraps `grep -ri "{query}" {dir}` via `execAsync`. Strips the temp dir prefix from output, replacing with just the filename. Limits output to 2000 chars.

### Dispatch in `agent.ts`

```ts
} else if (name === "search") {
    result = await VirtualFSTools.search(tempDir, args.query);
}
```

---

## 5. Fix Fallback Reply

### Changes to `agent.ts`

Current behavior: if the model does only tool calls and exhausts `maxTurns`, the hardcoded `"I have completed your request."` is returned.

New behavior: after the tool loop ends (either by turn limit or by the model not producing a text reply), append a system message:

```
"Summarize what you did and respond to the user. Do not mention file names or paths."
```

Make one final completion call (no tools) to get a proper text reply. Use this as the response.

---

## 6. Path Stripping (No-Leak Guard)

### Changes to `agent.ts`

After each tool call returns a result, replace occurrences of the temp directory path with empty string. This prevents the model from seeing or echoing absolute paths like `/tmp/kainbu-workspace-abc123-xyz/`.

```ts
result = result.replaceAll(tempDir + '/', '').replaceAll(tempDir, '');
```

Additionally, sanitize the final reply before returning to the client — strip any residual temp dir path that leaked through.

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/kainbu/types.ts` | Add `activeViewContent` to `AiScopeHint` |
| `src/routes/+page.svelte` | Serialize active view into scope |
| `server/workspace-ai/prompt.ts` | Rewrite to accept scope, hide file abstractions |
| `server/workspace-ai/tools.ts` | Add `webSearch` function, `search` function, update `OpenRouterTools` |
| `server/workspace-ai/agent.ts` | Pass scope to prompt, dispatch new tools, fix fallback, strip paths |
| `server/workspace-ai/constants.ts` | Add `WORKSPACE_AI_WEB_SEARCH_MODEL` |
