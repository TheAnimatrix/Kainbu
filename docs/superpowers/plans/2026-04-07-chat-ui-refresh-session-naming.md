# Chat UI Refresh + Automatic Session Naming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten the ChatPane UI toward a cleaner aesthetic (single-row header, reduced rounding, simpler composer) and add an AI-powered session auto-naming endpoint.

**Architecture:** Two independent workstreams — (1) pure CSS/markup changes in `ChatPane.svelte` and (2) a new Vercel serverless function + client integration for session title generation. The UI changes touch only `ChatPane.svelte`. The auto-naming adds one new API file, one new client function, and a small hook in `+page.svelte`.

**Tech Stack:** Svelte 4, Tailwind CSS, Vercel serverless functions (plain JS), OpenRouter API.

---

### Task 1: ChatPane Header — Collapse to Single Row

**Files:**

- Modify: `src/lib/components/ChatPane.svelte:525-619` (header section)

- [ ] **Step 1: Replace the two-row header with a single row**

Replace the current header block (lines 525–620) with this single-row layout:

```svelte
<header
    class={`flex items-center gap-2 border-b border-app-border ${
        isMobileChrome ? 'px-3 py-2' : 'px-4 py-2.5'
    }`}
>
    <select
        class={`min-w-0 flex-1 truncate rounded-md border border-app-border bg-app-bg text-app-text outline-none ${
            isMobileChrome ? 'max-w-[10rem] px-2 py-1 text-[12px]' : 'max-w-[14rem] px-2.5 py-1.5 text-sm'
        }`}
        value={activeSessionId}
        on:change={(event) => onSessionChange((event.currentTarget as HTMLSelectElement).value)}
    >
        {#each sessions as session}
            <option value={session.id}>{session.title}</option>
        {/each}
    </select>

    <div class={`ml-auto flex items-center ${isMobileChrome ? 'gap-1' : 'gap-1.5'}`}>
        <button
            type="button"
            class={`rounded-md text-app-subtext transition hover:text-app-text ${
                isMobileChrome ? 'p-1' : 'p-1.5'
            }`}
            on:click={onCreateSession}
            title="New chat"
            aria-label="New chat"
        >
            <Plus size={16} />
        </button>

        <button
            type="button"
            disabled={!activeSession}
            class={`rounded-md text-app-subtext transition hover:text-app-text disabled:cursor-not-allowed disabled:opacity-45 ${
                isMobileChrome ? 'p-1' : 'p-1.5'
            }`}
            on:click={requestSessionRename}
            title="Rename chat"
            aria-label="Rename chat"
        >
            <Pencil size={16} />
        </button>

        <button
            type="button"
            disabled={!activeSession}
            class={`rounded-md text-app-subtext transition hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-45 ${
                isMobileChrome ? 'p-1' : 'p-1.5'
            }`}
            on:click={requestSessionDelete}
            title="Delete chat"
            aria-label="Delete chat"
        >
            <Trash2 size={16} />
        </button>

        <div class="mx-0.5 h-4 w-px bg-app-border"></div>

        <select
            class={`rounded-md border border-app-border bg-app-bg text-app-text outline-none ${
                isMobileChrome ? 'px-2 py-1 text-[12px]' : 'px-2.5 py-1.5 text-sm'
            }`}
            value={modelId}
            on:change={(event) => onModelChange((event.currentTarget as HTMLSelectElement).value)}
        >
            {#each modelOptions as option}
                <option value={option.id}>{option.id}</option>
            {/each}
        </select>

        {#if isSidebar && onCollapseSidebar}
            <button
                type="button"
                class={`rounded-md text-app-subtext transition hover:text-app-text ${
                    isMobileChrome ? 'p-1' : 'p-1.5'
                }`}
                on:click={onCollapseSidebar}
                title="Collapse AI sidebar"
                aria-label="Collapse AI sidebar"
            >
                <X size={16} />
            </button>
        {/if}
    </div>
</header>
```

- [ ] **Step 2: Remove the `onClearHistory` prop and related imports**

The clear history button is removed. In the `<script>` section, remove the prop:

```
// Remove this line:
export let onClearHistory: () => void;
```

- [ ] **Step 3: Verify the header renders correctly**

