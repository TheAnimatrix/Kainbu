# Kainbu CLI

Terminal access to projects, boards, tasks, pages, and scratchpad.

## Install

From the repo:

```bash
npm install --no-engine-strict
npm run cli:link
```

## Configure PocketBase

```bash
kainbu config set --pocketbase-url http://127.0.0.1:8090 --api-base http://127.0.0.1:8788
```

Or copy `.env` into `~/.config/kainbu/.env`:

```bash
kainbu config import-env
```

| Variable | Purpose |
|----------|---------|
| `KAINBU_POCKETBASE_URL` | PocketBase URL |
| `KAINBU_API_BASE` | Hono API base URL |

## Auth

```bash
kainbu login
kainbu whoami
kainbu logout
```

Device login opens the web UI at `/cli/authorize` (requires `KAINBU_PUBLIC_URL` on the server).

## Commands

See `kainbu --help` for project, board, task, and page commands.
