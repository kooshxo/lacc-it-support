# Equipment agreements release notes

## Current state

The agreement workflow is implemented on `feature/production-ui-workflow-corrections`. Preview uses Neon project `ancient-hat-53275363`, branch `br-lingering-wave-bb47v3ui`, database `neondb`. Migrations 011 and 012 are installed on Preview; Production has not been migrated or changed.

A fresh synthetic Preview agreement was signed after the response-contract and PDF-layout fixes. Commit `c53735cde04a3e52b1697ac5b0dd60c559acc387` is deployed READY to Preview as `dpl_DEAaHbp2PUxjTNPkEznXTrZ4WRAg` (`https://lacc-it-support-p520wurbu-kooshxos-projects.vercel.app`). The authenticated staff workflow created the link and displayed the completed record; the employee signing URL worked without staff authentication, accepted typed-name consent, and displayed signing completion. The stored PDF opened in the browser and showed the signature/date fields without overlap. The application only returns the PDF when its stored SHA-256 matches the PDF bytes. The Preview database recorded the synthetic agreement as `COMPLETED`, consent as true, a signing timestamp, and an 839,468-byte PDF with SHA-256 `bdab2ebc8dacdebe69ea459bbaf784e4b7531d070a50b363ba4195f692fc258a`. The append-only audit contains the corresponding link-created and electronically-signed events. Existing synthetic and legacy records were retained; no Production resources were changed.

Automated verification on the release commit: focused agreement unit tests 10/10 passed; full unit suite 68 passed and 11 skipped; PostgreSQL agreement integration 6/6 passed; typecheck, lint, production build, and `git diff --check` passed. Runtime-log inspection after the browser flow showed PostgreSQL SSL-mode compatibility warnings emitted to stderr; it did not show application exceptions for the exercised signing and PDF flow. Mobile was not directly tested in a mobile viewport/device during this verification.

The feature uses the existing SQL inventory backend. It requires `DATA_BACKEND=sql` and the existing `APP_DATABASE_URL`; it introduces no new environment variables or email service. Signing links are copied and shared by IT staff; the application does not send them.

## Migration behavior

Migration 011 creates the agreement table and index, or adds missing agreement metadata to an existing table. Migration 012 adds consent and signed-PDF storage/integrity fields and constraints plus append-only audit protections. Both are installed in Preview only. The migration set preserves existing agreement status, signer data, and timestamps. Existing rows without a recorded terms version are labelled `LEGACY-UNVERSIONED`; their expiration is derived from `created_at + 7 days`, so an old link is never reactivated for a new seven-day period. New records store a versioned terms snapshot and expire seven days after creation.

The migration is additive and idempotent. Do not use a destructive rollback that drops the agreement table. If application rollback is required, leave the additive table and data in place; the prior application can ignore them. Restore from backup only if a verified data-integrity incident requires it.

## Production approval sequence

1. Obtain explicit approval for the Production migration and application deployment.
2. Capture a current Neon Production restore point and verify that the restore point is usable under the organization’s recovery procedure.
3. Confirm the target is the Production Neon project/branch and `APP_DATABASE_URL` remains unchanged. Never copy Preview credentials into Production.
4. Apply migrations 011 and 012 through the established migration process. Verify the table, constraints, indexes, append-only audit protections, and that pre-existing ticket, inventory, custody, and agreement rows remain intact.
5. Deploy the reviewed application commit. Confirm `DATA_BACKEND=sql`, authentication, and staff-only agreement routes.
6. Use a synthetic/non-employee assigned laptop for an end-to-end signature test. Preserve its synthetic audit records; do not delete them as routine cleanup.
7. Confirm the public link expires after seven days, typed-signature consent is recorded once, signed PDF bytes match the recorded SHA-256, the PDF renders and downloads correctly on desktop/mobile, and print/handoff identities and timestamps are recorded where those physical workflow actions remain in scope.

Rollback means returning the application to its prior deployment while retaining the additive agreement schema and records. Do not delete agreement records or revert the migration as part of routine rollback.

## Legal and operational review

The terms are transcribed from the supervisor-approved LACC laptop letter and stored with a version identifier. Agreements are restricted to laptop assets. Typed electronic-signature procedure authorization is separate and must be confirmed before real employees use signing links. Do not broaden the agreement to other equipment categories without organizational approval. The printable document retains the letter's witness, returned-by, and received-by fields. This implementation does not make a legal-compliance claim.

Public signing endpoints enforce same-origin requests when an `Origin` header is supplied, use no-store responses, and cap access reads at 50 and signing attempts at 5 per valid token. They do not yet provide an IP-based distributed rate limiter; enable an appropriate platform-level limit before broad public use if the organization requires one.
