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

## Data schema and end-to-end behavior

### Google Sheet row mapping

The Google Form response tab is read as a positional row. The repository keeps the original row number as the immutable source reference (`google-row-N`, displayed as `GS-N`). Current source columns are:

| Column | Source meaning | Portal use |
| --- | --- | --- |
| A | Submitted timestamp | `createdAt`; rows older than the active retention cutoff are omitted from the operational import. |
| B | Requester name | Display and requester directory label. |
| E | Requester email | Trimmed/lowercased requester identity and search key. |
| F | Department | Department filter and ticket metadata. |
| G | Site/location | Site filter, ticket header, and site history. |
| H | Original request/detail | Primary bilingual description. |
| I | IT need/category | Category, subject seed, and category filter. |
| K | Was it solved? | Explicit completion signal (`Yes`, `Solved`, `TRUE`, `Done`, and equivalent values). |
| L | Category/type detail | Secondary category data when present. |
| M | How was the problem solved? | Resolution notes written by the completion flow. |
| O | Date case was solved | Solved date written as `YYYY-MM-DD`. |
| P | Completed with time stamp | Completion marker written as `TRUE` or `FALSE`; it is never populated with an ISO timestamp. |
| R | Staff working the request | Historical handler/completer. `TBD`, blank, `N/A`, and similar placeholders mean no completed work evidence. |

The mapping is centralized in `src/lib/google-sheets/repository.ts`; writes use the source row reference through `updateGoogleSheetIntakeRow`, so the app updates the master row rather than creating a disconnected ticket.

### Normalization and status rules

Every imported row receives an immutable internal ID and a `GS-<source row>` display number. Email keys are lowercase and trimmed. Missing values render as `—`. `isTicketResolved` in `src/lib/domain/resolution.ts` is the single resolution rule: a completion-like K value, a valid O/P date or timestamp, or a real R staff value makes a ticket resolved. This intentionally treats historical staff as evidence of completed work, not as a current assignment.

The operational state model is deliberately small:

- **Received (`NEW`)** — no reliable completion evidence; shown in the default inbox.
- **In progress (`IN_PROGRESS`)** — an app-only coordination state; it does not overwrite the Sheet completion fields.
- **Resolved (`RESOLVED`)** — completion data is present and excluded from the default Received queue.

Saving Resolved writes K=`Yes`, O=`YYYY-MM-DD`, P=`TRUE`, R=`<logged-in staff name>`, and M=`<resolution note>` when supplied. Resetting to Received writes K=`FALSE`, O=``, P=`FALSE`, R=`TBD`, and clears M. Original request, requester, department, site, category, supervisor, and historical values are preserved.

### Application flow

1. `src/lib/google-sheets/client.ts` reads the configured spreadsheet through Google OAuth.
2. `GoogleSheetTicketRepository` maps and normalizes rows, applies the date cutoff, and calculates status.
3. `/it` renders the Received-first queue; `/it?state=ALL` renders paginated history; `/users` groups requesters by normalized email.
4. Ticket detail actions call `/api/tickets/[ticketNumber]`, which validates staff authorization and expected row version.
5. The repository writes the matching source row and returns the updated representation. No attachment storage or requester-message side channel is used.

### Security and collaboration model

Production access is Google OAuth with the IT allowlist. Secrets stay in Vercel environment variables. The GitHub `main` branch is intended to be protected with pull-request review and status checks; collaborators should work on branches and open PRs for review. Vercel is connected to this repository so approved pushes can deploy through the project’s normal integration.
