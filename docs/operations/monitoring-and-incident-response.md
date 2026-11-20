# Monitoring and Incident Response

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** no production health request, database query, or incident simulation was performed.

## Signals available in source

### Application health route

`GET /api/health` requires a resolved administrator identity. It calls `getRepository().healthCheck()` and returns private/no-store JSON. Unauthorized callers receive 403.

For SQL, `SqlTicketRepository.healthCheck()` checks selected table presence and privileges. It returns `healthy`, `degraded`, or `unconfigured`, plus missing tables/problems and latency. Its `schemaVersion` is hard-coded as `"009"` in this baseline and is not a reliable indication that later migrations are applied. The health check examines ticket/inventory/IT operations requirements, not every agreement or all application routes.

### Platform and service monitoring

Use authorized read-only Vercel deployment/runtime log views to check deployment status, function errors, and request failures. Do not copy environment values, authentication headers, tokens, or ticket bodies into incident reports.

Use Neon’s current monitoring/branch metadata views to review availability and connection/compute indicators. The prior investigation confirmed schema and snapshot metadata only; it did not verify alert configuration or monitoring retention.

### Google Apps Script

The Apps Script source includes `laccOnFormSubmit`, `retryLaccTicketSubmissions`, pending-delivery spool logic, and failure alerts. Prior GUI inspection showed trigger rows and recent activity, but did not prove the project was bound to the intended production Form. Check the correct project/form association before interpreting its execution data.

## Safe diagnostic sequence

1. Confirm the reported URL/environment and current alias through deployment metadata.
2. Check deployment state and recent runtime errors without opening secrets.
3. For a 5xx from the app, check whether the affected selector is SQL, Google, or Graph through approved configuration metadata; do not dump the full environment.
4. If permitted, call the admin-only health endpoint using an already authorized application session. Do not generate real tickets as probes.
5. For SQL errors, ask the database owner to review endpoint status, connection saturation, table/privilege metadata, and migration state without returning row contents.
6. For Form failures, inspect Apps Script trigger execution/error summaries and retry queue status; do not expose payloads or script properties.
7. For agreement PDF errors, use staff UI to inspect status and hash metadata; do not download or distribute personal documents unless needed and approved.
8. Record timestamps, deployment SHA, route, status code, correlation/request ID where available, and impact. Redact user, token, and internal host details.

## Incident classification and escalation

| Category | Examples | First owner |
|---|---|---|
| Availability | App 5xx, SQL unavailable, Graph/Sheets unavailable | Application/Vercel owner |
| Data integrity | Duplicate ticket, stale version, source-row mismatch | Application and database owners |
| Intake delivery | Trigger missing, webhook 401/503, retry queue exhausted | Google Workspace and app owners |
| Access control | Unexpected role, unauthorized ticket, internal note exposure | Security and application owners |
| Data loss/recovery | Missing table, accidental delete, restore request | Database owner and incident lead |
| Agreement integrity | Hash mismatch, invalid signature state, PDF unavailable | Application/database owners |

Escalate suspected data disclosure or privilege escalation as a security incident. Preserve relevant metadata and avoid broad exports or speculative repairs.

## Failure and recovery notes

- `ConflictError` usually means the record changed since it was loaded; refresh and review before retrying.
- `WorkbookUnavailableError` may indicate provider configuration/service failure; do not switch production backends as an ad hoc workaround.
- SQL transaction failures should be followed by a read-only check for final state before retrying a non-idempotent operation.
- Form retries use deterministic response identity and can safely detect duplicates when the SQL route is working; exhausted retries require owner-led response reconciliation.
- Agreement signing failures can occur after timeout; inspect agreement status before creating another link.
- Monitoring and escalation settings must be confirmed with authorized operations owners.

## Sources and owner gaps

- `src/app/api/health/route.ts`
- `src/lib/sql/repository.ts:healthCheck()`
- `src/lib/excel/graph-client.ts`
- `src/lib/google-sheets/client.ts`
- `src/app/api/intake/google-form/route.ts`
- `integrations/google-forms/Code.gs`
- `src/lib/sql/agreements.ts`
- Vercel and Neon metadata inspected read-only

Confirm monitoring access, alert ownership, log retention, escalation contacts, and approved diagnostic identities before publishing an operational on-call runbook.
