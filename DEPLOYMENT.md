# Deployment

## Google Sheets production setup

The Google Sheet is the canonical source. Configure these Vercel environment variables for Production and Preview:

```text
DATA_BACKEND=google
AUTH_BYPASS=false
AUTH_GOOGLE_ID=<secret>
AUTH_GOOGLE_SECRET=<secret>
AUTH_SECRET=<secret>
IT_STAFF_EMAILS=staff-one@example.org,staff-two@example.org
DEMO_USER_EMAIL=demo@example.org
DEMO_STAFF_NAME=IT Staff
GOOGLE_SHEETS_SPREADSHEET_ID=your-google-sheet-id
GOOGLE_SHEETS_TAB_NAME=IT support request
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_CLOUD_PROJECT_NUMBER=<google-cloud-project-number>
GOOGLE_WORKLOAD_IDENTITY_POOL_ID=<workload-identity-pool-id>
GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID=<workload-identity-provider-id>
```

Keep `AUTH_BYPASS=false` in production. Configure `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_SECRET`, and set `IT_STAFF_EMAILS` to the explicit staff allowlist. The portal rejects Google accounts not on that list.

For the Sheets connection, enable the Google Sheets API, IAM Service Account Credentials API, and Security Token Service API in the Cloud project. Create or reuse a service account and share only the support-response spreadsheet with its email as an Editor. Configure a Google Workload Identity Federation OIDC provider for the Vercel team issuer, then grant only the production LACC project identity permission to impersonate that service account. Set the project number, pool ID, provider ID, and service-account email in Vercel Production. The resulting access tokens are short-lived; no private key is stored in Vercel. Keep the service account free of project-wide data roles. A service-account private key can still be used in environments that permit keys, and it takes precedence over Workload Identity Federation. Service-account authentication takes precedence over the legacy OAuth refresh-token settings.

If a Sheets write is rejected or the connection fails, the ticket site keeps that staff member's latest update per ticket in the browser's local outbox and displays the Sheets error and pending state. The next save sends the queued updates with the new ticket update in one batch. The queue is per browser profile, remains there until a batch succeeds, and is removed if browser site data is cleared; it is not a cross-device backup.

The portal reads the `IT support request` tab directly. It displays only rows dated on or after the most recent Wednesday and leaves historical rows untouched. Completing a ticket writes `Yes` to K, the completion timestamp to P, and the typed staff name to R on that request's exact source row.

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
