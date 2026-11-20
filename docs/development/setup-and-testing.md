# Development Setup and Testing

> **Source baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`  
> **Evidence date:** 2026-11-20  
> **Scope:** instructions derived from package/source configuration; commands were not run for this documentation task.

## Toolchain

`package.json` declares:

- `pnpm@11.19.0`
- Next.js `16.3.5`
- React `19.2.8`
- Auth.js `5.0.0-beta.32`
- PostgreSQL driver `pg`
- Zod `4.6.5`
- Vitest, Playwright, ESLint, TypeScript

Vercel metadata reported Node 24.x. Use the project’s approved Node version and lockfile. Do not update package versions as part of documentation work.

## Local setup

1. Clone the repository and check out the intended branch/commit.
2. Install the declared pnpm version and dependencies with the lockfile in frozen mode.
3. Copy `.env.example` to an ignored local environment file and obtain only approved development values.
4. Use synthetic fixtures or an isolated local/test database. Never point local development at production.
5. Run `pnpm dev` for the app.

`.env.example` names configuration categories including Auth.js, SQL URLs, Google Sheets, Microsoft Graph/Excel, Form intake, Entra, and request-secret settings. Its values must not be copied into shared docs. Do not reuse production credentials locally.

`src/lib/config/runtime-safety.ts` restricts deployed SQL/spreadsheet selections by Preview/Production environment and permits loopback SQL for non-production local/test use. Runtime guard success does not make production data safe for local use.

## Code organization

- `src/app/`: App Router pages, layouts, Server Actions, and Route Handlers.
- `src/auth.ts`, `src/lib/authz.ts`, `src/lib/identity.ts`: authentication and role resolution.
- `src/lib/domain/`: models, schemas, policy, ticket status/resolution, activity.
- `src/lib/excel/`: ticket repository contract, Graph and fixture adapters, selector.
- `src/lib/google-sheets/`: Google Sheets client and ticket adapter.
- `src/lib/sql/`: SQL client, ticket repository, Forms intake, operations, agreements.
- `src/lib/inventory/`: inventory persistence.
- `migrations/`: ordered SQL migrations.
- `scripts/`: import, verification, migration, and bootstrap utilities.
- `tests/`: unit, integration, and browser E2E tests.

## Commands declared by the repository

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js development server |
| `pnpm build` | Production build |
| `pnpm start` | Run built application |
| `pnpm lint` | ESLint, warnings fail |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Vitest unit suite |
| `pnpm test:coverage` | Vitest with coverage |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm test:e2e:employee` | Employee E2E config |
| `pnpm verify` | Lint, typecheck, unit tests, build |

This task did not execute tests or validation commands.

## Test organization

Source tree includes:

- Unit tests for policy, repository, resolution, status, activity, runtime safety, translation, onboarding, Google Form route, Google Sheets, and agreements.
- PostgreSQL integration tests for ticket management and agreements.
- A Google Sheets live integration test.
- Playwright E2E suites for employee intake, application shell, ticket management, and agreement signing.

Live integration tests may require external services and can mutate data; review their setup and target before running. Use synthetic accounts, test workbooks, isolated databases, and approved test Form/script projects only.

## Synthetic data rules

- Use fake names and reserved example domains such as `invalid.example`.
- Generate disposable ticket/asset IDs.
- Do not load employee exports or production tickets into local fixtures.
- Keep test attachments synthetic and within configured limits.
- Do not submit to the live Form or run tests against production.
- Confirm Preview resources are synthetic before running browser or integration tests.
- Do not commit local env files, tokens, database URLs, or generated PDF files containing personal data.

## Migration development and release validation

`scripts/sql-migrate.mjs` runs sorted SQL migrations using `DATABASE_URL`; it is not a package script and has no explicit migration ledger. `scripts/apply-auth-rate-limit-migration.mjs` has a separate Vercel-only path for migration 010 and grants runtime table access. Do not assume `pnpm build` applies migrations.

For a proposed schema change, review current applied schema with the database owner, add a new migration rather than rewriting applied history, test against a disposable database, verify migration rollback/compatibility, and document the owner/release step. Production migrations require explicit approval and are outside local setup.

## Release check

Before release, validate the exact commit, lint/typecheck/build, unit tests, approved Preview integration tests, migration compatibility, backend selector mapping, and alias target. Production acceptance should use approved read-only or synthetic checks; never create a real employee ticket solely as a smoke test.
