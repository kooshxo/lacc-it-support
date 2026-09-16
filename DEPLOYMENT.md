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
GOOGLE_SHEETS_CLIENT_ID=<secret>
GOOGLE_SHEETS_CLIENT_SECRET=<secret>
GOOGLE_SHEETS_REFRESH_TOKEN=<secret>
```

Keep `AUTH_BYPASS=false` in production. Configure `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_SECRET`, and set `IT_STAFF_EMAILS` to the explicit staff allowlist. The portal rejects Google accounts not on that list.

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
