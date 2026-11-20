# Data and Secrets

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** no secret values or employee records were inspected. Production secret configuration, effective roles, and retention policy remain unverified.

## Configuration and secret boundaries

Treat all values stored in Vercel environment configuration, Google Apps Script properties, database connection strings, and Exchange service configuration as secrets unless verified otherwise. Documentation may name configuration keys but must not include values.

Source references include:

- `src/auth.ts`: `AUTH_SECRET`, `IT_SHARED_USERNAME`, `IT_SHARED_PASSWORD_HASH`.
- `src/lib/sql/client.ts`: `APP_DATABASE_URL` with `DATABASE_URL` fallback.
- `src/lib/sql/secrets.ts`: `REQUEST_SECRETS_KEY`.
- `src/lib/config/runtime-safety.ts`: Vercel environment and approved storage endpoint/spreadsheet checks.
- `src/app/api/intake/google-form/route.ts`: webhook secret and source Form ID configuration.
- `src/lib/excel/graph-client.ts`: Microsoft workbook authorization configuration.
- Google Apps Script properties: webhook URL and signing secret.

No source or runtime documentation should reproduce a value for any of these variables.

### SQL configuration guard

`database()` in `src/lib/sql/client.ts` selects `APP_DATABASE_URL ?? DATABASE_URL`, validates it through `assertSafeSqlConfiguration()`, then creates a `pg` pool.

`src/lib/config/runtime-safety.ts` requires an explicit Vercel Preview or Production environment for deployed storage. It permits only the configured logical endpoint for that environment and separate approved spreadsheet selection. The actual allowed endpoints and IDs are intentionally omitted here.

These checks reduce accidental cross-environment selection in the application process. They do not replace database authentication, least-privilege grants, network controls, or an administrator’s review of effective runtime values.

## Authentication secrets and shared credentials

`src/auth.ts` reads the shared username and stored password hash from configuration. It uses a constrained scrypt hash format and constant-time comparison. The cleartext password is not stored by the application code in this repository. Authentication is accepted only when `DATA_BACKEND === "sql"`.

`src/lib/sql/auth-rate-limit.ts` requires `AUTH_SECRET` to HMAC-hash client-address keys. Missing signing configuration throws an error and blocks the limiter/login path. Do not log or display authentication values during troubleshooting.

This baseline’s shared account has no individual technician attribution. Planned Entra authentication should replace shared login for staff access; it should not pass AD passwords through the Next.js application.

## Ticket and employee data

Ticket data can contain requester identity/contact details, request description, department/location, device references, messages, internal IT notes, and attachments. SQL stores most ticket fields inside `lacc_tickets.data` JSON and stores related event/message/attachment records separately.

Use least-data principles in logs and support procedures:

- Do not export employee or ticket datasets for routine troubleshooting.
- Do not place personal or sensitive request content in debug logs.
- Avoid copying internal notes into employee-visible channels.
- Use synthetic examples in tests and documentation.
- Treat Google Form email as unverified: the intake route validates its syntax/suffix, but `createGoogleFormTicket()` sets `requesterIdentityVerified` to false.

## SQL validation, permissions, and integrity

The source uses Zod schemas in `src/lib/domain/schemas.ts` for ticket create/update, messages, and attachment metadata. Repository methods use parameterized SQL queries. Ticket create and update use transactions; SQL update checks a row version and locks the ticket row. Unique operation IDs support replay handling.

Database integrity comes from migrations:

- Primary/unique keys and foreign keys for ticket and inventory relationships.
- Partial unique index for Form source/response identity.
- MIME type and size constraints for attachment tables.
- Agreement completion/PDF consistency constraints.
- Agreement database triggers preventing signed document mutation/deletion and event-history update/delete.

Actual database runtime-role grants and effective credentials are not verified. Migration DDL and application validation do not prove least-privilege access by themselves.

## PIN encryption

`src/lib/sql/secrets.ts` encrypts optional ticket PINs using AES-256-GCM with:

- Random 12-byte IV.
- Ticket UID as additional authenticated data.
- Authentication tag stored alongside ciphertext.
- Base64 encoded packed value.

`REQUEST_SECRETS_KEY` must decode to exactly 32 bytes. Missing or malformed key configuration throws. Key rotation and recovery must preserve the ability to decrypt records where that feature is still required; the approved key lifecycle and backup handling are not documented.

Do not include actual PINs or key values in logs, documentation, database exports, or support examples.

## Attachments and signed PDFs

### Ticket attachments

Migration `004_ticket_attachments.sql` stores ticket file bytes in PostgreSQL `bytea`, with MIME types restricted to PNG/JPEG/PDF and an individual SQL row size limit of 3 MiB. The upload route additionally checks the file signature and filename, and the SQL repository caps a ticket at 10 files and 20 MiB total.

Upload/download routes require SQL data mode and use `SqlTicketRepository` directly. They check session, ticket accessibility, and attachment membership. This can differ from the selected ticket backend because `DATA_BACKEND` and `TICKET_BACKEND` are independent.

### Inventory attachments

Migration `007_inventory_attachments.sql` stores inventory attachment bytes in SQL, with category, MIME, size, and asset relationship constraints. Its route-specific authorization and retention behavior must be checked separately; ticket-attachment rules must not be assumed to apply.

### Agreement PDFs

Migrations `011` and `012` add signed agreement PDF bytes and SHA-256 hash. The database checks the hash format and requires consent, signature time, and PDF for `COMPLETED`. Triggers prevent signed document mutation (except access counter changes), deletion of signed forms, and mutation/deletion of agreement events.

`src/lib/sql/agreements.ts` verifies stored PDF length and hash before returning a signed document. Source code does not establish applied migration state or backup coverage.

## Google webhook authentication

`src/app/api/intake/google-form/route.ts`:

- Requires SQL intake mode and configured secret/source ID.
- Requires JSON and limits request size.
- Verifies timestamped HMAC-SHA256 with constant-time comparison.
- Rejects timestamps outside a five-minute window.
- Validates a strict Zod schema and matches the submitted Form identifier.
- Returns explicit 4xx for invalid requests and 503 for disabled or unavailable intake.

The signing secret remains in Apps Script properties and deployment configuration. Rotation requires coordinated change on both sides. The actual property state and rotation process were not inspected.

## External translation privacy

`src/lib/domain/translation.ts` detects Spanish via a marker regex and makes a no-store request to a public Google Translate endpoint with ticket text in the query. It has a four-second timeout and returns `null` for empty/non-Spanish input, failed responses, malformed results, unchanged translation, or caught errors.

The source shows this function exists; whether the production UI invokes it was not established. Before use with real ticket content, the application/privacy owner should determine whether sending request text to the external service is approved, whether users are informed, and whether any sensitive content must be excluded.

## Retention, backups, and deletion

Retention and recovery procedures must be maintained by authorized LACC system owners. This public reference intentionally excludes internal backup schedules, recovery windows, and restore access details. Provider recovery features alone do not establish validated operational coverage.

## Required owner decisions

| Item | Owner |
|---|---|
| Production secret inventory, ownership, and rotation process | Application/Vercel administrator |
| SQL runtime-role grants and database access review | Database owner |
| Retention periods and deletion process by data category | IT operations, privacy, database owner |
| Approved translation use and user notice | Privacy/security and application owner |
| Webhook signing-key rotation and failure alert owner | Google Workspace and application owners |
| Attachment/PDF retention and restore tests | Database owner and IT operations |
