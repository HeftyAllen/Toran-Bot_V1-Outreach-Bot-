# Toran Bot 1 Control Room

Mobile-friendly dashboard for discovering and researching business leads from a web browser. This source export is based on the deployed dashboard commit `a28896a9f43d845bec6c9a37a6858cfa4d8c7573`.

Live dashboard: https://bot1-control-room.jdlamini351.chatgpt.site

## Features

- One-click **Find & research leads** discovers public business websites using OpenAI web search, researches a batch, scores fit, and saves evidence and message drafts.
- Settings, leads, run history, and workspace members are stored in Supabase.
- Owner access can run research, update settings, manage leads, and create partner invitations. Partner access is read-only.
- **Settings → Browser sign-in** lets an authenticated user create a password for access from another browser.
- **Settings → Team access** creates a one-time invitation link bound to the partner's email. Share the link yourself; the dashboard does not send invitations by email.
- Research runs on the hosted backend. Batches are started from the dashboard; there is no recurring scheduler or email sender in this version.

## Push this export to GitHub

If the repository already has commits, clone it first, copy the contents of this folder into the checkout, review the changes, then commit and push normally. Preserve its history.

For an empty repository, run these commands inside this folder:

```bash
git init
git add .
git commit -m "Add Toran Bot 1 dashboard"
git branch -M main
git remote add origin https://github.com/HeftyAllen/Toran-Bot_V1-Outreach-Bot-.git
git push -u origin main
```

This ZIP contains source code, dependency lockfile, runtime/build configuration, and database migrations. It excludes Git history, installed dependencies, generated output, and runtime secrets. Pushing the source does not transfer runtime secrets or automatically deploy a new host.

## Current Supabase project

Project reference: `itxrajuvszdzhuitwysz`

Project URL: `https://itxrajuvszdzhuitwysz.supabase.co`

The migrations in `supabase/migrations/` have already been applied to this project's database. You do not need to rerun them just to upload the source to GitHub. Current application data uses Supabase; the `db/`, `drizzle/`, and D1 examples are retained starter files.

## Runtime configuration

This application uses Vinext, React, and Cloudflare Workers with Sites hosting. Server modules import `cloudflare:workers`; use a compatible Worker runtime when deploying elsewhere. A plain static deployment cannot run the server APIs.

For local development, use Node.js 22.13 or later. Copy `.dev.vars.example` to `.dev.vars` and supply actual server values locally. Keep `.dev.vars` out of Git.

```bash
npm ci
npm run dev
```

Run `npm run build` for a production build and `npm run lint` for static checks. Local preview may provide a mock ChatGPT identity; deployed browser sign-in relies on the stored workspace membership and password.

Required server bindings:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project publishable API key |
| `SUPABASE_DB_ACCESS_SECRET` | Server-only token checked by database row policies |
| `OPENAI_API_KEY` | Server-only API key for discovery and research |
| `OWNER_EMAIL` | Owner identity; the current workspace owner is seeded in the first migration |
| `APP_SESSION_SECRET` | Long random secret that signs browser sessions |

These values are configured in the current hosted application's runtime and are not included in the ZIP. Do not put server secrets into public client variables or commit them to GitHub.

### Database token for a separate deployment

The database function `public.bot1_server_request()` compares the SHA-256 hex digest of `SUPABASE_DB_ACCESS_SECRET` against the digest in the first migration. A new random token will not work until the database function is updated to its matching digest. The existing runtime token's plaintext is intentionally absent from this export.

For a new Supabase project, generate a long random server token, replace the digest in the first migration with its SHA-256 hex digest, update the seeded owner email if needed, then apply both migrations in order. Set the matching token as a server secret on the new host. For the existing project, coordinate a token change with all active app deployments before updating that database function.

The initial owner has no password embedded in the source. On the current hosted dashboard, sign in using the owner ChatGPT identity and create a password in **Settings → Browser sign-in**. A separate host without the Sites identity layer needs an owner invitation or secure password bootstrap before its first browser login.

The `.openai/hosting.json` file records the current Sites project and starter bindings. A separate hosting project requires its own deployment configuration.
