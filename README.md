<h1><img src="assets/logo.svg" alt="Kainbu" width="290" height="88" /></h1>

A self-hosted workspace for organizing projects, kanban boards, tasks, and notes.

## Get started with Docker

You need Git and Docker with Docker Compose installed and running. Docker handles the app and database setup for you.

### 1. Download Kainbu

```bash
git clone https://github.com/TheAnimatrix/Kainbu.git
cd Kainbu
cp .env.example .env
```

### 2. Set your credentials

Open `.env` in a text editor and change:

- `POCKETBASE_ADMIN_EMAIL` — your database administrator email.
- `POCKETBASE_ADMIN_PASSWORD` — a strong, unique password.
- `KAINBU_ADMIN_EMAILS` — the email you will use to sign up in Kainbu.

Leave the other settings as they are for local use. If you want AI features, add your `OPENROUTER_API_KEY`; it is optional.

### 3. Start Kainbu

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

The first build may take a few minutes. Once it finishes, open [localhost:3000](http://localhost:3000) and create an account.

### 4. Enable admin access

Your Kainbu account is separate from the database administrator account. To access Kainbu's admin settings, sign up with the email in `KAINBU_ADMIN_EMAILS` and verify it.

If email delivery is not configured, open the [database admin panel](http://localhost:3000/pb/_/), log in with your `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD`, and mark your account as verified in the `users` collection. Then sign in to Kainbu and open **Settings → Open admin**.

## Host on your own domain

For a public server, use HTTPS and set `KAINBU_PUBLIC_URL` to your app's URL. The [Dokploy deployment guide](deploy/DOKPLOY.md) covers domain setup; use `docker-compose.yml` without the local override on Dokploy.

## Stop or update

Stop Kainbu:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

Update to the latest version:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

Your database and uploaded files are stored in the Docker volume `pb_data` and survive restarts and updates. Back up your data before updating. **Do not add `-v` to the stop command: it deletes that data.**

Want to use Kainbu from the terminal? See the [CLI guide](docs/CLI.md).
