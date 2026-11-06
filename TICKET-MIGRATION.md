# Ticket history migration

The `LACC TICKETS` Google Sheet export was imported to the development Neon database on 2026-11-02.

- Source spreadsheet: `1XOh8iTb5njS4ZLHT6CJQdhgCL2HlA7ayZHQOqvCk4Bw`
- CSV SHA-256: `07e53204f0673da7f770ddc6f7c338b0c3d8229e3b08fade86848f54c0934a3d`
- 4,412 nonempty source rows are preserved exactly, including all 20 columns.
- 4,328 timestamped request rows are mapped into `lacc_tickets`.
- 84 sparse rows remain archived with no live ticket mapping (5 blank CSV lines were omitted).
- Readback verification compared every source header and cell field-for-field.

`lacc_ticket_source_rows` links mapped tickets back to spreadsheet row numbers and stores the original values. The source ticket number is preserved as `sourceTicketNumber`; the app uses `GS-<row>` as the unique request URL because two of the source ticket numbers are duplicated. Legacy requester ownership checks use the verified LACC email so users can see their historical requests after signing in with Entra.

The CSV export is a point-in-time snapshot. New submissions made after that export need a later incremental sync or a final snapshot at cutover. The Google Sheet remains the production source until a cutover is reviewed.

## Re-import and verify

```sh
node --env-file=../private-migration/db-only.env scripts/import-tickets.mjs ../private-migration/tickets.csv
node --env-file=../private-migration/db-only.env scripts/import-tickets.mjs ../private-migration/tickets.csv --apply
node --env-file=../private-migration/db-only.env scripts/verify-tickets.mjs ../private-migration/tickets.csv
```

Import is dry-run by default, idempotent for the exact same file, and refuses to import if the live SQL tickets table already has records.
