# Security

- Entra OIDC, tenant/domain allowlist, secure HttpOnly session cookies, and no public signup.
- Server-side deny-by-default authorization for employee, IT, and admin paths.
- Object-level ticket authorization before reads; cross-employee IDOR is covered by unit and Playwright tests.
- Internal notes are filtered in the repository response, not merely hidden in React.
- Zod input validation, bounded message/description lengths, safe attachment MIME/name/size validation, and private storage references.
- Same-origin checks protect the attachment POST; protected writes are server actions or same-origin Route Handlers.
- Security headers include CSP, `frame-ancestors 'none'`, `X-Content-Type-Options`, strict referrer policy, and a restrictive Permissions Policy.
- Secrets belong only in `.env.local`/Vercel secrets. The workbook, credentials tabs, refresh token, and Graph tokens are never public assets or browser state.
- Production refuses the fixture backend. Fixture mode is only for local tests and browser QA.

## Required security tests

The test suite covers stale-write rejection, idempotent ticket replay, employee cross-ticket denial, internal-note filtering, and employee denial of IT/admin routes. Before production, run the same matrix with two real Entra test identities and inspect API payloads for absence of internal notes.
