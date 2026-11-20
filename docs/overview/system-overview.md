# System Overview

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** source capabilities are not equivalent to verified production workflows. Effective ticket and operational backend values remain unknown.

## Purpose and scope

LACC IT Support is a Next.js application for IT support intake and staff operations. The baseline contains ticket request and management code, a Google Form intake route, multiple ticket repository adapters, SQL operations for inventory/onboarding/printers/agreements, and related pages and APIs.

The application is hosted on Vercel. Neon provides a SQL persistence option. Google Forms/Apps Script and Google Sheets have source integrations; Microsoft Graph/Excel is another ticket adapter. Which adapter is active in production was not verified.

## Users and roles

The domain roles in `src/lib/domain/models.ts` are `EMPLOYEE`, `IT_AGENT`, and `ADMIN`.

- **Employee:** intended to create requests and access their own verified ticket. `canReadTicket()` denies an employee a ticket if `requesterIdentityVerified === false`, otherwise it matches requester UID or case-insensitive email. `canCreateMessage()` permits employees to create only `EMPLOYEE_REPLY`.
- **IT agent:** `canManageTickets()` permits `IT_AGENT` and `ADMIN` to manage ticket work. `requireAgent()` rejects only `EMPLOYEE`.
- **Administrator:** `canAccessAdmin()` and `requireAdmin()` require exactly `ADMIN`.
- **Google Form submitter:** submits without an application session. The route treats the email as supplied form content, not identity proof.

### Identity limitation and authorization risk

`src/auth.ts` configures only a shared Credentials provider. Sign-in is rejected unless `DATA_BACKEND === "sql"`. In SQL mode, `getOptionalEmployee()` resolves that session to generic `IT_AGENT`; it does not grant administrator access.

Outside SQL mode, `getOptionalEmployee()` uses session email, applies the production `staffRole()` allowlist check, and then calls the selected repository’s employee lookup. The Google Sheets repository currently returns an `ADMIN` role for any nonempty email. The configured provider cannot issue a new session in non-SQL mode, which blocks the ordinary path in this baseline; nevertheless, the repository role behavior is a source-level authorization risk if another session issuer or alternate auth implementation is introduced. See [Current Architecture](../architecture/current-architecture.md) and [Trust Boundaries](../architecture/trust-boundaries.md).

## Ticket capability

The source includes:

- Ticket create and update Server Actions in `src/app/(portal)/actions.ts`.
- Ticket domain models, Zod validation, role policy, status normalization, resolution logic, and event display helpers in `src/lib/domain/`.
- A repository interface in `src/lib/excel/repository.ts`.
- SQL, Google Sheets, Microsoft Graph/Excel, and fixture repository implementations.

The `Ticket` model has an `assigneeUid`, and the repository interface supports assignee filtering. The examined update schema and ticket update action do not accept an assignee field, and the SQL/Google update paths do not modify assignment. Therefore, source presence of an assignee field does not establish an assignment workflow.

### Provider differences

| Ticket backend | Source behavior |
|---|---|
| SQL | Stores ticket JSON, events, messages, and attachment bytes in relational tables; create/update transactions and row-version conflict checks are implemented |
| Google Sheets | Reads mapped rows and writes selected status/resolution columns; create, message, and attachment writes are not supported by this adapter; event listing is empty |
| Graph/Excel | Uses a workbook session through Microsoft Graph; live permissions and table configuration were not verified |
| Fixture | Non-production fixture adapter; selector explicitly throws if selected in production |

Ticket adapter selection in `getRepository()` is `TICKET_BACKEND ?? DATA_BACKEND ?? "graph"`. The SQL operational/authentication paths are selected separately through `DATA_BACKEND`.

## Google Forms intake

`integrations/google-forms/Code.gs` contains a form-submit handler and retry logic. The corresponding `src/app/api/intake/google-form/route.ts` is configured as a Node.js, force-dynamic route.

The route is available only when `DATA_BACKEND === "sql"` and required intake configuration exists. It checks JSON content type, a 20,000-byte body limit, a timestamped HMAC signature with a five-minute age limit, strict request schema, an allowed source Form ID, and request-type conditions. It then writes a ticket or onboarding request to SQL.

