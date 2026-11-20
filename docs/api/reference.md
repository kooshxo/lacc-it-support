# API and Server Action Reference

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Note:** Server Actions are framework endpoints and not a stable public HTTP API. Backend selections and production availability are unverified.

## Route Handlers

| Method and route | Auth / validation | Persistence and responses |
|---|---|---|
| `GET, POST /api/auth/[...nextauth]` | Auth.js handlers from `src/auth.ts`; only shared Credentials provider is configured; provider requires SQL mode | Auth.js sign-in/session/callback responses. Credentials do not authenticate in non-SQL mode. |
| `GET /api/health` | `getOptionalEmployee()` and role exactly `ADMIN`; otherwise 403 | Returns selected repository `healthCheck()` JSON with private/no-store. SQL health schema marker is static `"009"`. |
| `POST /api/intake/google-form` | Requires SQL mode/config; JSON, <=20,000 bytes, timestamp/HMAC within five minutes, strict schema, allowed Form ID | Creates SQL onboarding request or ticket; 201 new, 200 duplicate; 400, 401, 403, 413, 415, 422 validation failures; 503 disabled/persistence failure. |
| `GET /api/tickets/[ticketNumber]` | Requires resolved employee; repository checks ticket read authorization | 200 ticket detail; 401 no actor; 403 denied; 404 missing; 503 generic support-data error. Private/no-store. |
| `POST /api/tickets/[ticketNumber]/attachments` | SQL `DATA_BACKEND` required; optional Origin check; actor and ticket access; Zod metadata, PNG/JPEG/PDF signature, <=3 MiB | Stores SQL attachment bytes. 201 attachment metadata; 400 invalid file/body; 401 sign-in; 403 origin/access; 404 missing ticket; 409 backend/limit; other errors propagate. |
| `GET /api/tickets/[ticketNumber]/attachments?id=...` | SQL mode, actor, ticket access, ID belongs to ticket | Returns attachment bytes with private/no-store and `nosniff`; 401/403/404/409 or propagated server error. |
| `GET, POST /api/inventory/[assetId]/attachments` | Requires non-employee actor, existing asset, optional Origin match. POST validates category, MIME, file signature, 1–3 MiB | POST stores attachment and audit event; 201 metadata, 400 file, 401 auth, 403 origin/role, 404 asset, 413 per-asset limit. GET returns bytes or 404. |
| `POST /api/agreement/access` | SQL mode, optional Origin match, <=2,048 bytes, valid bearer token and access counter | Returns limited agreement projection. 404 unavailable/expired/revoked/disabled; 400 body; 403 origin. No session required. |
| `POST /api/agreement/sign` | SQL + electronic agreement flag; Origin, <=4,096 bytes, valid name and consent; token attempt limit | Produces completed PDF and audit event through SQL transaction. 400 invalid body/name/consent; 403 Origin; 404 disabled; 409 unavailable/stale/attempt limit. |
| `POST /api/agreement/document` | SQL + feature flag; Origin; token/access attempt; completed, unexpired, unrevoked agreement | Returns verified PDF inline with hash header; 400/403/404 otherwise. No session required; possession of token is authorization. |
| `GET /api/inventory/agreements/[agreementId]/document` | `requireAgent()` and SQL mode | Returns signed PDF inline, private/no-store; 404 unavailable/missing. |
| Other `src/app/api/**/route.ts` | None found in the baseline tree | Recheck the pinned source tree when adding routes. |

### Synthetic Form request example

The endpoint expects a signed request. This example intentionally omits signature and source identifiers; it is not directly executable.

```json
{
  "formId": "SYNTHETIC_FORM",
  "responseId": "SYNTHETIC_RESPONSE",
  "submittedAt": "2026-01-01T12:00:00Z",
  "answers": {
    "email": "pat.example@invalid.example",
    "name": "Pat Example",
    "department": "Example",
    "phone": "",
    "extension": "",
    "requestType": "Other",
    "details": "Synthetic test request",
    "newHire": null,
    "badgeNumber": "",
    "badgeName": "",
    "location": "Synthetic site"
  }
}
```

## Important Server Actions

### Ticket actions — `src/app/(portal)/actions.ts`

- `createTicketAction(state, FormData)`: `requireEmployee()`, `ticketCreateSchema`, selected repository `createTicket()`, redirects on success. Validation returns field errors; `WorkbookUnavailableError` becomes action state; other failures propagate.
- `updateTicketAction(ticketUid, ticketNumber, state, FormData)`: `requireAgent()`, derives status, validates `ticketUpdateSchema`, requires completer when resolving, calls repository update, revalidates ticket and queue. Authorization/conflict/not-found/storage exceptions become action errors. The update schema does not contain assignee, so this action does not assign tickets.

### Inventory — `src/app/(portal)/inventory/actions.ts`

`inventoryAction(FormData)` accepts operations `create`, `save`, `assign`, `return`, `retire`, `issue`, `resolve_issue`, and agreement actions. It requires agent and SQL mode, validates operation-specific Zod input, calls `src/lib/inventory/repository.ts` or agreement functions, then revalidates inventory routes. Conflicts and expected domain errors redirect with a message; unexpected failures become generic save errors.

### People

`personAction(FormData)` requires agent and SQL mode; validates person fields and optional version; calls `savePerson()`. It maps validation/conflict/storage errors to redirects.

### Onboarding

- `submitOnboardingRequest(FormData)`: employee-only; validates `onboardingRequestSchema`; SQL insert and audit; redirects with submitted/error status.
- `changeOnboardingStatus(FormData)`: agent-only; validates UUID/status; updates onboarding status and audit event.

### Printer directory

`savePrinterReference(FormData)` requires agent and SQL mode, validates location and fields, validates IP address syntax with `node:net:isIP`, calls `upsertPrinterReference()`, and redirects. Invalid values or persistence errors redirect with an error message.

Server Actions should be called through their rendered forms; do not construct undocumented direct HTTP requests to framework action endpoints.

## Error and privacy conventions

- Route Handler JSON error shapes are generally `{ "error": "..." }`.
- Agreement routes use no-store/no-referrer/noindex headers because they carry bearer-token access.
- Ticket detail and attachment responses are private/no-store.
- Do not log or publish real tokens, signatures, ticket content, file bytes, employee details, or internal addresses.
- A status code is source behavior, not proof that the production route is enabled.
