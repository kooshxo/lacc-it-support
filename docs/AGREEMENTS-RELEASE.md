# Equipment agreements release notes

## Current state

The agreement workflow is implemented on `feature/production-ui-workflow-corrections`. Migration `011_agreement_forms.sql` has been exercised on a disposable local PostgreSQL database only. It has not been applied to Preview or Production. No live agreement was created or signed.

The feature uses the existing SQL inventory backend. It requires `DATA_BACKEND=sql` and the existing `APP_DATABASE_URL`; it introduces no new environment variables or email service. Signing links are copied and shared by IT staff; the application does not send them.

## Migration behavior

Migration 011 creates the agreement table and index, or adds missing agreement metadata to an existing table. It preserves existing agreement status, signer data, and timestamps. Existing rows without a recorded terms version are labelled `LEGACY-UNVERSIONED`; their expiration is derived from `created_at + 7 days`, so an old link is never reactivated for a new seven-day period. New records store a versioned terms snapshot and expire seven days after creation.

The migration is additive and idempotent. Do not use a destructive rollback that drops the agreement table. If application rollback is required, leave the additive table and data in place; the prior application can ignore them. Restore from backup only if a verified data-integrity incident requires it.

## Production approval sequence

1. Obtain explicit approval for the Production migration and application deployment.
2. Capture a current Neon Production restore point and verify that the restore point is usable under the organization’s recovery procedure.
3. Confirm the target is the Production Neon project/branch and `APP_DATABASE_URL` remains unchanged. Never copy Preview credentials into Production.
4. Apply migration 011 through the established migration process. Verify the table, constraints, index, and that pre-existing ticket, inventory, custody, and agreement rows remain intact.
5. Deploy the reviewed application commit. Confirm `DATA_BACKEND=sql`, authentication, and staff-only agreement routes.
6. Use a synthetic/non-employee assigned asset for an end-to-end signature test, then remove only that positively identified synthetic agreement and fixture if cleanup is needed and explicitly reviewed.
7. Confirm the public link expires after seven days, typed-signature consent is recorded once, staff can print, and print/handoff identities and timestamps are recorded.

Rollback means returning the application to its prior deployment while retaining the additive agreement schema and records. Do not delete agreement records or revert the migration as part of routine rollback.

## Legal and operational review

The terms are transcribed from the supplied LACC laptop letter and stored with a version identifier. The printable document retains employee signature, witness, returned-by, and received-by fields for the physical processing workflow. The organization should review the wording and confirm it applies to every equipment category before Production use. This implementation does not make a legal-compliance claim.

Public signing endpoints enforce same-origin requests when an `Origin` header is supplied, use no-store responses, and cap access reads at 50 and signing attempts at 5 per valid token. They do not yet provide an IP-based distributed rate limiter; enable an appropriate platform-level limit before broad public use if the organization requires one.
