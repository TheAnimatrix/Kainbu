# Host Kainbu with Dokploy

You need a server running Dokploy and a domain pointing to that server.

## 1. Create the app

In Dokploy, create a project and environment, then add a **Compose** app with:

| Setting        | Value                                    |
| -------------- | ---------------------------------------- |
| Git repository | `https://github.com/TheAnimatrix/Kainbu` |
| Branch         | `master`                                 |
| Compose file   | `docker-compose.yml`                     |
| Build          | Enabled                                  |

Use the base Compose file only. The local override publishes ports that can conflict with Dokploy.

## 2. Add your settings

Copy the [environment template](dokploy.env.example) into the app's **Environment** settings. Set:

- `POCKETBASE_ADMIN_EMAIL` — your database administrator email.
- `POCKETBASE_ADMIN_PASSWORD` — a strong, unique password.
- `KAINBU_ADMIN_EMAILS` — the email you will use to sign up in Kainbu.
- `KAINBU_PUBLIC_URL` — your full app URL, such as `https://kainbu.example.com`.

Add `OPENROUTER_API_KEY` if you want AI features. Leave `VITE_POCKETBASE_URL` unset; Kainbu connects to its database through your app's domain.

## 3. Connect your domain and deploy

In **Domains**, add your domain, enable HTTPS, and select service **web**, container port **80**. No host port mappings are needed.

Click **Deploy** and wait for the build to finish. Open your domain and create a Kainbu account.

## 4. Enable admin access

Sign up with the email in `KAINBU_ADMIN_EMAILS` and verify it. Then open **Settings → Open admin** in Kainbu.

If email delivery is not configured, visit `https://your-domain/pb/_/` and sign in with your database administrator credentials. Open the `users` collection and mark your Kainbu account as verified, then sign in to Kainbu again.

## Updates and backups

Back up your database and uploads before updating. They are stored in the Compose volume `pb_data`. To update, deploy the existing app again to pull and build the latest code from your selected branch. Keep the existing volume.

## Troubleshooting

- **App unavailable or 502:** confirm the domain targets `web` on container port `80`, then check the deployment logs.
- **Sign-in fails:** leave `VITE_POCKETBASE_URL` unset and redeploy. If it still fails, check the `pocketbase` service logs for startup or migration errors.
- **Admin settings missing:** check that your account email matches `KAINBU_ADMIN_EMAILS` and that the account is verified.
