# Architecture

## Data flow

Browser → Next.js App Router server page/action or Route Handler → session/role authorization → Zod validation → `TicketRepository` → Microsoft Graph Excel API → canonical `.xlsx` workbook.

The browser never receives a Graph access token, workbook bytes, or an unfiltered employee/ticket collection. Employee ticket reads are filtered by `requesterUid` in the repository, and internal notes are removed before the response is serialized.

## Workbook tables

The production schema uses stable IDs and human numbers rather than row position. `tblTickets` stores `TicketUID`, `TicketNumber`, `OperationUID`, requester fields, subject/description, category, priority, status, assignment, impact, timestamps, and a version. `tblTicketMessages`, `tblTicketEvents`, and `tblAttachments` preserve conversation, audit history, and binary-storage references. `tblEmployees` provides the allowlist and role source.

## Identity and authorization

Employee authentication is Microsoft Entra OIDC restricted to the LACC tenant and `thelatincenter.org` domain. A live `tblEmployees` lookup must still find an active employee before any protected route is usable. Roles are `EMPLOYEE`, `IT_AGENT`, and `ADMIN`; admin is not implied by IT membership. Every object request checks the current employee and ticket ownership/role.

## Graph authorization constraint

Graph Excel APIs document delegated `Files.ReadWrite`; application-only permissions are not supported for the required workbook operations. The server therefore uses a dedicated, least-privileged LACC workbook-operator account with delegated refresh authorization held in `WORKBOOK_OPERATOR_REFRESH_TOKEN`. This requires an administrator to complete an interactive consent/bootstrap step once and to preserve refresh-token rotation securely.

## Reliability

- Each write creates UUID-based `OperationUID`, entity IDs, and a human ticket number derived from the UUID; no last-row arithmetic is used.
- Replays are detected by `OperationUID` before appending ticket/message rows.
- Updates carry an expected `Version`; stale writes fail with a conflict message.
- Graph 429/408/5xx responses use bounded retry with `Retry-After` and jitter.
- Each operation uses a persistent workbook session and closes it afterward. Writes are kept sequential per operation; cross-instance serialization remains an Excel/Graph operational risk and must be load-tested against the real tenant.

## Attachments and notifications

Attachments are binary files in a private SharePoint/OneDrive folder; Excel stores only metadata/reference IDs. The implementation currently accepts PNG/JPG/PDF uploads up to 10 MB and does not create public URLs. Notifications are intentionally feature-flagged until the LACC operator mailbox and consent are configured.