Run the dev server and confirm:
- Single row with session dropdown on left, icon buttons + model selector on right
- Buttons have no border, just icon with hover color change
- Divider separates session controls from model selector
- Collapse button only shows in sidebar mode

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ChatPane.svelte
git commit -m "refactor(chat): collapse header to single row, remove clear history button"
```

---

### Task 2: ChatPane Messages — Flatten Styling

**Files:**

- Modify: `src/lib/components/ChatPane.svelte:642-884` (message list section)

- [ ] **Step 1: Update vertical spacing**

Change the message list container from `space-y-4` to `space-y-3`:

```svelte
<!-- Before -->
<div class={`${isMobileChrome ? 'space-y-3' : 'space-y-4'}`}>

<!-- After -->
<div class={`${isMobileChrome ? 'space-y-2.5' : 'space-y-3'}`}>
```

- [ ] **Step 2: Flatten user message bubbles**

Replace the user message class block (around line 671–675):

```svelte
<!-- Before -->
class={message.role === 'user'
    ? `max-w-[96%] border shadow-sm ${
            isMobileChrome ? 'rounded-[1rem] px-3 py-2.5' : 'rounded-[1.2rem] px-3.5 py-3'
        } rounded-tr-md border-app-primary/25 bg-app-primary/10 text-app-text`
    : `max-w-[min(100%,46rem)] text-app-text ${
            isMobileChrome ? 'px-0 py-0' : 'px-0 py-0'
        }`}

<!-- After -->
class={message.role === 'user'
    ? `max-w-[96%] border ${
            isMobileChrome ? 'rounded-lg px-3 py-2.5' : 'rounded-lg px-3.5 py-3'
        } border-app-border bg-app-element text-app-text`
    : `max-w-[min(100%,46rem)] text-app-text ${
            isMobileChrome ? 'px-0 py-0' : 'px-0 py-0'
        }`}
```

Key changes: `rounded-[1.2rem]` → `rounded-lg`, removed `rounded-tr-md`, removed `shadow-sm`, `border-app-primary/25` → `border-app-border`, `bg-app-primary/10` → `bg-app-element`.

- [ ] **Step 3: Flatten task cards in messages**

Update inline task card rounding (around line 683):

```svelte
<!-- Before -->
class="w-[14rem] shrink-0 rounded-[1rem] border border-app-border bg-app-surface/85 px-3 py-2.5"

<!-- After -->
class="w-[14rem] shrink-0 rounded-lg border border-app-border bg-app-surface/85 px-3 py-2.5"
```

- [ ] **Step 4: Flatten attachment cards in messages**

Update image attachment button (around line 727):

```svelte
<!-- Before -->
class="flex w-full items-center gap-3 rounded-[1rem] border border-app-border bg-app-surface/85 px-3 py-2.5 text-left transition hover:border-app-primary/35 hover:bg-app-surface"

<!-- After -->
class="flex w-full items-center gap-3 rounded-lg border border-app-border bg-app-surface/85 px-3 py-2.5 text-left transition hover:border-app-primary/35 hover:bg-app-surface"
```

Update image thumbnail (around line 734):

```svelte
<!-- Before -->
class="h-14 w-14 shrink-0 rounded-2xl border border-app-border object-cover"

<!-- After -->
class="h-14 w-14 shrink-0 rounded-lg border border-app-border object-cover"
```

Update text attachment card (around line 754):

```svelte
<!-- Before -->
class="flex items-center gap-3 rounded-[1rem] border border-app-border bg-app-surface/85 px-3 py-2.5"

<!-- After -->
class="flex items-center gap-3 rounded-lg border border-app-border bg-app-surface/85 px-3 py-2.5"
```

Update text attachment icon container (around line 757):

```svelte
<!-- Before -->
class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-element text-app-subtext"

<!-- After -->
class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-element text-app-subtext"
```

- [ ] **Step 5: Subdue metadata line**

Update the metadata styling (around line 860):

```svelte
<!-- Before -->
class={`mt-3 flex flex-wrap items-center gap-2 text-app-subtext ${
    isMobileChrome ? 'text-[10px]' : 'text-[11px]'
}`}

<!-- After -->
class={`mt-2 flex flex-wrap items-center gap-2 text-app-subtext/50 ${
    isMobileChrome ? 'text-[10px]' : 'text-[10px]'
}`}
```

- [ ] **Step 6: Verify message styling**

Run the dev server and confirm:
- User messages have `rounded-lg`, neutral border, `bg-app-element` background
- Task cards and attachment cards have `rounded-lg`
- Thumbnails have `rounded-lg`
- Metadata is smaller and more subdued
- Spacing is tighter

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/ChatPane.svelte
git commit -m "refactor(chat): flatten message bubbles, reduce rounding, tighten spacing"
```

