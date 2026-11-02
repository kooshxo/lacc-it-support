# Microsoft 365 + SQL rollout

This branch is opt-in. Existing production continues to use Google Sheets until DATA_BACKEND=sql is deliberately configured. Do not change that variable before migration and a verified preview.

## Required setup

1. Provision a private PostgreSQL database with TLS certificate verification, backups and restore capability. Use a pooled DATABASE_URL for the application; use a separate migration account for DDL. Never expose credentials to client components.
2. Run `node scripts/sql-migrate.mjs` with the migration account. Grant the runtime account only SELECT/INSERT/UPDATE on these tables (no DDL). Configure REQUEST_SECRETS_KEY as a randomly generated base64-encoded 32-byte secret, retained separately from database backups. Requested PINs are AES-256-GCM encrypted, bound to the ticket ID and excluded from ticket descriptions and audit events. PIN delivery/reveal and post-fulfillment deletion still need an approved staff workflow before live PIN collection.
3. Register a **single-tenant** Microsoft Entra web app. Redirect URI: `https://lacc-it-support.vercel.app/api/auth/callback/microsoft-entra-id` (register a separate stable preview callback for staging). Configure AUTH_MICROSOFT_ENTRA_ID_TENANT_ID, AUTH_MICROSOFT_ENTRA_ID_ID and AUTH_MICROSOFT_ENTRA_ID_SECRET. Delegated scopes: openid, profile, email, User.Read. Sign-in checks the tenant claim, exact work email domain, object ID, and Graph userType=Member; Graph errors deny sign-in.
4. Enable assignment requirements in the enterprise app and assign approved employees. Keep organizational MFA/Conditional Access. Google sign-in remains restricted to IT_STAFF_EMAILS. IT_ADMIN_EMAILS explicitly grants administrator access; IT_STAFF_EMAILS grants agent access in SQL mode. Recheck roles every authenticated request. Never use the legacy Sheets employee resolver for Microsoft users.
5. Back up and export the **entire** source sheet, including raw rows and original source IDs. The current Sheets repository has a rolling date cutoff: its listTickets output is NOT a complete migration source. Build/review a full-history import, retaining all source fields and completion evidence, and compare source counts/statuses before cutover. Historical email identities must be explicitly linked to tenant/object identities before employee history is exposed. No historical import has been run by this branch.
6. In preview set DATA_BACKEND=sql and complete employee/agent/admin, cross-user denial, retry, concurrent update, database outage, and encrypted-PIN workflows. Only then freeze legacy intake, perform the final import/delta comparison, and switch production. Keep the source sheet as a read-only archive. SQL intake and the existing dashboard then use one repository; no bidirectional spreadsheet sync is required.

## Desktop link

After production verification, deploy a Group Policy URL shortcut named `LACC Badge & Access Requests` targeting `https://lacc-it-support.vercel.app/requests/new`. Publish to a pilot OU first, then approved employee OUs. The shortcut contains no credentials or tokens.

## Remaining activation work

Database provisioning, Entra app registration/consent, full-history import and identity linking, PIN fulfillment/deletion UI, and live end-to-end verification require the actual services. This branch must not be represented as ready for production until these are complete. No production environment variables or data have been changed.
