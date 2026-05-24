# Kainbu on Dokploy

## Why host port 3000 must not be published

Dokploy’s panel uses **host port 3000**. Do **not** map `3000:80` (or any host port) on the `web` service. Traefik reaches containers on the internal Docker network.

This repo’s `docker-compose.yml` has **no host `ports`**. Use `docker-compose.local.yml` only on your laptop.

## Recreate the project (UI)

1. **Dokploy** → find project **Kainbu** → **Delete** (confirm; this removes apps and compose stack).
2. **Create project** → name `Kainbu` → add **Environment** (e.g. `production`).
3. **Add Compose**:
   - **Source:** Git → `https://github.com/TheAnimatrix/Kainbu`
   - **Branch:** `master` (or your deploy branch)
   - **Compose file:** `docker-compose.yml`
   - **Build:** enabled (builds `api` + `web`)
4. **Environment** — paste from [`dokploy.env.example`](./dokploy.env.example), set:
   - `POCKETBASE_ADMIN_PASSWORD`
   - `OPENROUTER_API_KEY`
   - `KAINBU_PUBLIC_URL=https://kainbu.avarnic.com` (your real URL)
   - Leave `VITE_POCKETBASE_URL` **unset** (browser uses `/pb` via nginx).
5. **Domains** — attach `https://kainbu.avarnic.com` (or your host) to service **`web`**, **container port `80`**.
   - Do **not** add a published host port.
6. **Deploy**.
7. After first deploy, open **PocketBase admin** at `https://your-domain/pb/_/` and confirm **Collections → users → API Rules → Create** is **empty** (public signup). The repo migration `1730000001_allow_user_signup.js` sets this on container start; restart the `pocketbase` service if signup still fails.

## Services (internal)

| Service     | Container port | Public access        |
|------------|----------------|----------------------|
| `web`      | 80             | Domain → Traefik     |
| `api`      | 8788           | Via nginx `/api/`    |
| `pocketbase` | 8090         | Via nginx `/pb/`     |

## Local Docker (with host ports)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

App: http://localhost:3000

## API recreate (optional)

With a Dokploy API key (`Settings → API`):

```bash
export DOKPLOY_URL=https://dokploy.avarnic.com
export DOKPLOY_API_KEY=your-key

# List projects, find Kainbu projectId, then:
curl -X POST "$DOKPLOY_URL/api/project.remove" \
  -H "x-api-key: $DOKPLOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_ID_HERE"}'
```

Then create the compose app again in the UI (or via `compose.create` / project APIs).