---

### Task 3: ChatPane Composer — Simplify

**Files:**

- Modify: `src/lib/components/ChatPane.svelte:968-1147` (composer section)

- [ ] **Step 1: Remove the form wrapper box styling**

Replace the form class (around line 974–976):

```svelte
<!-- Before -->
class={isMobileChrome
    ? 'space-y-2'
    : 'relative rounded-[1.2rem] border border-app-border bg-app-bg px-3 pb-3 pt-3'}

<!-- After -->
class={isMobileChrome
    ? 'space-y-2'
    : 'space-y-0'}
```

- [ ] **Step 2: Reduce send button size**

Replace the send button (around line 1128–1143):

```svelte
<!-- Before -->
class={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-app-primary text-white transition ${
    canSendMessage()
        ? 'hover:-translate-y-0.5 hover:bg-app-primary-hover'
        : 'cursor-not-allowed opacity-50'
}`}

<!-- After -->
class={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-app-primary text-white transition ${
    canSendMessage()
        ? 'hover:bg-app-primary-hover'
        : 'cursor-not-allowed opacity-50'
}`}
```

Also reduce icon sizes inside from `size={16}` to `size={14}`.

- [ ] **Step 3: Flatten queued task cards in composer**

Update queued task card rounding (around line 985–986):

```svelte
<!-- Before -->
class={`relative shrink-0 rounded-[1rem] border border-app-border bg-app-surface/90 ${
    isMobileChrome ? 'w-[12.5rem] px-2.5 py-2' : 'w-[13.5rem] px-3 py-2.5'
}`}

<!-- After -->
class={`relative shrink-0 rounded-lg border border-app-border bg-app-surface/90 ${
    isMobileChrome ? 'w-[12.5rem] px-2.5 py-2' : 'w-[13.5rem] px-3 py-2.5'
}`}
```

- [ ] **Step 4: Flatten queued attachment cards in composer**

Update queued attachment card (around line 1029):

```svelte
<!-- Before -->
class="relative flex items-center gap-3 rounded-[1rem] border border-app-border bg-app-surface/90 px-3 py-2.5 pr-10"

<!-- After -->
class="relative flex items-center gap-3 rounded-lg border border-app-border bg-app-surface/90 px-3 py-2.5 pr-10"
```

Update the image thumbnail in queued attachments (around line 1041):

```svelte
<!-- Before -->
class="h-14 w-14 shrink-0 rounded-2xl border border-app-border object-cover"

<!-- After -->
class="h-14 w-14 shrink-0 rounded-lg border border-app-border object-cover"
```

Update the text file icon container in queued attachments (around line 1057):

```svelte
<!-- Before -->
class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-element text-app-subtext"

<!-- After -->
class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-element text-app-subtext"
```

- [ ] **Step 5: Verify composer**

Run the dev server and confirm:
- Composer has no box/border wrapper on desktop (just sits in the padded footer)
- Send button is smaller (h-8 w-8)
- Queued cards have rounded-lg
- Mobile still works correctly

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ChatPane.svelte
git commit -m "refactor(chat): simplify composer, remove wrapper box, reduce rounding"
```

---

### Task 4: ChatPane Proposal Cards — Flatten

**Files:**

- Modify: `src/lib/components/ChatPane.svelte:903-963` (proposal section)

- [ ] **Step 1: Reduce proposal card rounding**

Update the outer proposal card (around line 904):

```svelte
<!-- Before -->
class="rounded-[1.1rem] border border-app-primary/25 bg-app-primary/10 p-3.5"

<!-- After -->
class="rounded-lg border border-app-primary/25 bg-app-primary/10 p-3.5"
```

- [ ] **Step 2: Reduce proposal button rounding**

Update the three action buttons (Review, Commit, Discard) — around lines 938, 948, 956:

```svelte
<!-- Before (each button) -->
class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl ..."

<!-- After (each button) -->
class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg ..."
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ChatPane.svelte
git commit -m "refactor(chat): flatten proposal card rounding"
```

---

### Task 5: Remove `onClearHistory` from Parent Pages

**Files:**

- Modify: `src/routes/+page.svelte` — remove `onClearHistory` prop usage and `handleClearHistory` function

- [ ] **Step 1: Remove `handleClearHistory` function**

Delete the `handleClearHistory` function (around lines 2511–2529 in `+page.svelte`):

```typescript
// DELETE this entire function:
const handleClearHistory = () => {
    if (!currentProject) return;
    if (!window.confirm(`Clear your private AI chat for "${currentProject.name}"?`)) return;
    // ... rest of the function
};
```

- [ ] **Step 2: Remove `onClearHistory` prop from ChatPane usages**

There are two ChatPane instances in `+page.svelte`. Remove the `onClearHistory={handleClearHistory}` prop from both (around lines 3850 and 4131):

```svelte
<!-- Remove this line from both ChatPane instances -->
onClearHistory={handleClearHistory}
```

- [ ] **Step 3: Verify no broken references**

Run: `npx svelte-check` or the dev server to confirm no compilation errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte src/lib/components/ChatPane.svelte
git commit -m "refactor(chat): remove clear history button and handler"
```

---

### Task 6: Session Title Generation — Server Endpoint

**Files:**

- Create: `api/workspace-ai/session-title.js`

- [ ] **Step 1: Create the session-title endpoint**

Create `api/workspace-ai/session-title.js`:

```javascript
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store'
};

const json = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });

const sendJson = (res, payload, status = 200) => {
    if (res && typeof res.status === 'function' && typeof res.json === 'function') {
        for (const [key, value] of Object.entries(corsHeaders)) {
            res.setHeader(key, value);
        }
        res.setHeader('Content-Type', 'application/json');
        return res.status(status).json(payload);
    }

    return json(payload, status);
};

const sendEmpty = (res, status = 204) => {
    if (res && typeof res.status === 'function' && typeof res.end === 'function') {
        for (const [key, value] of Object.entries(corsHeaders)) {
            res.setHeader(key, value);
        }
        return res.status(status).end();
    }

    return new Response(null, {
        status,
        headers: corsHeaders
    });
};

const getHeader = (request, name) => {
    if (typeof request.headers?.get === 'function') {
        return request.headers.get(name) || undefined;
    }

    const key = name.toLowerCase();
    return request.headers?.[key] || request.headers?.[name] || undefined;
};

const readJsonBody = async (request) => {
    if (typeof request.json === 'function') {
        return await request.json();
    }

    if (typeof request.body === 'string') {
        return request.body.trim() ? JSON.parse(request.body) : {};
    }

    if (request.body && typeof request.body === 'object') {
        return request.body;
    }

    return await new Promise((resolve, reject) => {
        let raw = '';

        request.on('data', (chunk) => {
            raw += chunk;
        });
        request.on('end', () => {
            try {
                resolve(raw.trim() ? JSON.parse(raw) : {});
            } catch (error) {
                reject(error);
            }
        });
        request.on('error', reject);
    });
};

const SESSION_TITLE_MODEL = 'openai/gpt-oss-safeguard-20b';
const SESSION_TITLE_MAX_TOKENS = 20;
const SESSION_TITLE_SYSTEM_PROMPT =
    'Generate a short title (3-6 words) for this conversation. Return only the title, no quotes or punctuation.';

let envModulePromise;

const getOpenRouterKey = async () => {
    envModulePromise ||= import('../../server/env.js');
    const envModule = await envModulePromise;
    const getEnv = envModule.getEnv || envModule.default?.getEnv;
    if (typeof getEnv !== 'function') {
        throw new Error('Unable to load environment configuration.');
    }
    const key = getEnv('OPENROUTER_API_KEY', '');
    if (!key) throw new Error('Missing OPENROUTER_API_KEY');
    return key;
};

const generateTitle = async (userMessage, assistantReply) => {
    const apiKey = await getOpenRouterKey();

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://kainbu.test',
            'X-Title': 'Kainbu'
        },
        body: JSON.stringify({
            model: SESSION_TITLE_MODEL,
            max_tokens: SESSION_TITLE_MAX_TOKENS,
            messages: [
                { role: 'system', content: SESSION_TITLE_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `User: ${userMessage}\n\nAssistant: ${assistantReply}`
                }
            ]
        })
    });

    if (!res.ok) {
        throw new Error('OpenRouter error: ' + (await res.text()));
    }

    const data = await res.json();
    const title = (data.choices?.[0]?.message?.content || '').trim();
    return title;
};

const postHandler = async (request, res) => {
    const authorization = getHeader(request, 'Authorization');

    if (!authorization) {
        return sendJson(res, { error: 'Unauthorized' }, 401);
    }

    try {
        const body = await readJsonBody(request);
        const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
        const assistantReply = typeof body.assistantReply === 'string' ? body.assistantReply.trim() : '';

        if (!userMessage) {
            return sendJson(res, { error: 'userMessage is required' }, 400);
        }

        const title = await generateTitle(userMessage, assistantReply);

        if (!title || title.length > 60) {
            return sendJson(res, { title: '' });
        }

        return sendJson(res, { title });
    } catch (error) {
        console.error('Session title generation failed:', error);
        return sendJson(res, { title: '' });
    }
};

const handler = async (request, res) => {
    if (request.method === 'OPTIONS') {
        if (res) {
            return sendEmpty(res, 204);
        }
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'POST') {
        return postHandler(request, res);
    }

    return sendJson(res, { error: 'Method Not Allowed' }, 405);
};

export default handler;
export const POST = postHandler;
export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
export const GET = (request, res) => sendJson(res, { error: 'Method Not Allowed' }, 405);
export const HEAD = () => new Response(null, { status: 405, headers: corsHeaders });
```

- [ ] **Step 2: Verify the endpoint loads**

Start the dev server and test with curl:

```bash
curl -X POST http://localhost:3000/api/workspace-ai/session-title \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"userMessage":"Help me plan a birthday party","assistantReply":"Sure! Let me help you plan..."}'
```

Expected: `{"title":"Birthday Party Planning"}` (or similar 3-6 word title).

- [ ] **Step 3: Commit**

```bash
git add api/workspace-ai/session-title.js
git commit -m "feat(ai): add session title generation endpoint"
```

---

### Task 7: Session Title Generation — Client Function

**Files:**

- Modify: `src/lib/kainbu/ai.ts` — add `generateSessionTitle` function

- [ ] **Step 1: Add the client function**

Add at the end of `src/lib/kainbu/ai.ts`:

```typescript
export const generateSessionTitle = async (
    userMessage: string,
    assistantReply: string
): Promise<string> => {
    try {
        const accessToken = await getWorkspaceApiAccessToken();
        const response = await fetch(
            resolveWorkspaceApiUrl('/api/workspace-ai/session-title'),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`
                },
                body: JSON.stringify({ userMessage, assistantReply })
            }
        );

        if (!response.ok) return '';

        const data = (await response.json()) as { title?: string };
        const title = (data.title || '').trim();
        return title.length > 0 && title.length <= 60 ? title : '';
    } catch {
        return '';
    }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kainbu/ai.ts
