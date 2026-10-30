# Security

- No public signup; one shared `Staff` credentials account uses `STAFF_LOGIN_PASSWORD` from Vercel's encrypted environment.
- Secure HttpOnly session cookies with an eight-hour session lifetime.
- Requester profiles and history are keyed by trimmed, lowercased requester email, independent of the shared staff login.
- Server-side deny-by-default authorization for employee, IT, and admin paths.
- Object-level ticket authorization before reads; cross-employee IDOR is covered by unit and Playwright tests.
- Internal notes are filtered in the repository response, not merely hidden in React.
- Zod input validation, bounded message/description lengths, safe attachment MIME/name/size validation, and private storage references.
- Same-origin checks protect the attachment POST; protected writes are server actions or same-origin Route Handlers.
- Security headers include CSP, `frame-ancestors 'none'`, `X-Content-Type-Options`, strict referrer policy, and a restrictive Permissions Policy.
- Secrets belong only in `.env.local`/Vercel secrets. The shared staff password, service-account private key, workbook credentials, refresh tokens, and Graph tokens are never public assets or browser state.
- Production refuses the fixture backend. Fixture mode is only for local tests and browser QA.

## Required security tests

The shared staff login does not provide individual staff attribution. The source sheet's typed technician field remains the per-ticket record of who completed a request. Verify that only intended staff receive the shared password and rotate it through Vercel when staff access changes.
