# Kainbu CLI

Standalone terminal client for Kainbu workspaces. After install, run `kainbu` directly — no `npm run` wrapper.

## Install

### From this repo (development)

```bash
npm install --force
npm run cli:build
npm run cli:link    # puts `kainbu` on your PATH globally
```

Or use the workspace binary without linking:

```bash
npx kainbu --help
```

### Global command

Once linked or installed (`npm link` / `npm i -g` from `packages/kainbu-cli` after build):

```bash
kainbu --help
kainbu login
```

## Configure Supabase

The CLI needs your Supabase URL and anon key (same as the web app).

**Option A** — run from the repo (loads `.env` automatically):

```bash
cd /path/to/kainbu
kainbu login
```

**Option B** — copy project env once for use anywhere:

```bash
cd /path/to/kainbu
kainbu config import-env
kainbu login
```

**Option C** — global file `~/.config/kainbu/.env` (Windows: `%APPDATA%/kainbu/.env`):

```
KAINBU_SUPABASE_URL=https://….supabase.co
KAINBU_SUPABASE_ANON_KEY=eyJ…
```

See [.env.example](../.env.example) for variable names.

## Login

```bash
kainbu login
kainbu whoami
kainbu auth status
```

Device flow opens `https://kainbu.vercel.app/cli/authorize` (or your `KAINBU_API_BASE`). Approve the code in the browser, then return to the terminal.

CI / debug:

```bash
kainbu login --token "$KAINBU_TEST_TOKEN"
```

## Context

```bash
kainbu project list
kainbu project use "My Project"
kainbu board list
kainbu board use "Main"
```

Shortcuts: `p`, `b`, `t`, `c`, `pg`, `sp`, `ls`, `use`.

## Tasks (paginated)

```bash
kainbu task list --limit 15 --offset 0
kainbu task add "Ship CLI" --column C1
kainbu task get T1 --json
```

## Environment

| Variable | Purpose |
|----------|---------|
| `KAINBU_SUPABASE_URL` | Supabase project URL |
| `KAINBU_SUPABASE_ANON_KEY` | Supabase anon key |
| `KAINBU_API_BASE` | API base (default `https://kainbu.vercel.app`) |

Config and session: `%APPDATA%/kainbu` (Windows) or `~/.config/kainbu`.

## Rebuild after CLI changes

```bash
npm run cli:build
```
