# Agentic workspace foundation

Status: proposed design, 2026-09-25. This document addresses the 20 user-facing issues discussed in this task. It does not change application behavior yet.

## Product behavior

An agent carries out an authorized workspace action and the result appears in the board or page. Its chat turn includes a quiet line such as **Changes · 2 cards updated, 1 moved · Undo**. Clicking **Changes** reveals the exact fields and entities changed. The small **Undo** control on that line reverses that action if its touched fields have not since been changed by someone else. The existing compact strip in `ChatPane.svelte` is the starting surface; ordinary actions do not require a review panel before they run.

The line has explicit states: **Applying**, **Applied**, **Unable to apply**, **Undoing**, **Undone**, and **Conflict**. Only a server receipt may produce **Applied** or **Undone**. If a command cannot be applied, the user's draft and the agent's intended action remain available for a targeted retry or resolution. The change description is produced from committed operations, never from the agent's prose or a separate preview diff.

Human board edits, agent tools, and the CLI use the same action API. A turn that changes several resources may show one compact line per committed action, grouped under the turn. Each line keeps its own fixed target and Undo. A change to board B cannot supersede an unfinished change to board A.

## One action contract

The core primitive is a versioned, server-authoritative action:

```ts
type WorkspaceActionRequest = {
  actionId: string;           // stable idempotency key, allocated once
  groupId?: string;           // ties actions to one agent turn or user gesture
  target: { projectId: string; boardId?: string; pageId?: string };
  baseProjectSeq: number;     // ordering hint, not a whole-board overwrite license
  operations: WorkspaceOperation[];
};

type WorkspaceActionReceipt = {
  actionId: string;
  actorId: string;            // authenticated server-side
  projectSeq: number;         // monotonically assigned at commit
  changes: CommittedChange[]; // canonical before/after for touched fields
  inverse: WorkspaceOperation[];
  affectedResources: string[];
};
```

Operations express intent: create a task, set specified task fields, move a task to an existing column, link or unlink tasks, reorder columns, edit a page block, or trash/restore an entity. Each operation names stable IDs and carries preconditions for the fields or structure it touches. The server rejects malformed IDs and unknown fields. A pure, lossless domain codec includes links, assignments, due dates, ordering, and deletion state. A shared schema and reducer are bundled for the PocketBase transaction hook and tested against browser and server adapters; independent record mappers cannot invent different defaults.

The PocketBase transaction authenticates the actor, checks project membership and target identity, deduplicates `actionId`, validates parent columns and link endpoints, checks touched-field preconditions, applies all operations, records the receipt and inverse, and increments the project sequence. It returns the committed patch and sequence. An identical retry returns the same receipt. A reused ID with a different payload fails. An action touching several resources in one project commits together; a cross-project turn uses separately identified actions and reports any partial completion honestly.

The invariants are:

1. **Committed effect equals described effect.** Applying an empty operation list changes nothing. Every committed semantic field appears in the receipt and Changes details.
2. **Identity is immutable.** Project, board, page, task, and agent-session IDs are fixed when work begins; navigation cannot supply a missing target.
3. **Every live entity has valid parents and references.** A task cannot be committed into a deleted or foreign column; links cannot point to invalid tasks.
4. **Unrelated edits commute.** Editing a title may merge with a teammate's description edit. Competing title edits produce a structured conflict containing current and intended values.
5. **Acknowledgement is durable and ordered.** A receipt and its sequence are stored in the same transaction as the data change. Older reads cannot replace newer acknowledged state.
6. **Undo is another guarded action.** The server derives the inverse of exactly what the original action touched. It does not restore an old board snapshot or erase unrelated later work.

Whole-board and whole-page snapshots become read models and temporary editor baselines. They are never write or Undo payloads. The current snapshot diff (`boardSyncCore.ts`), whole-board history (`WorkspaceShell.svelte`), and AI preview replacement (`WorkspaceShell.svelte`) can retire after all writers use the action contract.

## Durable client state and reads

Before an optimistic local edit appears, the client stores its action in an IndexedDB outbox. The displayed resource is **last confirmed snapshot + pending actions**. A server receipt removes only its matching action from the outbox and advances the confirmed sequence. On restart or reconnection the client fetches a snapshot, replays pending actions, and sends them again by stable ID. Tabs coordinate sending through Web Locks or BroadcastChannel; idempotency makes duplicate sends harmless. A failed board/page delete never clears earlier pending work.

PocketBase serves a board or project snapshot from one database read transaction with its sequence. The current Hono wrapper's many separate PocketBase HTTP reads cannot provide this consistency. Project-scoped change events carry sequence and affected resource IDs; the client fetches deltas from its last cursor and reloads only an affected board/page on a gap. Presence is an ephemeral channel and does not invalidate content. A response with sequence lower than the client's confirmed sequence is discarded. An invalidation arriving during a fetch schedules another pass.

Task editing emits a patch of changed fields against its opening baseline. A `saved` badge means a receipt arrived; while queued or offline it says `Pending` or `Saving`. New cards remain an ephemeral title draft until a nonempty create command commits, so Escape leaves no placeholder card. Page editing uses the same revisioned action path; concurrent edits to the same text region are retained as an explicit conflict rather than silently replacing one another.

