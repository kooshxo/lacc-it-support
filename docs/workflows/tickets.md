# Ticket Workflows

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Status:** source-derived workflow reference; active production backend and Form linkage remain unverified.

This document describes behavior found in the source. It must not be used to infer that a route is enabled, that a user can sign in, or that a particular backend is selected in production.

## Roles and enforcement

Application roles are `EMPLOYEE`, `IT_AGENT`, and `ADMIN`.

- `requireEmployee()` resolves an authenticated application identity or redirects to sign-in.
- `requireAgent()` requires a resolved employee whose role is not `EMPLOYEE`.
- `requireAdmin()` requires role exactly `ADMIN`.
- `canReadTicket()` checks employee requester UID/email and denies unverified requester identities.
- `canManageTickets()` allows only `IT_AGENT` and `ADMIN`.
- `canCreateMessage()` allows employees only `EMPLOYEE_REPLY`; IT roles can create public replies or internal notes.

The baseline Auth.js provider is a shared Credentials provider and works only when `DATA_BACKEND === "sql"`. In that mode, the authenticated identity resolves to generic `IT_AGENT`; it does not provide individual technician attribution or administrator access.

A source-level risk exists in the non-SQL Google Sheets employee lookup: it returns `ADMIN` for any nonempty email. The only provider in this baseline refuses new authentication in non-SQL mode, so this is not confirmed production exposure. Do not enable a different non-SQL identity path without correcting the role lookup.

## Employee request submission

### Portal action

The portal action `createTicketAction()` in `src/app/(portal)/actions.ts` performs:

1. `requireEmployee()`.
2. FormData extraction.
3. `ticketCreateSchema.safeParse()`.
4. Repository selection through `getRepository()`.
5. `createTicket()` call.
6. Redirect to the ticket detail page on success.

The schema requires an operation UUID, subject, description, category, impact, and boolean work-blocked/workaround fields. It bounds text lengths and accepts optional location, asset, and preferred PIN data.

Invalid input returns a generic correction message and field errors. `WorkbookUnavailableError` is returned as an action error; unrecognized errors are rethrown. In SQL mode, the repository creates a ticket and `CREATED` event in one transaction. In Google Sheets mode, `createTicket()` is intentionally unsupported and returns an error directing submissions to the external Form.

### Google Form submission

The external intake path is:

1. Employee submits the Google Form.
2. Apps Script form-submit handler builds the request and signs the body.
3. Apps Script sends it to `/api/intake/google-form`.
4. The route validates body type/size, timestamped signature, strict payload, allowed Form ID, email, request type, and conditional fields.
5. New-hire requests call `createOnboardingRequest()`; other eligible requests call `createGoogleFormTicket()`.
6. The handler returns a new/duplicate result or a specific error response.
7. Apps Script retry logic can retry failed delivery.

The route requires SQL intake configuration and returns 503 when disabled. It returns 415 for wrong content type; 413 for oversized requests; 400 for missing body or malformed JSON; 401 for invalid signature; 403 for the wrong Form; 422 for invalid fields/request type; and 503 for persistence failure. The signature timestamp window is five minutes. No live submission was made during the evidence review.

Form email is supplied by the submitter, not validated against an authenticated session. Created tickets set `requesterIdentityVerified` false. The employee ticket-read policy consequently does not let the submitter retrieve the ticket solely by matching that email; the process for returning a Form-submitted ticket reference is an operational decision not established here.

## Triage and queue

The IT workspace `/it` uses agent authorization in the source. Ticket lists support requester, status, assignee, and free-text query filters through `TicketFilter`.

Implementation details vary by backend:

- SQL list filters are applied over ticket JSON after query. When requester filters are absent, the SQL predicate permits all rows; role enforcement and correct filter selection therefore depend on the calling page/action.
- Google Sheets filters mapped rows in application code and sorts newest first.
- Graph/Excel reads workbook tables through Microsoft Graph.
- Fixture mode is disabled in production by the selector.

Verify the deployed UI filters and production adapter before publishing exact technician click-by-click instructions.

## Status and resolution

Canonical statuses and labels:

| Canonical value | Label |
|---|---|
| `NEW` | Received |
| `IN_PROGRESS` | In Progress |
| `RESOLVED` | Solved |

Legacy values normalize for reads: `ASSIGNED`, `WAITING_ON_USER`, and `WAITING_ON_VENDOR` become `IN_PROGRESS`; `CLOSED` and `SOLVED` become `RESOLVED`.

The update action derives status from a `resolved` checkbox. If checked, status is `RESOLVED`; if not checked and the submitted current status was resolved, it requests `IN_PROGRESS`; otherwise it preserves the submitted current status. It validates using `ticketUpdateSchema`, requires a `completedBy` value when resolving, and passes an expected row version and operation UID.

SQL update behavior is transactional, locks the row, checks the expected version, updates ticket JSON/version, and creates an event and/or internal-note message. On resolving, it sets `resolvedAt`, clears `reopenedAt`, and stores `completedBy`. On reopening, it sets `reopenedAt` if the previous ticket was resolved, and clears `resolvedAt` and `completedBy`.

Google Sheets updates status/resolution columns in the source row after a version check. It does not create SQL event or message history.

### Assignment limitation

The model includes `assigneeUid`; list filtering accepts `assigneeUid`. However, `ticketUpdateSchema` has no assignee field, `updateTicketAction()` does not read one, and the reviewed SQL and Google update methods do not write one. This source path does not implement technician assignment. Do not instruct technicians to assign or reassign tickets until a separate supported operation is verified.

## Messages, notes, and history

