# CLAUDE.md

## Principles

- Root-cause fixes over one-off patches.
- Improve observability before changing behavior (traces, logs, structured errors).
- Never hide failures behind optimistic wording.
- Fix control flow, not prompts.

## Workflow

- Reproduce and collect evidence before patching.
- Check existing logs and server flow before deciding on a fix.
- If debugging is hard, add instrumentation first.
- No silent fallbacks.

## Change Quality

- Small, composable fixes over special-casing.
- Preserve debuggability. Make state transitions explicit.
- Don't imply actions happened unless they did.

## UI

- Prefer compact layouts.
- Avoid nested card views.
- Avoid overly rounded cards.

## Verification

- Verify changed paths end-to-end when feasible.
- If unverified, say so.
