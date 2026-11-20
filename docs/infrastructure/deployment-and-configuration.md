# Deployment and Configuration

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Runtime caveat:** no secret-bearing Vercel environment values were inspected.

## Vercel architecture and source

The project is a Next.js App Router application deployed on Vercel using Node 24.x in the observed project metadata. `package.json` pins Next.js `16.3.5` and Auth.js `5.0.0-beta.32`.

`package.json` defines:

- `build`: `next build`
- `start`: `next start`
- `lint`, `typecheck`, and Vitest/Playwright scripts
- `verify`: lint, typecheck, tests, then build

This document does not claim those checks were run for this review. Vercel build logs and custom project build overrides were not inspected.

`vercel.json` disables automatic deployment for the named production workflow feature branch. It contains no migration command or environment values. Whether project-level Vercel settings override defaults was not verified.

## Canonical alias and staged deployment

At the evidence date:

- The canonical production alias object mapped to a READY production deployment associated with `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`.
- A newer READY production-target deployment used commit `e4ddb54e38c18b8bc80df32d95ab93fe82382b36`; available evidence did not show that deployment mapped to the canonical alias.
- Alias metadata and one deployment detail response were inconsistent about aliases. The alias object mapping was the strongest routing evidence available.
- The local checkout was on a different, clean `main` commit and did not contain the baseline commit.

Use “production-alias baseline” for `f4ead9f…` and “staged/unconfirmed promotion” for `e4ddb54…` until a fresh alias read confirms promotion.

## Deployment protection

Vercel project metadata reported SSO/deployment protection for deployment URLs except custom domains; no custom domains were reported in that inspection. This is platform-level access protection, not the application’s Auth.js login, MFA, or role-based authorization.

## Backend selectors

### Ticket repository

`src/lib/excel/index.ts:getRepository()` uses:

```text
TICKET_BACKEND ?? DATA_BACKEND ?? "graph"
```

Supported values:

- `fixture`: fixture repository; explicitly throws in production.
- `sql`: SQL repository.
- `google`: Google Sheets repository.
- Any other value: Graph/Excel repository.

### Operational and auth selector

`DATA_BACKEND` independently controls SQL-specific authentication, Form intake, and operational data paths. Do not infer that the ticket repository and operations data share a backend.

An important attachment exception: ticket attachment routes require `DATA_BACKEND === "sql"` and call `SqlTicketRepository` directly rather than `getRepository()`. A split selector configuration can therefore produce different behavior from ordinary ticket reads.

The production values of both selectors remain unknown. Environment values were not read because the available interface returned the full secret-bearing set.

## Configuration dependencies

Source references include:

- SQL URL: `APP_DATABASE_URL ?? DATABASE_URL`, validated against the logical environment allowlist in `src/lib/config/runtime-safety.ts`.
- Vercel environment selector: `VERCEL_ENV`, required to be explicitly Preview or Production for deployed SQL/spreadsheet safety checks.
- Shared login: `AUTH_SECRET`, shared username/hash settings, and `DATA_BACKEND`.
- Form intake: webhook signing secret and source Form ID.
- Google Sheets: spreadsheet selection and OAuth configuration.
- Graph/Excel: workbook location and authorization settings.
- PIN encryption: `REQUEST_SECRETS_KEY`.

Do not place values for these settings in runbooks. Use the secure Vercel/Google administrative interface and owner-approved access process.

## Preview and production isolation

`src/lib/config/runtime-safety.ts` checks that SQL and spreadsheet selections match an environment-specific allowlist. It permits local loopback SQL for non-production development/test use; deployed environments must use the configured Preview or Production selection. The actual endpoint and spreadsheet identifiers are omitted.

This is an application guard, not a proof that Vercel environment settings are correct. The owner should verify Preview values point only to synthetic/test resources and Production values point only to approved live resources.

## Migration execution

`package.json` has no migration script in its scripts section.

Two scripts exist:

- `scripts/sql-migrate.mjs` requires `DATABASE_URL`, creates a pool with `max: 1`, reads all `.sql` files in lexical order, executes each, and logs the filename. It does not maintain a separate migration ledger or compare current schema version before running; DDL idempotency varies by migration.
- `scripts/apply-auth-rate-limit-migration.mjs` exits outside Vercel. In Vercel it requires both `DATABASE_URL` and `APP_DATABASE_URL`, applies migration 010 using the first connection, derives the runtime role name from the second URL, and grants select/insert/update/delete on the login-limit table.

The source does not establish who runs these scripts, whether they are part of the Vercel build, or which migration process is used in production. Do not assume that `next build` applies database migrations.

## Release verification procedure (proposed)

Before an approved release:

1. Confirm the intended source commit and branch.
2. Inspect Vercel deployment metadata and ensure the artifact is built from the intended commit.
3. Confirm Preview selectors target Preview resources and use synthetic data.
4. Review migration diff and obtain database-owner approval before applying any migration.
5. Deploy to Preview and perform the approved test plan there.
6. Verify health checks and runtime logs without exposing secret values or personal ticket data.
7. Confirm the production alias points to the intended deployment before announcing release.
8. After promotion, verify sign-in, one read-only health check, and required ticket operations through approved checks; do not create a real ticket solely as a deployment probe.
9. Record the deployment commit and evidence date in the operations record.

No release or test was performed for this documentation task.

## Rollback guidance (proposed)

Rollback should be a deployment alias/traffic action performed by the authorized Vercel owner. Database rollback is separate: do not assume reverting application code reverses a schema migration. Before rollback, determine compatibility of the prior application with the current schema and whether a forward fix is safer.

Do not execute rollback steps without an approved incident/change process. Document the actual owner, approval path, expected impact, and recovery verification once confirmed.

## Open questions

- Which exact Vercel deployment currently owns the production alias?
- What are the effective production and Preview backend selectors?
- Are there project-level build overrides or deployment hooks?
- Who owns and runs migrations?
- What is the approved release and rollback authority?
- What Preview test data and resources are approved?
