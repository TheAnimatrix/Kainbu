# kainbu

Command-line client for [Kainbu](https://kainbu.avarnic.com/landing) — manage
projects, boards, tasks, pages, and scratchpads from your terminal.

## Install

Requires Node ≥ 22.

```bash
npm install -g kainbu      # or run ad-hoc: npx kainbu <command>
```

## Log in

The CLI authenticates with a **per-user API key** that you mint from
**Settings → Access** in the Kainbu web UI:

```bash
kainbu login --server https://kainbu.example.com --api-key kbu_v1_...
kainbu whoami                              # confirm the signed-in user
kainbu auth profiles                       # manage multiple servers / accounts
```

The API key works directly against the Kainbu API — no PocketBase URL needed.
Don't have a key yet? Use `kainbu login --device` for the browser device flow.

## View tasks

```bash
kainbu project list                        # list your projects
kainbu use <project>                       # set the active project (name or id)
kainbu board list                          # boards in the active project
kainbu ls                                  # tasks on the active board, grouped by column
kainbu ls <board>                          # tasks on any board, without switching
kainbu ls --with=Bugs --sort=-created      # only some columns, sorted
kainbu ls --without=Done --filter=has_content
```

Tasks list grouped by column, with a `[x]`/`[ ]` checkbox for checkable items.
Add `--json` to any list command for machine-readable output.

## Work with tasks

```bash
kainbu task add "Write the changelog"      # adds to the top of the first column
kainbu task add "Fix login" --column Bugs  # choose a column
kainbu task get T5                          # show one task
kainbu task check T5                        # toggle the checkbox
```

Run `kainbu --help` (or `kainbu <command> --help`) for the full reference,
including columns, pages, scratchpad, filtering, and pagination.

## License

GPL-3.0-or-later.
