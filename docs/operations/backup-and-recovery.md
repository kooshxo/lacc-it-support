# Backup and Recovery

> **Evidence date:** 2026-11-20  
> **Runtime caveat:** metadata only; no restore was performed and no recovery procedure is verified.

## Recovery evidence

Neon provides snapshot and point-in-time restoration capabilities. Backup configuration, retention windows, external copies, and any completed restore exercise for this environment are not verified in this source audit. Environment-specific recovery details are maintained by authorized administrators, not in this public repository.

## Recovery scope

Data classes requiring recovery planning include tickets, messages/events, ticket and inventory attachments, source-import rows, inventory assets/people/custody/issues, onboarding requests, printer directory records, login-rate records, and agreements/PDFs/events.

Recovery must account for schema compatibility as well as data. Application rollback does not reverse database migrations automatically.

## Proposed recovery procedure

1. **Declare incident and freeze changes:** incident commander records time, suspected environment, and affected data classes. Database owner determines whether writes need to be paused using the approved change process.
2. **Confirm target/environment:** distinguish production from preview through approved administrative metadata. Do not infer environment from project display names alone.
3. **Select recovery point:** compare incident time, snapshot/PITR availability, and required RPO. Record the chosen point and expected data loss.
4. **Restore to an isolated branch/environment:** database owner performs the restore using Neon’s current approved procedure. Do not overwrite production during initial validation.
5. **Validate schema and application compatibility:** inspect migration state, table presence, constraints, and application health using approved metadata/read-only checks. Do not expose record values in shared incident notes.
6. **Reconcile application integrations:** determine whether Forms, retries, Google Sheets, Graph, or Vercel deployments may have continued writing during recovery.
7. **Approve cutover:** application, database, and IT owners review validation and decide whether to point traffic to the restored state.
8. **Verify and monitor:** confirm application error rates, authorization, ticket counts/metadata, attachment integrity, and critical workflows using synthetic or privacy-minimized checks.
9. **Document incident:** record timeline, recovery point, decisions, data loss, and follow-up actions.

This is a proposal only. No step has been validated by a restore exercise.

## Limits and cautions

- A manual snapshot is not necessarily a complete backup strategy.
- PITR availability depends on the configured product/branch retention and current provider capabilities.
- SQL connection string and application role must not be copied into incident notes.
- Restoring database state may not restore Google Form responses, Apps Script retry properties, external files, or Graph workbook data.
- Signed agreement PDFs are stored in SQL and protected by application checks and migration triggers; recovery must preserve matching PDF/hash data.
- Ticket and inventory attachment bytes are stored in SQL `bytea`; metadata-only checks do not verify document readability.
- Do not run import scripts or migrations as a recovery shortcut without owner review.

## Recovery ownership

| Responsibility | Owner |
|---|---|
| Restore authorization and database operation | Neon/database administrator |
| Application compatibility and deployment alias | Application/Vercel administrator |
| Ticket/Form reconciliation | IT operations and Google Workspace administrators |
| Agreement PDF integrity review | Application and database owners |
| Business impact and acceptable data loss | LACC IT leadership |

## Required administrator confirmations

- Is any scheduled or external backup configured beyond the inspected snapshot metadata?
- What does the 21,600-second history-retention field represent?
- What RPO/RTO and retention requirements apply?
- Who can authorize a restore and who performs it?
- Has restore-to-isolated-branch been tested, and when is the next exercise?
- How are Forms, retries, spreadsheets, and post-restore submissions reconciled?
