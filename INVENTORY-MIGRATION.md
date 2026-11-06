# Asset tracker migration

## Current status

The complete authorized asset-tracker export was imported independently into the Production and Preview Neon databases. Both databases pass the field-by-field verifier against the export.

- 13 source tables and 439 source rows are retained as JSONB.
- The operational tables contain all 88 assets, 10 people, and 7 custody records.
- Printer reference locations and IP addresses from the approved spreadsheet columns are in the IT printer directory. Passwords and credential fields were excluded.
- No asset attachments were present in the export.
- The application has an **Asset Tracker** section with search, item details, edit/register/retire, people, check-out/check-in, issue tracking, history, data review, and reports.

The app's Production deployment is staged without the public domain. The currently serving production version still uses the legacy configuration. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the remaining Form-owner and promotion steps.

## Initial laptop records

LACC-5980 through LACC-5984 were already in the source export. Their serials and charger-label identifiers supplied by the user are recorded, each is marked **Brand new**, and no person is assigned. The individual details are in the restricted database, not in this documentation.

## Data model

`inventory_imports` identifies each snapshot. `inventory_source_records` preserves every original exported row. Assets, people, and custody are stored separately for search and operational changes. Asset edits, assignments, returns, and issue reports write audit records in transactions. Version checks reject stale edits; a unique index prevents two open assignments for an asset.

Source-only tracker tables remain available for lookup/history while new operations use SQL tables. The exported data did not include attachments. Passwords, authentication credentials, session identifiers, IPs unrelated to the approved printer directory, signatures, and file contents were excluded from the inventory export and were not cloned.

## Inventory workflows

The application supports equipment search and filters, register/edit/retire, people create/edit/deactivate, checkout and check-in with dates/condition/accessories, agreement status and notes, signed-document uploads, repair/missing/damage reports and resolution, assignment/return history, source-data review, and summary reports. Changes use optimistic version checks and audit records.

## Repeatable migration commands

Supply `DATABASE_URL` through a private environment file; never commit credentials or exports.

```sh
node --env-file=.env.production.local scripts/verify-inventory.mjs /private/path/export.json
node --env-file=.env.preview.local scripts/verify-inventory.mjs /private/path/export.json
```

Imports default to validation-only. Applying the identical file is a no-op; changed source rows require reconciliation rather than overwriting operational data.
