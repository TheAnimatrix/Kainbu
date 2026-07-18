# Activity semantic contract

## Daily Activity

Daily Activity is the compact view of meaningful human workspace events whose source timestamp falls between local midnight and the current snapshot time. It is a **calendar-day** view, not a rolling 24-hour view. Events are newest first, capped for the strip, and link to the owning project.

The derived model includes task creation/completion, membership join/leave, and invite send/accept/decline events when their source records contain an attributable timestamp. Deleted tasks and departed members remain eligible for history; they are excluded only from current task/member counts.

## Workspace Activity

Workspace Activity is one chronological, newest-first history reconstructed from the currently available project state. It supports a time window (7 days, 30 days, all history), project filter, and group filter (all, tasks, people). Filtering happens before pagination. Pagination always clamps to a valid page, so changing filters cannot produce a blank page from an out-of-range cursor.

`Project.updatedAt` and task `updatedAt` are not activity events. They are mutable synchronization/snapshot timestamps and cannot prove a human action. This intentionally means the current client-side model cannot show arbitrary edits, moves, renames, or deletions unless those actions have a dedicated source timestamp. A future durable immutable event collection can extend the history without changing this UI contract.

All timestamps are stored/rendered as epoch milliseconds and formatted in the viewer's local timezone. The client recomputes the snapshot reference time when project input changes, not on a clock interval; this prevents fake activity updates and preserves a stable history while the dashboard is open.
