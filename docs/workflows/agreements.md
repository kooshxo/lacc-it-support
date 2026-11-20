# Equipment Agreements

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** agreement schema was present in production metadata, but production feature enablement and use are not confirmed.

## Two distinct workflows

The code supports both historical paper tracking and an electronic laptop-signing workflow.

- **Electronic workflow:** a tokenized seven-day link, consented signature, generated flattened PDF, integrity hash, and event log.
- **Legacy paper tracking:** records a signed paper agreement as printed and handed off. These records do not represent electronic signature.

The electronic workflow is gated by `ELECTRONIC_AGREEMENTS_ENABLED === "true"` and SQL storage readiness. Source code does not prove it is enabled in production.

## Creation

An IT agent opens the asset detail page and chooses “Create laptop signing link.” The UI is shown only for a laptop asset with an active assignment and configured agreement storage/workflow. The user must confirm review of the approved letter and equipment details.

`inventoryAction()` in `src/app/(portal)/inventory/actions.ts` checks:

- Agent authorization and SQL mode.
- Electronic agreement feature flag.
- Required agreement tables.
- Review confirmation.

It calls `createAgreementForCurrentAssignment()` in `src/lib/sql/agreements.ts`. That function starts a transaction and rechecks the asset, laptop category, current assignment/custody, and active person. It snapshots selected asset/person/custody details and approved terms into `data`, generates a 32-byte random URL-safe token, stores only SHA-256(token) in `token_hash`, sets expiry to seven days, inserts `LINK_CREATED` event, and commits. The raw token is returned once to the action result and displayed for staff to deliver securely.

The token is a bearer secret: anyone holding it can access the public signing workflow until it expires, is revoked, or reaches its attempt limits. Do not place it in logs or public issue comments.

## Link access and viewing

The public page uses the token and `POST /api/agreement/access`. The route:

- Requires SQL mode.
- Checks Origin when present.
- Caps declared request body at 2,048 bytes.
- Validates token format.
- Increments an access attempt, with maximum 50.
- Requires unexpired, unrevoked token.
- Returns a limited public projection of agreement fields, not the complete row.
- Uses private/no-store, no-referrer, and noindex/nofollow headers.

A valid token does not require a logged-in staff session. That is intentional for the signer, so token protection and disclosure minimization are important.

## Signing and PDF generation

The signer enters a name and confirms electronic-signature consent. `POST /api/agreement/sign` checks SQL mode, feature flag, optional Origin, request size, signer name and consent. It consumes one of at most five signing attempts.

`signAgreement()` rechecks the token, status, expiry, revocation, attempt count, and current active custody assignment while holding locks. It loads the approved background template and calls `renderLaptopAgreementPdf()` from `src/lib/agreements/laptop-pdf.ts`. The renderer creates a one-page flattened PDF with data drawn as page content, not editable AcroForm fields. It formats dates in the configured Eastern time zone and rejects fields too long for the layout.

The PDF is capped at 5 MiB, hashed with SHA-256, and stored with consent text, signer name, timestamp, and `COMPLETED` status in a transaction. The custody row is updated with signed status/date, and an `ELECTRONICALLY_SIGNED` event is inserted. Database constraints require consent, signed time, and PDF for `COMPLETED`; triggers protect the signed document and append-only event history.

A failed template read, PDF render, storage operation, or integrity constraint rolls back the transaction and surfaces as an error. A stale, revoked, expired, nonpending, or no-longer-current assignment returns a conflict/unavailable response.

## Signed PDF access

- Public token endpoint: `POST /api/agreement/document`. Requires feature enabled, valid token, access attempt, completed status, unexpired and unrevoked record. Returns PDF bytes inline with integrity hash header.
- Staff endpoint: `GET /api/inventory/agreements/[agreementId]/document`. Requires `requireAgent()` and SQL mode. Returns PDF only for a completed record.
- `verifyPdf()` checks minimum/maximum byte length and recomputes SHA-256 before returning stored content.

The Safari PDF hotfix is associated with staged commit `e4ddb54e38c18b8bc80df32d95ab93fe82382b36`. The verified production alias remained associated with `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535` at the evidence date; the staged hotfix must not be described as live unless alias promotion is independently confirmed. This document does not claim the hotfix’s runtime behavior is deployed.

## Print, handoff, and revocation

For electronic completed agreements, staff view/download the stored signed PDF from the authenticated agreement record and may print it using the browser/OS. Source code does not record a separate electronic workflow print/handoff status after completion.

For legacy paper records:

- `mark_printed` is allowed only from `SIGNED`.
- `mark_handed_off` is allowed only after `PRINTED`.
- `updateAgreementTracking()` records timestamp, actor, status (`PRINTED` or `HANDED_OFF`), and the corresponding `LEGACY_PRINTED` or `LEGACY_HANDED_OFF` event.

`revokePendingAgreement()` only revokes a still-active, unexpired, pending link. It writes `revoked_at`/`revoked_by` and a `REVOKED` event. A signed/completed agreement cannot be revoked through this function.

## Status and integrity controls

Lifecycle states include `PENDING`, `SIGNED`, `PRINTED`, `HANDED_OFF`, and `COMPLETED`. The source uses `COMPLETED` for electronic signing. Legacy states are historical workflow values. Expiration is based on `expires_at`; revocation and expiration prevent public access.

Migration 012 enforces signed PDF hash shape, completion prerequisites, one electronic signature event, signed document immutability (except access counter), nondeletion of signed rows, and append-only agreement events. These guarantees depend on migration 012 being applied and database triggers remaining enabled.

## Failure and recovery

| Condition | Expected behavior |
|---|---|
| Feature flag or agreement tables unavailable | Link creation/signing disabled |
| Asset not laptop or no active assignment/person | Creation rejected |
| Link invalid/expired/revoked/attempt-limited | Public endpoint returns unavailable/not found/conflict response |
| Assignment returned or changed before signing | Sign operation rejected |
| Signer name or consent invalid | 400 validation response |
| PDF too large or field cannot fit | Transaction fails; no completed record |
| Stored PDF hash mismatch | Download fails integrity validation |
| Legacy print/handoff out of order | Server rejects transition |
| Database failure | Transaction rollback; operator verifies record/event state before retry |

Do not create a duplicate link blindly after a timeout; first inspect the agreement record through the authorized staff UI. No real agreement was created or signed during discovery.

## Sources

- `src/app/(portal)/inventory/actions.ts`
- `src/app/(portal)/inventory/agreements/page.tsx`
- `src/app/(portal)/inventory/agreements/[id]/page.tsx`
- `src/lib/sql/agreements.ts`
- `src/lib/sql/agreement-state.ts`
- `src/lib/agreements/laptop-pdf.ts`
- `src/app/api/agreement/access/route.ts`
- `src/app/api/agreement/sign/route.ts`
- `src/app/api/agreement/document/route.ts`
- `src/app/api/inventory/agreements/[agreementId]/document/route.ts`
- `migrations/011_agreement_forms.sql`, `migrations/012_signed_agreement_documents.sql`
