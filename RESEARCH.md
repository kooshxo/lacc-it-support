# LACC IT Support research

## Product findings

Internal help-desk users repeatedly value a low-friction intake path, a searchable queue, clear ownership, replies that remain attached to the request, and historical context. Practitioner discussions also consistently recommend an email or “someone can enter it for the employee” fallback so a broken computer does not block reporting. The implementation therefore keeps employee intake to a few plain-language questions, does not ask employees to choose a technical priority, and makes the IT queue searchable.

Sources reviewed:

- Reddit `r/sysadmin`: ticket intake should be easy, email-to-ticket or technician-entered requests reduce resistance, and a clear no-ticket/no-work policy prevents lost work: https://www.reddit.com/r/sysadmin/comments/1tcbmql/ticketing_system_plan/ and https://www.reddit.com/r/sysadmin/comments/18a1cgf
- Reddit `r/sysadmin`: small teams need a lightweight queue, clear assignment, and searchable history rather than another chat stream: https://www.reddit.com/r/sysadmin/comments/1stwexc/how_do_you_manage_internal_tickets_without_a_full/
- Reddit `r/sysadmin`: users often avoid large forms; templates are useful for repeatable onboarding but ordinary troubleshooting should stay short: https://www.reddit.com/r/sysadmin/comments/1w6z3e7/ticketing_system_with_templates_or_something/
- LACC public site: bilingual community mission, multiple Wilmington-area buildings, and a practical employee-facing tone: https://www.thelatincenter.org/
- Quora was attempted, but robots restrictions prevented reliable retrieval; no claims in this document rely on it.
- Stack Exchange search was reviewed for the same operational themes; no Stack Exchange quotation was needed to make an architectural decision.

## Microsoft Graph findings

The Excel REST API works with `.xlsx` files in OneDrive for Business or SharePoint: https://learn.microsoft.com/en-us/graph/excel-concept-overview. Graph recommends a persistent workbook session for multiple operations and sequential writes: https://learn.microsoft.com/en-us/graph/excel-manage-sessions and https://learn.microsoft.com/en-us/graph/workbook-best-practice.

This matters to LACC because the required Excel workbook endpoints—session creation, worksheet/range reads, table row reads, table row adds, and range updates—document delegated `Files.ReadWrite` as the least-privileged permission and document application permissions as unsupported. Examples: https://learn.microsoft.com/en-us/graph/api/workbook-createsession?view=graph-rest-1.0, https://learn.microsoft.com/en-us/graph/api/tablerowcollection-add?view=graph-rest-1.0, and https://learn.microsoft.com/en-us/graph/api/range-update?view=graph-rest-1.0.

The production plan consequently uses server-side delegated authorization for a tightly controlled workbook operator account. The operator refresh token remains a Vercel secret and never reaches browser JavaScript. Employee sign-in is separately tenant-restricted Entra OIDC; workbook access is always mediated by the server repository.

## Security findings

OWASP explicitly requires object-level authorization on every request and warns that unpredictable IDs do not replace authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html and https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html. The app therefore checks the current session and requester/role before loading a ticket, filters internal notes on the server, and tests a cross-employee ticket request.
