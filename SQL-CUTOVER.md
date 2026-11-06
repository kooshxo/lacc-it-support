# LACC SQL cutover

Production and Preview SQL databases are provisioned and migrated through 009. Both contain the verified asset tracker, ticket history, and printer reference data. Vercel has restricted runtime database credentials and separate signed Form-intake secrets for each environment.

## Release status

- Preview deployment: ready; build and TypeScript pass. Signed intake created a SQL test ticket, treated replay as a duplicate, and the temporary record was removed.
- Production deployment: ready at [the deployment URL](https://lacc-it-support-l3bucdp3h-kooshxos-projects.vercel.app); the public domain is assigned to the SQL deployment. The signed endpoint was exercised against Production and its temporary test row was removed.
- Google Form: Apps Script bridge and form-submit/retry triggers are installed. The endpoint rejects unsigned requests as expected; a real controlled Form submission still needs confirmation in SQL.
- Employee intake is intended to be the public bilingual Google Form only. Local source now closes the legacy `/requests` and `/requests/new` pages, but that route change still needs deployment. The authenticated application is for IT staff ticket triage and operations.

## SQL data

The complete authorized inventory snapshot (13 tables, 439 rows, 88 assets, 10 people, 7 custody records) was independently verified in both databases. The approved printer-reference fields are present. Credential fields were excluded; the export contained no asset attachments.

The full ticket export contains 4,412 nonempty source rows, with 4,328 timestamped rows available as SQL tickets. Rows with invalid or absent timestamps remain in `lacc_ticket_source_rows`. Historical ticket numbers remain source metadata because some legacy numbers are duplicated.

## Remaining before retiring source systems

1. Verify the Form is publicly reachable without Google sign-in, follows the intended branches, and does not request passwords or PINs. A typed work email is not identity verification; Form-created tickets stay unverified and IT-only.
2. Submit one controlled request and confirm one ticket appears in SQL. Verify duplicate delivery does not create a duplicate.
3. Confirm a restorable SQL backup, operational sign-off, and read-only retention of source data before retiring the original asset tracker and historical sheets.

The ticket application uses the current individual Google IT allowlist. Microsoft Entra sign-in code is present, but Production credentials and callback URI are not verified. Do not describe Production authentication as Microsoft-backed until that setup is complete.

## Scope of SQL schema

Migrations 001–009 create tickets/events/messages, attachments, inventory operations and audit tables, signed Form idempotency, IT new-hire setup, and the IT printer directory. Runtime roles have CRUD access to application tables but no schema DDL. Migrations run with the separate Neon owner account.

See [GOOGLE-FORM-SQL.md](./GOOGLE-FORM-SQL.md), [INVENTORY-MIGRATION.md](./INVENTORY-MIGRATION.md), and [architecture/workflow overview](./docs/architecture/lacc-it-support-architecture.md).