## Undo, deletion, and recovery

Deleting a task, column, board, or page moves it and dependent records into a server-side trash state. Assets and comments remain attached for a documented retention period. Restore is an inverse action that checks for ID and parent conflicts. Permanent purge is a separate explicit operation after retention. This makes the inline Undo meaningful even for a deleted column and its cards. The Changes detail includes the count and names of dependent entities affected by a delete.

The in-app archive is server-generated and versioned. Its manifest declares the export scope and includes project content, memberships and permissions as restorable references, comments, relationships, binary assets, and checksums. Private AI chat requires an explicit owner-only export scope; credentials and session tokens are never included. Export reports any intentionally omitted data before download. Import validates the full archive and ID remapping in a staging area, then publishes a complete project as one visible unit with an idempotency key. A failed import leaves no partial visible project; retry resumes or returns the prior result. Old backup formats remain readable through explicit migration adapters. An operator backup of PocketBase data and files remains a separate disaster-recovery facility.

Private AI chat is saved per session and per message with revisions. Creating, editing, or deleting one session never replaces the account's full session list or infers deletion from a missing item in another tab. Messages append by ID. Agent action receipts refer to the chat turn and resource targets without copying whole board state into chat history.

## Agent execution and identity

Agent tools emit typed operations against IDs captured when a turn begins. The server validates and commits them through the same action API as manual edits. The assistant may narrate the result, while the Changes line gets its summary from the receipt. The expanded detail can show a move as a move, a link as a link, and precise field edits. If an agent request is ambiguous or a touched field conflicts, that action remains unresolved with a concise inline explanation; completed unrelated actions keep their receipts and Undo controls.

Email-address invitations require server-verified ownership for both discovery and acceptance. An unverified account cannot learn pending invitations merely by claiming their email. When email verification is unavailable, the owner can share a single-use invitation token; possession of that token, not an unverified email string, grants the invitation. The server enforces this at the membership transaction boundary, regardless of browser behavior.

## Migration plan

1. **Establish the contract and immediate safety gates.** Define operation schemas, lossless codec, canonical mapper, stable targets, and contract fixtures. Deny unverified email invitation discovery/acceptance. Reject invalid task parents in the existing transaction while the new path is built.
2. **Add action receipts and revisions.** Add action ledger, idempotency constraint, project sequence, structured conflicts, and transactional snapshot/delta endpoints. Keep old reads temporarily and compare both representations on disposable and staging data.
3. **Migrate every writer.** Route task modal, drag/drop, Undo, board/page deletion, CLI, and agent tools through actions. Use touched-field patches and trash. Remove whole-snapshot write paths only after parity checks pass.
4. **Switch client recovery and interaction.** Install the IndexedDB outbox, sequence-aware reads, scoped subscriptions, per-session chat persistence, and receipt-backed save status. Evolve the existing chat status strip into clickable Changes details with adjacent Undo; remove routine proposal-review chrome.
5. **Ship complete portability.** Add the versioned archive and staged restore, retain legacy imports, then retire the current content-only Backup label. Enable automated contract, concurrency, two-tab, and fault-injection tests as release gates.

## Proof required before rollout

- A no-op agent action records no change; linked cards and every other field survive a read/agent/write round trip.
- Two people edit different fields of one task: both survive. Two edit the same field: one gets a specific, retained conflict.
- A column is deleted while another client creates/moves a card into it: no successful orphan write and no invisible card.
- Undo of a title edit preserves a teammate's later description edit and new card. Undo of a column delete restores cards, comments, and files.
- A delayed old snapshot after a receipt never rolls back the display; an event during a fetch is not lost.
- Two tabs edit offline and reload: both actions remain recoverable and each commits at most once.
- Agent actions for boards A and B coexist after navigation/reload. Their Changes lines show exact moves, links, field edits, and Undo independently.
- A task badge stays pending until server acknowledgement; Escape from a new-card title leaves no saved placeholder.
- Two tabs create/edit/delete private chat sessions without erasing each other's work.
- An unverified email claimant cannot see or accept an invitation; a verified recipient or holder of a valid invitation token can.
- A full archive round trip preserves links, assignees, comments, files, and pages. A failed restore leaves zero partial visible projects and retry is idempotent.
- Presence updates do not fetch every task and chat session; snapshots remain coherent during concurrent edits.

## Coverage of the 20 reported issues

Numbers refer to the 20-item user-facing issue list in this task.

| Foundation | Issues addressed from the user-facing list |
| --- | --- |
| Verified identity and invitation token | 1 |
| Typed actions, field preconditions, valid references, guarded Undo, trash | 2, 3, 4, 5, 7, 8, 20 |
| Durable outbox, receipts, sequences, consistent snapshots, scoped events | 6, 13, 15, 16, 17 |
| Fixed agent targets and receipt-derived Changes details | 9, 10, 11, 12 |
| Per-session chat persistence | 14 |
| Complete archive and staged restore | 18, 19 |

The same action and revision rules apply across human and agent paths. The quiet Changes line is a projection of those durable facts, rather than a separate change system.