The repository contract defines `addMessage()`. The SQL implementation enforces `canCreateMessage()` and persists messages with an operation UID. Employees may create only employee replies; IT roles may create public replies or internal notes.

SQL ticket detail hides internal notes from employees and returns no event history to employees. `describeTicketEvent()` formats stored events for display. `ticketEventActor()` intentionally displays the shared account generically.

The Google Sheets adapter returns empty message and event lists and throws for message creation. It also throws for attachment writes. Do not claim equivalent conversation history across backends. A specific end-user message UI path should be documented only after verifying its current call site and deployed screen.

## Search, detail, and permission failures

The ticket GET route calls `getOptionalEmployee()`, then the selected repository’s `getTicketByNumber()`. It returns 401 without a resolved actor, 404 if no ticket exists, 403 on `AuthorizationError`, and 503 for other failures. Successful JSON is marked private and no-store.

For employee reads, the policy requires requester match and verified identity. For staff roles, `canReadTicket()` allows non-employee roles to read. The ticket list API is not equivalent to the single-ticket detail path; inspect its caller and filters before claiming requester isolation for every list response.

## Attachments

Ticket attachment upload/download is available in source only when `DATA_BACKEND === "sql"`; otherwise the route returns 409. The route uses `SqlTicketRepository` directly, regardless of the independently selected ticket repository.

Uploads require a resolved actor and accessible ticket, check optional request Origin, validate PNG/JPEG/PDF MIME and file signature, limit files to 3 MiB, sanitize filenames, and call the SQL repository. The repository limits a ticket to 10 attachments and 20 MiB total. The migration stores bytes in `lacc_attachments.content`.

Downloads repeat authentication and ticket access checks, verify attachment membership on the ticket, then query the content. Missing/invalid attachment IDs return 404; denied access returns 403. A mismatch between `DATA_BACKEND` and ticket repository can mean the SQL attachment route cannot find tickets stored only in Google Sheets or Graph.

## Failure and recovery reference

| Symptom | Source behavior | Safe recovery |
|---|---|---|
| Portal create validation error | Returns field errors without repository write | Correct input and resubmit |
| Create backend unavailable | `WorkbookUnavailableError` is surfaced as action state | Ask app owner to verify selected adapter and service health |
| SQL duplicate create operation | Loads prior ticket and verifies requester UID | Reuse request correlation; do not manually create a second row |
| Form intake disabled | 503 from route | Ask deployment owner to verify selector/configuration metadata |
| Form signature rejected | 401 | Ask integration owners to check clock/signature configuration without sharing the secret |
| Wrong Form identifier | 403 | Confirm intended Form linkage with Workspace owner |
| Invalid Form fields | 422 | Compare form schema/request type with route validation |
| Form persistence unavailable | 503 with retry-after | Check approved application and Apps Script execution logs; let configured retry process run |
| Stale ticket edit | `ConflictError` | Reload and review current ticket before retry |
| Ticket missing | 404/`NotFoundError` | Confirm ticket reference and active backend |
| Access denied | 403/`AuthorizationError` or route redirect | Verify role/requester identity through the owner; do not bypass the guard |
| Message or attachment on Google backend | Repository returns unsupported-operation error | Use only an approved supported intake path; no automatic SQL fallback is implemented |
| Attachment rejected | 400, 403, 404, or 409 depending on validation/access/backend | Correct file or ask app owner to confirm selector and ticket store |

Unhandled Server Action errors propagate to framework error handling. The source does not define a complete operator alerting or incident runbook.

## Synthetic example

> **Ticket:** `DEMO-0001`  
> **Requester:** Pat Example (`pat.example@invalid.example`)  
> **Request:** “Please help reconnect my sample laptop to the test printer.”  
> **Initial status:** `NEW` / Received  
> **Technician update:** set priority and status to `IN_PROGRESS`  
> **Internal note:** “Reproduced in the lab; check the approved test driver.”  
> **Resolution:** “Installed the test driver and confirmed a sample print.”  
> **Resolved status:** `RESOLVED` / Solved

All names, addresses, ticket IDs, and device references in this example are fictional.

## Source references

- `src/app/(portal)/actions.ts`: `createTicketAction()`, `updateTicketAction()`
- `src/lib/authz.ts`: `getOptionalEmployee()`, `requireEmployee()`, `requireAgent()`
- `src/lib/identity.ts`: `staffRole()`
- `src/lib/domain/schemas.ts`: `ticketCreateSchema`, `ticketUpdateSchema`, `messageCreateSchema`, `attachmentSchema`
- `src/lib/domain/policy.ts`: `canReadTicket()`, `canManageTickets()`, `canCreateMessage()`
- `src/lib/domain/ticket-status.ts`: `canonicalTicketStatus()`
- `src/lib/domain/resolution.ts`: `isTicketResolved()`, `ticketResolutionTimestamp()`, `effectiveCompletedBy()`
- `src/lib/domain/ticket-activity.ts`: `describeTicketEvent()`, `ticketEventActor()`
- `src/lib/excel/index.ts`: `getRepository()`
- `src/lib/sql/repository.ts`: SQL create/update/message/attachment persistence
- `src/lib/google-sheets/repository.ts`: sheet read/update and unsupported operations
- `src/app/api/tickets/[ticketNumber]/route.ts`: ticket detail API
- `src/app/api/tickets/[ticketNumber]/attachments/route.ts`: attachment access
- `src/app/api/intake/google-form/route.ts`: signed Form intake
- `src/lib/sql/google-form-intake.ts`: deterministic ID and transactional ticket create
- `integrations/google-forms/Code.gs`: trigger installation, submit, and retry logic
