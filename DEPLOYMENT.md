# Deployment and cutover

## Current state

- The public `lacc-it-support.vercel.app` domain is assigned to the ready SQL-backed Production deployment.
- Production and Preview use separate Neon SQL databases with migrations 001–009 and restricted runtime roles.
- Both databases contain the field-verified asset tracker snapshot, imported ticket history, and approved printer-reference fields. Password and credential data was excluded.
- The bound Google Form Apps Script bridge and form-submit/retry triggers are installed. The public endpoint rejects unsigned requests as expected; a real Form submission still needs end-to-end confirmation in SQL.
- The local source closes the old employee ticket pages inside the portal. Deploy this change before claiming the public app has no second intake route. Intended employee intake is only the public bilingual Google Form; the authenticated app is the IT workspace.

## Remaining operational checks

1. Submit one controlled request through the Form and verify it creates exactly one SQL ticket. Confirm idempotent delivery does not create a duplicate and retry behavior is observable.
2. Review IT login, ticket triage/update, asset search and custody, printer directory, and new-hire setup on the public deployment.
3. Confirm a restorable SQL backup and organizational sign-off before retiring Dom's asset tracker and historical ticket sheets. Keep those sources read-only until then.

The source now uses a shared IT username and password. The password is checked against a salted scrypt hash in the Vercel Secret `IT_SHARED_PASSWORD_HASH`; the username is `IT_SHARED_USERNAME`. The shared account is attributed as `IT Staff`, so the app does not identify an individual technician. The rate-limit table is migrated additively during Vercel builds, using the environment’s owner and restricted runtime database URLs. Local builds do not run database migrations.

Before deploying this authentication change, generate a fresh password hash with `node scripts/generate-shared-it-login-hash.mjs` from an interactive terminal and save the printed hash directly as a Production Secret named `IT_SHARED_PASSWORD_HASH`. Never send the password or hash in chat or commit it. Production `IT_SHARED_USERNAME=Staff` is already configured. After saving the secret, redeploy so the production app receives it. The sign-in code allows only the shared identity when `DATA_BACKEND=sql`.

## Migrated data

- Asset tracker: 13 source tables and 439 rows, including 88 assets, 10 people, and 7 custody records. The authorized complete export was field-by-field verified in Production and Preview; raw JSON rows are retained alongside operational tables.
- Ticket history: 4,412 nonempty source rows preserved; 4,328 timestamped rows are available as SQL tickets. Rows without valid ticket timestamps remain in the source snapshot.
- Printer directory: approved location/IP reference fields only. No printer passwords or other credentials were copied.
- The export contained no asset attachments. Existing source ticket numbers remain source metadata because some legacy numbers are duplicated.

## Verification

Preview and the Production-targeted deployment complete build and TypeScript checks. Inventory import verifiers compare all source records, and the ticket verifier compares original sheet cells. The signed endpoint was exercised in Preview and Production, including duplicate delivery; temporary validation tickets were removed. The public endpoint and Apps Script triggers are configured, but a real Form submission still needs confirmation.

Do not run `pnpm verify` as part of deployment unless requested. TypeScript and the Vercel production build are the release checks used for this cutover.
