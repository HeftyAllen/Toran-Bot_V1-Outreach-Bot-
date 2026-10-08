# Toran Bot 1 Control Room

A mobile-friendly dashboard for discovering local businesses, researching their public pages, saving contact sources, and managing reviewed WhatsApp outreach. Campaigns persist in Supabase and continue through a cloud worker when the browser is closed.

## Features

- Choose business types, exact locations, country calling code, and 1–100 businesses per campaign.
- Discover new businesses or research the saved queue; skip duplicates and report when fewer verified matches are found.
- Save public business phone numbers, emails, addresses, website evidence, source URLs, and tailored drafts. Missing contacts stay unknown.
- Persist campaign progress; pause, resume, cancel, retry failed research, and export a CSV.
- Track token/search usage, estimated costs, unconfirmed reservations, per-run limits, and monthly limits. Reconcile uncertain charges with provider billing.
- Connect Meta WhatsApp Cloud API with encrypted server credentials, approved templates, consent records, 24-hour reply windows, signature-verified inbound webhooks, delivery statuses, and STOP suppression.
- Learn from recorded outcomes and notes using retrieved feedback and bounded score calibration. Sparse feedback does not trigger a statistical adjustment. This does not fine-tune an AI model.
- Owner access for operations and settings; partner viewer access through an email-bound, one-time invitation link. Browser passwords work from a phone.

## Deployment

[Google Cloud Run setup](docs/CLOUD_RUN.md) gives a Google Cloud Console/GitHub path with no local terminal required. The root Dockerfile builds a standalone Node server for port 8080. The existing hosted Sites version uses its Worker adapter. Both use the same Supabase project.

`supabase/migrations` contains the database schema, access policies, budget/lease functions, and a Cron dispatcher. The existing project is `itxrajuvszdzhuitwysz`. Runtime keys are configured by the host; `.env.example` and `.dev.vars.example` list names without credentials.

## Development

```sh
npm ci
npm run test:bot
npm run build:cloud-run
npm run start:cloud-run
```

The Cloud Run start command needs the server runtime environment. For Sites, use `npm run dev` / `npm run build` with the configured Sites workflow and bindings.

## Practical limits

Discovery uses OpenAI public web search and bounded reads of business websites; this is not a Google Maps crawler or an exhaustive business directory. Campaign targets are upper limits, not guaranteed result counts. Website access failures and missing contacts are recorded.

The spending guard covers the requests this app tracks. Published AI prices and owner-configured WhatsApp rates produce estimates; external account invoices, cloud hosting, and calls made outside this app are not imported automatically.

Direct WhatsApp sends require a real Meta business connection, recipient consent, an approved template for first contact, and configured cost assumptions. The app does not send email or publish social posts in this version.

Never commit API keys, session secrets, encryption keys, worker secrets, or credentials. Keep all server keys out of `NEXT_PUBLIC_*` variables and container build arguments.
