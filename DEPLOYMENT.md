# Deployment

## Google Sheets and staff login setup

The Google Sheet is the canonical source. Configure these values in Vercel Production. Keep the shared staff password and service-account key out of Preview unless that environment is explicitly trusted and separately scoped:

```text
DATA_BACKEND=google
AUTH_BYPASS=false
AUTH_SECRET=<secret>
STAFF_LOGIN_PASSWORD=<secret>
DEMO_USER_EMAIL=demo@example.org
DEMO_STAFF_NAME=IT Staff
GOOGLE_SHEETS_SPREADSHEET_ID=your-google-sheet-id
GOOGLE_SHEETS_TAB_NAME=IT support request
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<secret>
```

Keep `AUTH_BYPASS=false` in production. Configure `AUTH_SECRET` and `STAFF_LOGIN_PASSWORD` as encrypted Vercel Production values. The application accepts the exact user name `Staff`; it does not use Google OAuth or a staff email allowlist. All staff sessions share one IT Staff identity, while requester profiles are independent and keyed by normalized requester email.

For the Sheets connection, share only the support-response spreadsheet with the service account as an Editor. Production currently uses its encrypted private-key setting in Vercel. The code also supports Workload Identity Federation: enable the Google Sheets API, IAM Service Account Credentials API, and Security Token Service API, configure a provider for the Vercel team issuer, and grant only the production LACC identity permission to impersonate the service account. Keep the service account free of project-wide data roles. Service-account authentication takes precedence over legacy OAuth refresh-token settings.

If a Sheets write is rejected or the connection fails, the ticket site keeps that staff member's latest update per ticket in the browser's local outbox and displays the Sheets error and pending state. The next save sends the queued updates with the new ticket update in one batch. The queue is per browser profile, remains there until a batch succeeds, and is removed if browser site data is cleared; it is not a cross-device backup.

The portal reads all dated rows from the `IT support request` tab. The Support Inbox defaults to unresolved tickets submitted in the last 14 days; All Tickets and requester profiles retain the full source history. Requester profiles group by normalized email and show all previous tickets for that email. Completing a ticket writes `Yes` to K, the completion timestamp to P, and the typed staff name to R on that request's exact source row.

## Legacy Microsoft Excel setup

1. Export the historical Google Sheet only after LACC approves the migration; create one `.xlsx` in SharePoint/OneDrive for Business and preserve the historical response tab.
2. Add the required named Excel Tables from `src/lib/excel/tables.ts`, seed `tblEmployees`, and create a `tblLegacyIntake` table that preserves the source form columns in their existing order. The legacy columns are K `Was it solved?`, P `Completed with time Stamp`, R `Staff working the request / staff tomando la solicitud`, and S `Ticket Number`. Remove credential tabs from any workbook accessible to the application.
3. Register a single-tenant Microsoft Entra web app. Configure the production callback URL `/api/auth/callback/microsoft-entra-id`, delegated `User.Read`, `offline_access`, and the least-privileged delegated `Files.ReadWrite` needed for the workbook operator. Do not grant broad application Graph permissions for Excel.
4. Complete the one-time interactive operator authorization and store the resulting refresh authorization as `WORKBOOK_OPERATOR_REFRESH_TOKEN` in Vercel. Preserve token rotation and re-authorize if Microsoft revokes it.
5. Configure `AUTH_SECRET`, tenant/client settings, workbook drive/item IDs, and the private attachment folder ID as Vercel secrets.

When an IT agent saves a ticket as `RESOLVED` or `CLOSED`, the app updates the matching `tblLegacyIntake` row by ticket number: K becomes `Yes`, P receives the completion timestamp, and R receives the authenticated employee display name (for example, `Duane`). If the source row cannot be found, the update fails safely instead of claiming completion.

## Vercel steps

```text
pnpm install
pnpm verify
vercel link
vercel env add ...
vercel --prod
```

Run browser checks against the deployment before promoting it. Keep the production workbook in OneDrive/SharePoint so version history can restore a prior version after an accidental mass edit or script change. Microsoft documents that version history is the recovery path for automated workbook changes: https://learn.microsoft.com/en-us/office/dev/scripts/testing/undo.