Form email is not treated as verified identity: `createGoogleFormTicket()` sets `requesterIdentityVerified` to false. That flag causes the employee ticket-read policy to deny access based on the submitted email alone.

Apps Script source contains installation logic that configures triggers and changes Form response settings. Trigger rows were seen in a prior GUI review, but the project was not conclusively tied to the production Form. Thus the intake path is implemented in source; live linkage and delivery remain unverified.

## Inventory, custody, issues, and attachments

The inventory schema and source operations cover assets, people, imports/source records, custody, changes, audit events, issues, and inventory attachments. Relevant tables are defined in migrations `002` and `005`–`007`.

Inventory records include JSON payloads; operational fields such as version, update time, custody return time, and issue status are separate columns. Table presence was observed in Neon metadata, but this does not prove the feature is enabled, data is populated, or a given page is in operational use.

## Onboarding and printer directory

Migration `009_it_operations.sql` defines onboarding request rows, a printer directory using PostgreSQL `inet` for its address column, and IT operations audit rows. The intake route can send new-hire submissions to `createOnboardingRequest()` when the request type and accompanying `newHire` object match.

Do not interpret this workflow as account provisioning. The application schema explicitly does not represent credentials/passwords, and this documentation scope does not assert that any identity or badge system is connected.

## Agreements

Migrations `011` and `012` define agreement forms, expiry, attempt counters, signature consent, signed PDF bytes/hash, and agreement event history. Migration 012 creates database triggers that prevent mutation/deletion of signed documents and changes to agreement event history.

Production metadata showed agreement tables present. That verifies schema presence only, not feature enablement, actual agreement records, retention, or end-to-end signing behavior.

## External dependencies

- **Vercel:** Next.js hosting and deployment routing. Deployment protection is a platform-level gate, not app-level role enforcement.
- **Neon/PostgreSQL:** SQL backend and operations data path; effective production selection is unknown.
- **Google Forms and Apps Script:** source-supported external intake.
- **Google Sheets:** optional ticket adapter and related staff-option lookup.
- **Microsoft Graph/Excel:** alternate/fallback ticket adapter.
- **Entra ID:** verified tenant and AD synchronization were established separately, but Entra sign-in/MFA is not established in this source baseline.
- **Exchange:** No Exchange mailbox provisioning or .NET/C# automation exists in the audited application.

## Deployment distinctions

The canonical production alias was observed mapping to a READY deployment built from the baseline commit. A newer READY production-target deployment at `e4ddb54e38c18b8bc80df32d95ab93fe82382b36` was not shown mapped to that alias. Current promotion status requires a fresh alias check.

The repository does not establish effective runtime `DATA_BACKEND` or `TICKET_BACKEND`. Those values were not inspected because the available Vercel environment read would expose the whole secret-bearing set.

## Limitations and unresolved questions

| Unknown | Responsible owner | Documentation consequence |
|---|---|---|
| Active production ticket and operations selectors | Vercel administrator and application owner | Cannot state which persistence path is live |
| Apps Script project/Form linkage and delivery health | Google Workspace administrator | Cannot publish the Form path as confirmed production intake |
| Entra role claims, MFA policy, and sign-in implementation | Entra administrator and application owner | Cannot describe Entra as active application authentication |
| Exact applied migrations and runtime DB privileges | Database owner | Cannot claim all source schema is deployed or usable |
| Assignment workflow | Application owner and IT operations | Must not describe ticket assignment as supported until implemented/verified |
| Agreement workflow use and retention | Application and IT operations owners | Schema existence does not establish operational process |

## Principal source references

- `src/auth.ts`
- `src/lib/authz.ts`
- `src/lib/identity.ts`
- `src/lib/domain/models.ts`
- `src/lib/domain/policy.ts`
- `src/lib/excel/index.ts`
- `src/lib/sql/repository.ts`
- `src/lib/google-sheets/repository.ts`
- `src/app/(portal)/actions.ts`
- `src/app/api/intake/google-form/route.ts`
- `integrations/google-forms/Code.gs`
- `migrations/001_tickets.sql` through `migrations/012_signed_agreement_documents.sql`
