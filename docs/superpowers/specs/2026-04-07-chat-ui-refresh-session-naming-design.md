# Chat UI Refresh + Automatic Session Naming

**Date:** 2026-04-07
**Scope:** ChatPane UI overhaul, automatic session title generation endpoint

## 1. Chat UI Refresh

### 1.1 Header — Single Row

**Current:** Two rows of controls (session row + model/actions row). Pill-shaped buttons.

**Change:** Collapse into one row.

- **Left:** Session `<select>` dropdown (minimal styling, no rounded-full pill — use `rounded-md` with smaller padding)
- **Right:** Icon buttons in a tight group:
  - `+` new session
  - Pencil rename session
  - Trash delete session
  - Model `<select>` dropdown (compact, `rounded-md`)
  - `X` collapse sidebar (when `isSidebar`)
- **Remove:** The separate "Clear history" trash button. Session delete covers this. If user wants a fresh start, they create a new session.

Styling: buttons use `rounded-md` instead of `rounded-full`. Smaller padding (`p-1.5` desktop, `p-1` mobile). No border on icon buttons — just `text-app-subtext hover:text-app-text` for a cleaner look. Dropdowns get `border-app-border bg-app-bg` (recessed, not raised).

### 1.2 Messages

**User messages:**
- Reduce rounding: `rounded-lg` (from `rounded-[1.2rem]`)
- Remove the `rounded-tr-md` override
- Border: `border-app-border` (from `border-app-primary/25`)
- Background: `bg-app-element` (from `bg-app-primary/10`)
- Keep `max-w-[96%]` and right-alignment

**Assistant messages:**
- Already unstyled document-flow — keep as-is
- Ensure `kainbu-prose` renders cleanly at current sizes

**Vertical spacing:**
- `space-y-3` (from `space-y-4`)

**Metadata line:**
- `text-[10px] text-app-subtext/50` (more subdued)

**Task cards in messages:**
- Reduce rounding on inline task cards: `rounded-lg` (from `rounded-[1rem]`)

**Attachment cards in messages:**
- Reduce rounding: `rounded-lg` (from `rounded-[1rem]`)
- Image thumbnail: `rounded-lg` (from `rounded-2xl`)

### 1.3 Composer

**Current:** Wrapped in a `rounded-[1.2rem]` bordered container with background.

**Change:** Remove the enclosing box. The composer area is just the bottom section with the top border already provided by the parent. Textarea sits directly in the padded area with no extra container.

- Remove: `rounded-[1.2rem] border border-app-border bg-app-bg` wrapper on the `<form>`
- Textarea: `bg-transparent` (already), sits in the `px-4 py-3` padded footer
- Send button: keep round (`rounded-full`) but reduce to `h-8 w-8` (from `h-10 w-10`)
- Attachment button: stays as-is (icon-only, no border)

**Queued attachments/task cards in composer:**
- Reduce rounding to `rounded-lg` to match message cards

### 1.4 Empty State

Keep the centered brand mark + "KAINBU AI" + "Awaiting instructions" pattern. No change here since greeting generation was not requested.

### 1.5 Processing Indicator

Keep existing shimmer pattern. No change.

### 1.6 Proposal Cards

- Reduce outer rounding: `rounded-lg` (from `rounded-[1.1rem]`)
- Inner buttons: `rounded-lg` (from `rounded-xl`)

## 2. Automatic Session Naming

### 2.1 Server Endpoint

**New endpoint:** `POST /api/workspace-ai/session-title`

**Request body:**
```json
{
  "userMessage": "string (first user message text)",
  "assistantReply": "string (first assistant reply text)"
}
```

**Response:**
```json
{
  "title": "string (3-6 word session title)"
}
```

**Implementation:**
- Located in `api/workspace-ai/session-title.js` (Vercel serverless function, same pattern as `api/workspace-ai/stream.js`)
- Calls OpenRouter with model `openai/gpt-oss-safeguard-20b`
- System prompt: `"Generate a short title (3-6 words) for this conversation. Return only the title, no quotes or punctuation."`
- User message: first user message + assistant reply concatenated
- Max tokens: 20
- No tool use, no streaming
- Auth: same bearer token auth as other workspace-ai endpoints

### 2.2 Client Integration

**When to call:**
- After the first AI response is received in a session
- Only if the session title is still the default (e.g. "New Chat" or matches a generated-at-creation pattern)
- Fire-and-forget — don't block the UI

**Flow:**
1. `handleSendMessage` completes and appends the assistant reply
2. Check: is this the session's first exchange? Is the title still default?
3. If yes, call `POST /api/workspace-ai/session-title` in the background
4. On success, call `onRenameSession(sessionId, title)` to update

**Client function:** Add `generateSessionTitle(userMessage: string, assistantReply: string): Promise<string>` in `src/lib/kainbu/ai.ts` (or a new file if preferred).

### 2.3 Error Handling

- If the title generation fails, silently keep the default name. No error toast, no retry.
- If the response is empty or too long (>60 chars), keep the default name.

## 3. Files Changed

### UI Refresh
- `src/lib/components/ChatPane.svelte` — header, message, composer, proposal styling

### Session Naming
- `api/workspace-ai/session-title.js` (or `server/workspace-ai/session-title.ts`) — new endpoint
- `src/lib/kainbu/ai.ts` — add `generateSessionTitle` client function
- `src/routes/+page.svelte` — integrate auto-naming after first AI response

## 4. Not In Scope

- Greeting generation / seed message changes
- Session reordering or pinning
- Model-specific prompt adjustments
- Mobile-specific layout overhaul (mobile gets same changes, scaled down)
