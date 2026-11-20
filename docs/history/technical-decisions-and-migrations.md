# Technical Decisions and Migration History

> **Source baseline:** production-alias commit `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Purpose:** separate source history and observed deployment metadata from inferred design intent.

## Architecture timeline (evidence-qualified)

The repository contains several ticket-storage implementations: Google Sheets, Microsoft Graph/Excel, SQL, and fixture. `getRepository()` selects among them using `TICKET_BACKEND ?? DATA_BACKEND ?? "graph"`. The source does not prove which is active in production.

Documentation and branches have described different operational states, including spreadsheet-backed tickets, Graph/Excel storage, SQL cutover, and Entra authentication. Those documents are historical evidence of intended or earlier designs, not authoritative runtime configuration.

At the evidence date, the canonical production alias was associated with commit `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`. A later READY production-target deployment at `e4ddb54e38c18b8bc80df32d95ab93fe82382b36` was not confirmed as promoted to the canonical alias. It includes a staged Safari PDF hotfix; do not describe that fix as production behavior without a fresh alias check.

## Ticket storage evolution

- **Google Sheets adapter:** `src/lib/google-sheets/repository.ts` maps sheet rows into ticket objects and writes selected ticket completion/status fields back to the sheet. It does not support message storage, attachment storage, or event listing in this implementation.
- **Microsoft Graph/Excel adapter:** `src/lib/excel/graph-repository.ts` uses workbook tables and `GraphExcelClient` sessions. Source supports retry handling for transient Graph responses. Live workbook permissions/configuration were not verified.
- **SQL adapter:** `src/lib/sql/repository.ts` stores ticket payloads in `lacc_tickets.data` and related messages/events/attachments in tables.
- **Google Forms intake:** separate signed webhook path writes to SQL; it is not a bidirectional synchronization process between SQL and the Google Sheets adapter.

The presence of multiple adapters means a cutover must explicitly reconcile reads, writes, IDs, historical rows, attachments, and operational ownership.

## Authentication evolution and current baseline

At baseline `src/auth.ts` configures a shared Credentials provider that works only in SQL mode. Successful authentication becomes a generic IT agent. Entra OIDC is not configured in this source file.

The source contains environment names and older code paths for Microsoft/Google integrations, but a variable or historical document is not proof of an active provider. Entra transition remains planned.

A source-level Google Sheets identity fallback returns `ADMIN` for any nonempty email. Current Credentials-only authentication blocks new non-SQL sign-in at this baseline, so production exposure is not confirmed. This behavior must be corrected before adding an alternate non-SQL identity provider.

## Migration provenance

| Migration | Subject |
|---|---|
| `001_tickets.sql` | Ticket rows, events, messages, request-secret storage |
| `002_inventory.sql` | Inventory imports, source records, people, assets, custody, changes |
| `003_ticket_source_rows.sql` | Ticket import and source-row provenance |
| `004_ticket_attachments.sql` | Ticket attachments stored in SQL |
| `005_inventory_operations.sql` | Person version fields, inventory indexes, audit events |
| `006_inventory_issues.sql` | Repair/missing/damaged issue records |
| `007_inventory_attachments.sql` | Asset attachment storage |
| `008_google_form_intake.sql` | Unique Form/response identity index |
| `009_it_operations.sql` | Onboarding requests, printer directory, operations audit |
| `010_auth_login_limits.sql` | Shared login attempt limits |
| `011_agreement_forms.sql` | Agreement link/status/expiry/tracking schema |
| `012_signed_agreement_documents.sql` | Consent, signed PDF/hash, agreement event and immutability protections |

The SQL runner applies sorted migration files but does not maintain its own applied-version ledger. Exact live schema state must be checked with the database owner. Agreement tables were present in production metadata even though some earlier documentation characterized them as preview-only; the metadata does not prove the feature was operational.

## Decisions and constraints visible in code

These are source facts; some rationale is not recorded and should not be invented:

- Ticket payloads are primarily JSONB, with relational IDs/version/indexes.
- Operation IDs, unique source identities, and row versions support replay handling and concurrency.
- Inventory custody allows only one open custody row per asset.
- Form ticket identity is marked unverified, preventing email-only employee self-read.
- Agreement tokens are stored hashed; signed PDFs are stored with SHA-256 and protected by database triggers.
- Backend safety checks compare deployed environment to approved SQL/spreadsheet allowlists.
- Attachments are stored as SQL bytea with strict file-type and size limits.
- Exchange automation and individual Entra OIDC authentication are not implemented in the audited baseline.

Do not present these constraints as a formal ADR unless the original rationale and decision owner are confirmed.

## Historical deployment and documentation inconsistencies

- Production alias source differs from default `main`; local checkout at review time was clean but at another commit.
- A later production-target deployment existed but was not alias-mapped in available evidence.
- README, architecture, SQL-cutover, Google Form, agreements, inventory migration, and security documentation have contained conflicting statements about active storage/authentication.
- The effective production `DATA_BACKEND` and `TICKET_BACKEND` were not inspected because the available environment-read method could expose secret-bearing values.

## Proposed decision-record practice

For future changes, record: problem, options considered, approved decision, owner, security/data impact, migration/rollback plan, source commit, deployment status, and superseded documentation. Mark proposed decisions as PLANNED until implementation and runtime verification are complete.
