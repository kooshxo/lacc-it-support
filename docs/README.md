# LACC IT Support — Technical Documentation

This guide explains the **implemented source code** of LACC IT Support. It is organized for developers and authorized maintainers who want to trace how routes, workflows, data models, and integrations work.

> **Evidence baseline:** `f4ead9f0225de23b75c0e5b22dcc7f4f1713a535`, reviewed 2026-11-20. Code on other branches may differ. Source-code functionality does **not** prove a feature is enabled in Production; runtime backend selectors and external service configuration require separate authorized verification.

## Start here

| Area | Guide |
| --- | --- |
| Overview | [System overview](overview/system-overview.md) |
| Architecture | [Current architecture](architecture/current-architecture.md) · [Trust boundaries](architecture/trust-boundaries.md) |
| Data | [Schema and migrations](data/model-and-schema.md) · [Ticket lifecycle](data/ticket-lifecycle-and-history.md) |
| Workflows | [Tickets](workflows/tickets.md) · [Inventory and custody](workflows/inventory-custody.md) · [Onboarding and badges](workflows/onboarding-and-badges.md) · [Equipment agreements](workflows/agreements.md) |
| Security | [Authentication and authorization](security/authentication-and-authorization.md) · [Data and secrets](security/data-and-secrets.md) |
| Infrastructure | [Deployment and configuration](infrastructure/deployment-and-configuration.md) · [Neon and SQL](infrastructure/neon.md) |
| Integrations | [Google Forms and Apps Script intake](integrations/google-forms-intake.md) |
| Operations | [Backup/recovery concepts](operations/backup-and-recovery.md) · [Monitoring and incident response](operations/monitoring-and-incident-response.md) |
| Development | [Local setup and testing](development/setup-and-testing.md) |
| API | [Routes and Server Actions](api/reference.md) |
| History | [Technical decisions and migrations](history/technical-decisions-and-migrations.md) |

## How to read the evidence

- **Verified source behavior:** directly traced to the pinned commit.
- **Implemented but unverified:** present in code, but live configuration or runtime success was not confirmed.
- **Historical:** prior workflow or data-import behavior, not necessarily live today.
- **Unknown:** cannot be established safely without administrator evidence.

Every document should be read against its stated source baseline. The ticket repository can use SQL, Google Sheets, Microsoft Graph/Excel, or fixtures, depending on selectors. SQL-backed operations and ticket selection are **not the same switch**.

## Out of scope

The repository does **not** implement Exchange mailbox automation, a .NET/C# worker, or individual Entra OIDC authentication in the audited baseline. No speculative implementation manuals for these unbuilt systems are included. Requests for onboarding, badges, and mailboxes are tracked; they do not provision external accounts or permissions.

Public documentation intentionally omits credentials, real employee records, internal network identifiers, detailed backup configurations, and privileged recovery access procedures.

## Maintaining these documents

Update the source commit/evidence date when code changes, correct broken relative links, and review any changes to authentication, data backends, schema, intake, or agreements together. Confirm production-only claims with the relevant system administrator. Old repository documentation should be treated as historical where it conflicts with a cited source implementation.
