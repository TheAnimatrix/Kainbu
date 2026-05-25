# Kainbu

Self-hosted kanban workspace: SvelteKit SPA, Hono API, PocketBase (auth + data + files), optional Capacitor Android builds.

## Self-hosting (Docker)

1. Copy environment template and set secrets:

```bash
cp .env.example .env
# Edit OPENROUTER_API_KEY, POCKETBASE_ADMIN_PASSWORD, etc.
```

2. Start the stack (local host ports via override):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

3. Open the app at [http://localhost:3000](http://localhost:3000). PocketBase admin: [http://localhost:8090/_/](http://localhost:8090/_/) (or [http://localhost:3000/pb/_/](http://localhost:3000/pb/_/) via nginx).

4. Verify signup, username, board create, API auth, and admin panel:

```bash
npm run test:local-docker
npm run test:admin-docker
```

Set `KAINBU_ADMIN_EMAILS` in `.env` (default in compose: `admin-e2e@kainbu.test`). Sign in with that email, then open [http://localhost:3000/admin](http://localhost:3000/admin) or use **Settings → Open admin**.

Fresh database (wipes data): `docker compose -f docker-compose.yml -f docker-compose.local.yml down -v` then `up --build` again.

**Dokploy:** see [deploy/DOKPLOY.md](deploy/DOKPLOY.md) — use `docker-compose.yml` only (no host port bindings).

**Cursor agent skills:** [`.cursor/skills/README.md`](.cursor/skills/README.md) — Dokploy deploy, testing, release checklist, PocketBase debugging.

**PocketBase URLs in Docker**

| Consumer | URL | Why |
|----------|-----|-----|
| Browser (app) | same origin `/pb` | nginx proxies to the `pocketbase` container; no public PB hostname required |
| `api` service | `http://pocketbase:8090` | Docker network DNS between containers |
| Optional override | `VITE_POCKETBASE_URL` | Separate PocketBase host (e.g. `https://pb.example.com`) |

Set `KAINBU_PUBLIC_URL` to your public app URL (for CLI device login). Leave `VITE_POCKETBASE_URL` unset on Dokploy unless PocketBase is on another domain.

Services:

| Service | Port | Role |
|---------|------|------|
| `web` | 3000 | Static UI (nginx) |
| `api` | 8789 (host, local override) / 8788 (in Docker network) | Hono API (AI, workspace mutations, CLI auth) |
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
| `VITE_POCKETBASE_URL` | Optional browser PocketBase URL (Docker default: same-origin `/pb`) |
| `POCKETBASE_URL` | Server PocketBase URL (`http://pocketbase:8090` in compose) |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | API admin access to PocketBase |
| `OPENROUTER_API_KEY` | Workspace AI routes (fallback if not set in admin UI) |
| `KAINBU_ADMIN_EMAILS` | Comma-separated emails with in-app admin access (`/admin`) |
| `KAINBU_PUBLIC_URL` | CLI device-login links |

## Android (optional)

Capacitor wraps the static `build/` output. After `npm run build`, run `npx cap sync` and open the Android project in Android Studio.
