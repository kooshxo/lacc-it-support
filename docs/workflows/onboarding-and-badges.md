# Onboarding and Badge Requests

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** Forms and SQL paths exist in source; active production linkage and backend selection are unknown.

## Important scope boundary

These workflows collect and track requests. They do not create Active Directory accounts, Exchange mailboxes, badge records, VPN access, cellphone accounts, or shared-drive permissions. No such provisioning operation is performed by the reviewed ticket or onboarding code.

A submitted request is a work item for authorized staff. Actual provisioning must follow separate LACC approval and operating procedures.

## New-hire setup request

The application page `/requests/onboarding/new` requires `requireEmployee()`, then verifies the resolved role is `EMPLOYEE`. It is unavailable unless `DATA_BACKEND === "sql"`.

The form requests:

- First and last name.
- Start date and optional need-by date.
- One or more IT needs (including computer/email accounts, setup, badge, VPN, and device requests).
- One or more work locations.
- Shared-drive folder/access details.
- Equipment and main-work-task details.
- Main LACC contact email.

The form explicitly tells users not to include passwords. `onboardingRequestSchema` validates names, dates, selected needs/locations, bounded detail fields, and the email suffix. Required arrays must contain at least one item.

`submitOnboardingRequest()` in `src/app/(portal)/it/onboarding/actions.ts`:

1. Requires employee role.
2. Requires SQL mode.
3. validates submitted values with the onboarding schema.
4. Calls `createOnboardingRequest()`.
5. Revalidates the IT onboarding queue and redirects with success/error status.

The SQL function stores a row in `it_onboarding_requests`, defaulting status to `New`, and writes an `it_operations_audit` event. If a supplied request ID already exists, it checks that `requested_by` matches before treating it as a duplicate.

The source also contains a Google Form intake route that accepts new-hire request types with a `newHire` payload. That route creates an onboarding request using a deterministic ID derived from Form and response identifiers, so retries can be recognized. The Form path is separate from the authenticated portal page.

## IT onboarding queue

The IT onboarding actions are `changeOnboardingStatus()` and the associated queue page under `/it/onboarding`.

`changeOnboardingStatus()` requires `requireAgent()`, validates a UUID request ID and status (`New`, `In progress`, or `Complete`), checks SQL mode, calls `updateOnboardingStatus()`, writes an audit action, revalidates the queue, and redirects.

The status field tracks request progress only. “Complete” does not attest that every requested external system was provisioned; staff must follow and record the appropriate operational work.

## Badge requests

Badge/access requests enter through the Google Form integration. Supported request categories include new badge, replacement badge, access/PIN-only help, and other. Form fields can include work email, name, department, phone/extension, location, details, replacement badge number, and badge display name.

`src/lib/domain/badge-request.ts` defines a request schema for badge-related data, including required details and replacement badge number validation. The actual external Form route has its own strict schema in `src/app/api/intake/google-form/route.ts`; it maps supported form labels to ticket categories and creates a SQL ticket through `createGoogleFormTicket()`.

The resulting ticket is a request record. The route does not call a badge system, Active Directory, Exchange, or a physical access control system. If the request is for access/PIN help, the description is stored in a ticket; the route does not change credentials or grant access.

## Authentication and identity caveat

The Form is not an authenticated application session. It validates a supplied work email but marks the ticket requester identity unverified. Employee self-service ticket access is not granted solely because the email matches.

The employee portal path requires an `EMPLOYEE` role; the baseline shared Credentials provider resolves a generic IT agent in SQL mode and does not establish individual employee authentication. Effective production behavior is unknown.

## Operational handling

For a new-hire or badge request, authorized staff should:

1. Review the submitted request and confirm requester/manager identity through approved LACC procedures.
2. Clarify missing details using the organization’s approved communication path.
3. Separate the request into approved provisioning tasks and assign them under existing IT procedures.
4. Perform each account, mailbox, access, equipment, or badge operation only through its authorized system and approval process.
5. Record the completion result in the ticket/onboarding workflow without putting passwords, tokens, PINs, or unnecessary personal data in notes.
6. Mark the request status complete only when the responsible staff member confirms the tracked work is finished.

This procedure is operational guidance, not evidence that these systems are integrated with the application.

## Failure cases

- Portal onboarding unavailable outside SQL mode.
- Form endpoint unavailable if SQL intake configuration is disabled.
- Invalid/missing Form fields or mismatched new-hire request type produce a validation response.
- Duplicate Form retry is returned as a duplicate instead of creating a second request.
- Database failure returns a temporary-unavailability error; Apps Script retry behavior is described in the Google Forms intake document.
- Unauthorized employee/agent paths redirect or deny based on role.

## Sources

- `src/app/(portal)/requests/onboarding/new/page.tsx`
- `src/app/(portal)/it/onboarding/actions.ts`
- `src/app/(portal)/it/onboarding/`
- `src/lib/domain/onboarding.ts`
- `src/lib/domain/badge-request.ts`
- `src/lib/sql/it-operations.ts`
- `src/app/api/intake/google-form/route.ts`
- `src/lib/sql/google-form-intake.ts`
- `migrations/009_it_operations.sql`
