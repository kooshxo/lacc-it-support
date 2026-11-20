# Authentication and Authorization

> **Status:** describes source behavior at the verified production-alias baseline; proposed Entra work is PLANNED.  
> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** the effective production backend selectors and current Entra policy configuration were not verified.

## Current Auth.js implementation

`package.json` pins `next-auth` to `5.0.0-beta.32`. `src/auth.ts` configures only the shared Credentials provider.

The provider’s `authorize()` path:

1. Returns `null` unless `DATA_BACKEND === "sql"`.
2. Bounds/normalizes the submitted shared username and password.
3. Reads the configured username and stored scrypt password hash.
4. Calls `consumeSharedLoginAttempt()` using a key derived from the client address.
5. Uses constant-time username comparison and scrypt password verification.
6. Clears the attempt count on success and returns the generic `shared-it` identity.

The configured login is therefore shared IT access, not individual employee or technician authentication. Source code does not establish that Entra OIDC is active.

### Session settings

`src/auth.ts` configures:

- JWT session strategy.
- Maximum session age of eight hours.
- HTTP-only cookie.
- SameSite `lax`.
- Secure cookie in production.
- `trustHost: true`.
- Session callbacks that copy the shared identity marker into the JWT/session.

These are source settings. Actual production behavior also depends on deployment settings, cookie/domain routing, and the deployed code.

### Login attempt storage

`src/lib/sql/auth-rate-limit.ts`:

- HMAC-hashes the client address with `AUTH_SECRET`.
- Allows eight attempts per 15-minute window.
- Stores the hash, attempt count, reset time, and updated time in `lacc_auth_login_limits`.
- Periodically deletes entries older than a day with a 2% chance on an attempt.
- Clears the client key after successful authentication.

The source trusts `x-real-ip` or the first `x-forwarded-for` value to identify the address. Correct proxy header handling must be verified in the deployment environment. The limiter depends on the SQL connection and `AUTH_SECRET`; failures in those dependencies can prevent login rather than bypass the check.

## Role resolution and enforcement

Roles are declared in `src/lib/domain/models.ts`: `EMPLOYEE`, `IT_AGENT`, and `ADMIN`.

### `getOptionalEmployee()`

`src/lib/authz.ts:getOptionalEmployee()` resolves the application identity:

- In non-production only, `AUTH_BYPASS === "true"` can select a demo identity.
- With `DATA_BACKEND === "sql"`, only the `shared-it` session ID resolves. It becomes a generic `IT_AGENT`.
- Outside SQL mode, a `shared-it` session is rejected.
- Other sessions require a nonempty email.
- In production, email must not resolve to `EMPLOYEE` under `staffRole()`.
- The selected ticket repository then provides `getEmployeeByEmail(email)`.

`src/lib/identity.ts:staffRole()` checks `IT_ADMIN_EMAILS` first, then `IT_STAFF_EMAILS`, otherwise returns `EMPLOYEE`.

### Guard functions

- `requireEmployee()` redirects to sign-in when no employee resolves.
- `requireAgent()` denies the `EMPLOYEE` role.
- `requireAdmin()` allows only `ADMIN`.

These guards are used by server-side pages/actions. Route Handlers may instead call `getOptionalEmployee()` and return JSON status codes.

### Ticket policy

`src/lib/domain/policy.ts` defines:

- `canReadTicket()`: employees must match requester UID or email; an employee cannot read a ticket with `requesterIdentityVerified === false`.
- `canManageTickets()`: true only for `IT_AGENT` and `ADMIN`.
- `canAccessAdmin()`: true only for `ADMIN`.
- `canCreateMessage()`: employees may create only `EMPLOYEE_REPLY`; IT roles may create `PUBLIC_REPLY` and `INTERNAL_NOTE`.
- `employeeVisibleMessages()`: removes `INTERNAL_NOTE`.

`src/lib/sql/repository.ts` applies ticket read, update, and message checks. Its ticket-list method accepts filters, but does not receive an actor; callers must provide correct authorization and filtering. Do not claim every list path is protected solely by the repository.

## Google Sheets administrator-role fallback risk

`GoogleSheetTicketRepository.getEmployeeByEmail()` returns an `ADMIN` role for any nonempty email. If a non-SQL authenticated session reaches the repository lookup and Google Sheets is selected, the returned role can satisfy `requireAdmin()` even if `staffRole()` would otherwise identify that session as only an IT agent.

This is a **source-level conditional risk**, not confirmed production exposure:

- Current Auth.js config contains only the Credentials provider.
- The provider refuses new sign-ins when `DATA_BACKEND` is not `sql`.
- In SQL mode, `getOptionalEmployee()` returns the shared account as `IT_AGENT` without calling the repository lookup.
- The `AUTH_BYPASS` path is restricted in source to non-production.

The risk becomes reachable if a non-SQL session issuer is introduced or accepted and Google is selected as the ticket repository. Production exposure also depends on effective runtime configuration that was not inspected.

**Required future correction:** application roles must come from a trusted identity/authorization source, not from a ticket-data adapter. In production, return no identity when the role cannot be established. Do not enable an alternate non-SQL authentication path until this lookup has been corrected and reviewed.

## Not implemented

The audited application uses the shared Auth.js Credentials provider. Individual Entra OIDC sign-in, app role claims, and tenant MFA integration are not implemented in this source baseline. Tenant configuration by itself does not establish application integration.

## Security test matrix

Run only after an approved implementation exists, in a non-production environment.

| Test | Expected result |
|---|---|
| No session requests protected page/action | Redirect or 401 |
| Employee session requests another employee’s verified ticket | Denied |
| Employee session requests a Form ticket with unverified requester identity | Denied |
| Employee attempts IT queue or ticket update | Denied |
| IT agent reads/updates a ticket | Allowed according to approved policy |
| IT agent requests administrator-only page/action | Denied |
| Administrator requests administrator-only page/action | Allowed and audited |
| Unknown tenant or wrong OIDC audience | Sign-in rejected |
| Valid tenant user without application role | Denied |
| User with only technician role requests admin operation | Denied |
| User removed from assigned group | Access revoked within documented token/session propagation window |
| MFA-required policy is applied to app | Sign-in requires MFA under the approved policy |
| Missing/invalid role claim | Fail closed |
| Google backend identity lookup receives an arbitrary email | No elevated role; no identity unless trusted role source confirms it |
| SQL login limiter unavailable | Login fails safely and produces an operator-visible error |

## Sources and unresolved ownership

Source references:

- `src/auth.ts`
- `src/lib/authz.ts`
- `src/lib/identity.ts`
- `src/lib/domain/policy.ts`
- `src/lib/google-sheets/repository.ts`
- `src/lib/sql/auth-rate-limit.ts`
- `migrations/010_auth_login_limits.sql`
- `src/lib/excel/index.ts`

Administrator confirmation is needed for MFA policy, licenses, approved technician/admin groups, app assignment policy, session revocation expectations, and the final application role design.
