# LACC IT Support Portal

The LACC IT Support Portal is an internal, responsive operations interface for the Latin American Community Center IT team. It is a better view over the existing Google Sheet—not a parallel ticket database.

## Source of truth

The master Google Sheet remains authoritative. Each imported ticket retains its source sheet/tab and row reference. The portal reads form-response rows, normalizes them for search and display, and writes completion changes back to that same row. Original bilingual request text, requester details, site, department, category, supervisor data, historical notes, and historical staff values are preserved.

Historical rows are considered resolved when the sheet has a completion-like value, a valid completion date/timestamp, or a real value in **Staff working the request / staff tomando la solicitud**. `TBD`, blank, `N/A`, and whitespace-only values are not staff evidence. This keeps worked historical tickets out of the Received queue while allowing an untouched request to remain visible.

The completion editor writes the existing sheet fields: technician/staff name, resolution notes, solved status, solved date, and completion timestamp. Resetting a ticket to Received clears those completion fields and its resolution note. The portal does not add attachments or a separate requester-message workflow.

## Staff access

Google OAuth is restricted to the configured IT staff allowlist (currently Duane and Dominic). The app does not use service-account keys. Configure the OAuth client and allowlist through Vercel environment variables; never commit credentials or tokens.

## Local verification

```text
pnpm install
$env:DATA_BACKEND="fixture"
$env:AUTH_BYPASS="true"
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fixture mode is deliberately blocked in production. Configure `.env.local` from `.env.example` and use `DATA_BACKEND=graph` only after the canonical `.xlsx` and delegated Microsoft authorization are ready.

## Routes

- `/it` — Received-first Support Inbox with search, filters, ticket detail, and completion/reset actions.
- `/it?state=ALL` — All Tickets view with 10-ticket pagination.
- `/users` — requester directory keyed by normalized lowercase email, with search and ticket history links.
- `/admin` — administrator diagnostics.
- `/requests/new` — employee submission flow when enabled.
- LACC Inventory — external link to `https://lacc-asset-tracker.vercel.app`.

The desktop queue uses a shared flexible grid for headers and rows. Mobile navigation collapses into a hamburger menu, and ticket details remain usable on narrow screens.

## Local development

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Run the checks before publishing:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fixture mode is for local development only. Production must use the Google Sheets backend and configured OAuth credentials. See [DEPLOYMENT.md](./DEPLOYMENT.md) and [SECURITY.md](./SECURITY.md).

## Configuration

Required values are documented in `.env.example`. Typical production values include the Google OAuth client ID/secret, redirect URI, allowed staff emails, spreadsheet ID, and sheet/tab mapping. Keep `.env.local` out of version control and configure production values in Vercel’s encrypted environment settings.

## Project documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — data flow and route/component boundaries.
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Vercel deployment and environment setup.
- [SECURITY.md](./SECURITY.md) — OAuth, secret handling, and operational safeguards.
- [RESEARCH.md](./RESEARCH.md) — source-sheet observations and normalization decisions.
