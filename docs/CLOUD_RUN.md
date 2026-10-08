# Deploy Bot 1 to Google Cloud Run

The dashboard runs from a web link on a phone. Google Cloud Run hosts the app; Supabase stores members, business contacts, campaign progress, spending, and feedback. A Supabase Cron job wakes the campaign worker every minute **only when there is eligible work**. Neither a laptop nor an open browser is required.

## 1. Prepare your owner login

Open the existing dashboard and go to **Settings → Browser sign-in**. Set a password of at least 12 characters for your owner email. Cloud Run uses this email/password login; it does not trust ChatGPT identity headers. Your partner’s existing password and viewer membership remain in the same Supabase project.

## 2. Connect the repository from Google Cloud Console

1. Select or create your Google Cloud project and enable billing. Hosting is usage based; do not assume all services are free.
2. Open **Cloud Run → Connect repository** (the continuous deployment option). Select **Cloud Build** and GitHub. Authorize Google’s repository connection to access `HeftyAllen/Toran-Bot_V1-Outreach-Bot-`.
3. Select this repository, branch `main` (branch pattern `^main$`), **Dockerfile** build type, and `/Dockerfile` at the repository root. The app includes the Dockerfile; it builds the Next.js standalone server.
4. Choose a currently available region near you and your database. Use a service name such as `toran-bot1`.
5. Set container port **8080**, **1 CPU**, **512 MiB–1 GiB memory**, request timeout **300 seconds**, maximum instances **2**, concurrency **8**, minimum instances **0**, and request-based billing. The persisted queue allows scale to zero.
6. Allow public/unauthenticated HTTP access at the Cloud Run service layer. The app itself requires an invited account for dashboard/API access. The health check and signature-verified WhatsApp webhook are public endpoints; the worker requires the server secret or an owner session.
7. Connect the runtime secrets below before using the app. Grant the runtime service account access to only those secrets. Build/deployment permissions and runtime secret permissions are separate; follow Google’s permission prompts for Cloud Build, Artifact Registry, Cloud Run, and service account use.

## 3. Runtime variables and Secret Manager

Under the service’s **Variables & secrets**, set plain environment variables:

| Variable | Value |
| --- | --- |
| `APP_RUNTIME` | `cloud-run` |
| `SUPABASE_URL` | `https://itxrajuvszdzhuitwysz.supabase.co` |
| `OWNER_EMAIL` | Your existing owner email (`jdlamini351@gmail.com`) |

Create Google Secret Manager secrets and reference them as these **server** environment variables:

| Variable | Source |
| --- | --- |
| `SUPABASE_SECRET_KEY` | Supabase Project Settings → API Keys → a dedicated **secret** key (`sb_secret_…`), or legacy server `service_role` key. Never use a publishable key here. |
| `OPENAI_API_KEY` | Your OpenAI project’s API key. |
| `APP_SESSION_SECRET` | A fresh cryptographically random value, at least 32 characters. |
| `APP_ENCRYPTION_SECRET` | A cryptographically random value, at least 32 characters, used to encrypt WhatsApp credentials. |
| `WORKER_SECRET` | A cryptographically random value, at least 32 characters. The scheduler must use this same value. |

Generate random secrets with a trusted password manager, or Google Cloud Shell (`openssl rand -hex 32`). Cloud Shell is browser based and does not require your laptop terminal. Keep values out of GitHub, screenshots, browser public variables, and Docker build arguments. Keys are supplied at runtime, not during the build.

If you choose a new encryption secret when moving hosts, reconnect WhatsApp on Cloud Run. Previously encrypted credentials require the original encryption secret. Restart/deploy a revision after changing runtime secrets.

## 4. Point the existing scheduler at Cloud Run

After deployment, copy the HTTPS service URL. In Supabase, open **Vault** and update these two existing named secrets:

| Vault name | New value |
| --- | --- |
| `bot1_worker_url` | `https://YOUR-CLOUD-RUN-HOST/api/jobs/work` |
| `bot1_worker_token` | The exact `WORKER_SECRET` used by Cloud Run. |

Keep both named entries and the existing `bot1-campaign-worker` Cron job. The Cron job is already installed for this project and runs once per minute. It sends an authenticated POST and does no work while idle. Do not create a second recurring discovery schedule: only campaigns you queue from the dashboard should run.

For an installation in a different Supabase project, apply the SQL migrations in chronological order, configure the server database access, and add the two Vault secrets. The original workspace migration’s owner email and internal-token hash are specific to the existing project; review and replace those when adapting it. Cloud Run can instead use its dedicated `SUPABASE_SECRET_KEY`.

If your Supabase dashboard does not expose Vault editing, use its SQL editor with `vault.update_secret` after looking up the row ID by name. Never select or export the decrypted secret values. The `docs/SCHEDULER.sql` file gives a read-only status check.

## 5. Verify from your phone

1. Open the Cloud Run HTTPS URL. Sign in with your existing owner email and browser password.
2. Check **Settings**: OpenAI and worker should show configured.
3. Set a small monthly limit in **Spending**. Start with a 1-business campaign and a modest run limit.
4. Choose the business type and an exact city/country on **Overview**, then click **Start Bot 1**.
5. Close the browser, wait a few minutes, and reopen it. **Campaign activity** should show saved progress; **Leads** should contain evidence, sources, and public contacts that were actually found.
6. If a campaign stalls, check Cloud Run logs and the Cron/network status query below. A paused bot will not process jobs; requests already in progress may still incur cost. A lease expires after two minutes if a worker is interrupted.
7. Set a Google Cloud billing budget alert separately. The dashboard’s guard covers tracked research/message requests; it does not automatically import your entire GCP/OpenAI/Meta account invoice.

## 6. WhatsApp setup

In **Settings → WhatsApp Business connection**, enter your Meta Phone Number ID, supported Graph API version, system-user access token, Meta app secret, and a verify token you choose. Saving verifies the credentials with Meta and encrypts them in Supabase.

In Meta’s WhatsApp app configuration, set callback URL `https://YOUR-CLOUD-RUN-HOST/api/whatsapp/webhook`, enter that same verify token, and subscribe to **messages**. Use Cloud Run as your callback after moving the scheduler. Tokens and app secrets are never returned by the dashboard API.

Before sending, record the recipient’s consent in its lead details and set a conservative WhatsApp per-message cost in **Spending**. First contact uses a Meta-approved template. This version supports text body parameters in their approved order. Text replies require an inbound message within the last 24 hours. STOP/unsubscribe replies automatically suppress further outreach. A public phone number alone does not prove consent or WhatsApp availability.

Delivery failures or ambiguous timeouts are recorded. Unknown sends are blocked from automatic retry to avoid duplicate messages. Check Meta before resolving an unknown result in the dashboard.

## Source and development

- `npm ci`
- `npm run test:bot`
- `npm run build:cloud-run`
- `npm run start:cloud-run` (set your server environment first)
- Sites uses `npm run build` and its runtime bindings; Cloud Run uses the standalone Node server.
- The production Docker image runs as a non-root user. No credentials are baked into it.

Official references:
- [Cloud Run continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment)
- [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Meta WhatsApp policy](https://business.whatsapp.com/policy)
