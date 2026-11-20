# LACC IT Support Portal

LACC IT Support is a Next.js application for IT support requests and related IT operations. This repository includes ticket workflows, inventory and equipment custody, onboarding and badge **request tracking**, printer references, and equipment agreements.

**[Read the full technical documentation](docs/README.md)**

## What the code does

- **Ticket management:** Received, In Progress, and Solved workflow; server-side actions, priority/resolution tracking, and backend-specific ticket history.
- **Request intake:** a Google Forms / Apps Script integration with a signed webhook that can create SQL ticket or onboarding records when configured.
- **Inventory:** assets, people, equipment checkout/return, issues, attachments, and audit history.
- **Onboarding and badges:** requests for IT work. Creating a request does **not** automatically create an AD account, mailbox, badge, or permission.
- **Equipment agreements:** source-backed signing and PDF workflows, subject to feature flags and database readiness.

## Architecture at a glance

The application uses the Next.js App Router on Vercel. Its ticket repository is selected by `TICKET_BACKEND ?? DATA_BACKEND ?? "graph"` and can use SQL, Google Sheets, Microsoft Graph/Excel, or non-production fixtures. Certain IT operations use SQL paths separately. **These choices are not evidence of the actual production backend settings.**

Authentication in the audited source uses an Auth.js shared Credentials provider in SQL mode. Individual Entra OIDC sign-in and Exchange mailbox automation are **not implemented** in the audited code. There is **no .NET or C# Exchange worker in this repository**, so no implementation documentation is presented for one.

## Documentation

| Topic | Read |
| --- | --- |
| System capabilities | [Overview](docs/overview/system-overview.md) |
| Components and data flow | [Architecture](docs/architecture/current-architecture.md) |
| Database tables | [Schema and migrations](docs/data/model-and-schema.md) |
| Ticket behavior | [Ticket lifecycle](docs/data/ticket-lifecycle-and-history.md) |
| Technician workflows | [Tickets](docs/workflows/tickets.md) · [Inventory](docs/workflows/inventory-custody.md) · [Agreements](docs/workflows/agreements.md) |
| Authentication and access | [Security reference](docs/security/authentication-and-authorization.md) |
| Forms integration | [Google Forms intake](docs/integrations/google-forms-intake.md) |
| API endpoints | [API and Server Actions](docs/api/reference.md) |
| Development | [Setup and testing](docs/development/setup-and-testing.md) |
| All topics | **[Documentation index](docs/README.md)** |

## Development

Use the Node version compatible with this repository and the package manager declared in `package.json`. Never use production credentials or employee records for local tests.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Create an ignored `.env.local` using `.env.example` as a list of configuration keys, and use only approved development values and synthetic data. Fixture mode is disabled in Production. See [local setup](docs/development/setup-and-testing.md) for the exact test inventory and constraints.

## Accuracy and deployment status

The technical handbook is a **source-grounded reference** reviewed against commit `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535` on 2026-11-20. This may differ from other branches or more recent staging code. Live environment selectors, integration bindings, and recovery readiness require separate administrator confirmation. Do not treat implemented source routes as evidence of live availability.

Older root-level documents such as `ARCHITECTURE.md`, `DEPLOYMENT.md`, and `SECURITY.md` may describe earlier implementation stages; use the [versioned handbook](docs/README.md) for the audited source baseline.
