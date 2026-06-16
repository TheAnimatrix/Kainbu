# Kainbu CLI

Terminal access to projects, boards, tasks, pages, and scratchpad.

## Install

From the repo:

```bash
npm install --no-engine-strict
npm run cli:link
```

## Auth

The CLI uses **per-user API keys** that you mint from the Kainbu web UI
(**Settings → Access**). The CLI then talks to the Hono API over HTTPS using
that key — no PocketBase session is needed on the CLI host, which is what
makes it work on self-hosted domains.

### Create a key

1. Sign in to the web app.
2. Open **Settings → Access**.
3. Type a label (e.g. `laptop`, `ci-server`), click **Create key**.
4. **Copy the full key** — it's shown once and never again. The form shows
   you a one-liner to paste into your shell.

### Sign in

```bash
kainbu login --server https://kainbu.example.com --api-key <key>
# or, with stdin (safe for CI):
kainbu login --server https://kainbu.example.com --api-key -
```

If you have multiple saved profiles, `kainbu login` with no flags shows a
picker; `--server` and `--api-key` skip it. The key is stored in
`~/.config/kainbu/auth.json` with mode `0600`.

### Non-interactive fallback

```bash
export KAINBU_API_BASE=https://kainbu.example.com
export KAINBU_API_KEY=kbu_v1_...
kainbu project list
```

`KAINBU_API_KEY` wins over a saved profile (useful for CI).

### Device login

If you don't have a key yet (for example, you're setting up a fresh
self-hosted instance and the invite flow produces one later), use the
browser device flow:

```bash
kainbu login --device
```

The CLI prints a code and opens the web UI; once you approve in the
browser, the CLI saves the resulting PocketBase session into the local
config. The PB URL still needs to be configured for that path.

## Profiles

Multiple servers are first-class. The CLI ships each as a **named
profile** in `~/.config/kainbu/auth.json`.

```bash
kainbu auth profiles                          # list saved profiles
kainbu auth profiles --use work               # switch active profile
kainbu auth profiles --remove old-laptop      # delete a profile
kainbu auth profiles --rename work prod       # rename the active one
kainbu auth status                            # show active profile + verify the key
```

## Commands

See `kainbu --help` for project, board, task, page, and scratchpad
commands.

### Listing tasks

`kainbu task list [board]` (alias `kainbu ls [board]`) lists every task on a
board, grouped by column, with a `[x]`/`[ ]` checkbox for checkable tasks.
`[board]` lets you read any board without making it active.

| Flag | Effect |
|------|--------|
| `--with <cols>` | Only these columns (comma-separated ref/id/title), e.g. `--with=Bugs` |
| `--without <cols>` | Hide these columns, e.g. `--without=Planning,Bugs` |
| `--sort <field>` | Sort within each column. `field` is `created`, `modified`, or `title`; prefix `+` ascending (default) or `-` descending, e.g. `--sort=-created` (`date` is an alias for `created`) |
| `--filter <preds>` | Filter tasks (comma-separated). `has_content` keeps only tasks with a markdown description |
| `--column <ref>` | Filter to a single column (ref/id/title) |
| `--limit <n>` / `--offset <n>` | Paginate (default lists everything; a footer shows when truncated) |
| `--json` | Machine-readable output (`{ tasks, total, hasMore, nextOffset }`) |

```bash
kainbu ls --without=Planning,Bugs       # everything except those columns
kainbu ls --with=Bugs --sort=-created   # newest bugs first
kainbu ls --filter=has_content          # only tasks with a description
```

## Configuration files

| Path | Purpose |
|------|---------|
| `~/.config/kainbu/auth.json` | API keys + server URLs per profile (chmod 0600) |
| `~/.config/kainbu/config.json` | Active project / board pointers |
| `~/.config/kainbu/.env` | Env fallback (PocketBase URL, etc.) |

| Env var | Purpose |
|---------|---------|
| `KAINBU_API_BASE` | Hono API base URL (fallback if no profile) |
| `KAINBU_API_KEY` | One-shot API key (overrides saved profile) |
| `KAINBU_POCKETBASE_URL` | PocketBase URL (only used by the device flow) |

## Troubleshooting

- **`Server rejected the API key (401)`** — the key was revoked on the
  server, or you're pointing at the wrong `--server`. Re-mint a key in
  the web UI and run `kainbu login` again.
- **`Not logged in`** — no active profile and no `KAINBU_API_KEY` env
  var. Run `kainbu auth status` to see what's resolved.
- **Multiple profiles but you can't tell them apart** — the labels you
  typed at creation show up in `kainbu auth profiles`. The active one
  is marked with `*`. Pass `--profile <name>` to `kainbu login` to
  pick a specific one when the prompts don't fit your shell.
