# Kainbu

Self-hosted kanban workspace: SvelteKit SPA, Hono API, PocketBase (auth + data + files), optional Capacitor Android builds.

## Self-hosting (Docker)

1. Copy environment template and set secrets:

```bash
cp .env.example .env
# Edit OPENROUTER_API_KEY, POCKETBASE_ADMIN_PASSWORD, etc.
```

2. Start the stack:

```bash
docker compose up --build
```

3. Open the app at [http://localhost:3000](http://localhost:3000). PocketBase admin UI: [http://localhost:8090/_/](http://localhost:8090/_/).

Services:

| Service | Port | Role |
|---------|------|------|
| `web` | 3000 | Static UI (nginx) |
| `api` | 8788 | Hono API (AI, workspace mutations, CLI auth) |
| `pocketbase` | 8090 | Auth, database, file storage, realtime |

Schema is applied from [`pocketbase/pb_migrations/`](pocketbase/pb_migrations/) on PocketBase startup.

### Local development (without Docker)

```bash
# Terminal 1 — PocketBase (download binary or use docker compose up pocketbase)
# Terminal 2
cp .env.example .env.local
npm install --no-engine-strict
npm run dev:full
```

Web: [http://localhost:3001](http://localhost:3001) (Vite proxies `/api` to port 8788).

## CLI

See [docs/CLI.md](docs/CLI.md). Configure PocketBase URL:

```bash
kainbu config set --pocketbase-url http://127.0.0.1:8090 --api-base http://127.0.0.1:8788
kainbu login
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_POCKETBASE_URL` | Browser PocketBase URL |
| `POCKETBASE_URL` | Server/CLI PocketBase URL |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | API admin access to PocketBase |
| `OPENROUTER_API_KEY` | Workspace AI routes |
| `KAINBU_PUBLIC_URL` | CLI device-login links |

## Android (optional)

Capacitor wraps the static `build/` output. After `npm run build`, run `npx cap sync` and open the Android project in Android Studio.