git commit -m "feat(ai): add generateSessionTitle client function"
```

---

### Task 8: Session Title Generation — Integration in +page.svelte

**Files:**

- Modify: `src/routes/+page.svelte` — hook auto-naming into `submitAiTurn`

- [ ] **Step 1: Import `generateSessionTitle`**

Add to the existing import from `$lib/kainbu/ai`:

```typescript
import { invokeWorkspaceAi, generateSessionTitle } from '$lib/kainbu/ai';
```

- [ ] **Step 2: Import `isDefaultAiSessionTitle`**

Confirm this is already imported (it's used at line 3025). If not, add it:

```typescript
import { isDefaultAiSessionTitle, ... } from '$lib/kainbu/aiSessions';
```

- [ ] **Step 3: Add the auto-naming hook after the assistant message is appended**

In `submitAiTurn`, after the `updateProjectLocal` call that appends the assistant message (around line 3116–3123) and before the `scheduleChatSync` call, add the auto-naming logic:

```typescript
// After line 3123 (scheduleChatSync), add:

// Fire-and-forget auto-naming for sessions with default titles
if (isDefaultAiSessionTitle(activeSessionSnapshot.title)) {
    generateSessionTitle(displayText, response.reply).then((generatedTitle) => {
        if (!generatedTitle) return;
        const freshProject = projects.find((p) => p.id === projectSnapshot.id);
        if (!freshProject) return;
        const freshSession = freshProject.aiSessions.find(
            (s) => s.id === activeSessionSnapshot.id
        );
        if (!freshSession || !isDefaultAiSessionTitle(freshSession.title)) return;
        handleRenameAiSession(activeSessionSnapshot.id, generatedTitle);
    });
}
```

This fires after the response is processed, doesn't block the UI, and guards against race conditions (checks the session still has a default title before applying).

- [ ] **Step 4: Verify the flow end-to-end**

1. Create a new session (title shows "New chat")
2. Send a message like "Help me plan a marketing campaign"
3. Wait for the AI response
4. Observe the session dropdown title updates to something like "Marketing Campaign Planning"

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(ai): auto-name sessions after first exchange"
```
