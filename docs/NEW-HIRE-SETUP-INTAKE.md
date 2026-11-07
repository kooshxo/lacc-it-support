# New Hire Setup Intake

The IT queue is `/it/onboarding`. Employee submissions can be captured through the authenticated employee portal at `/requests/onboarding/new` or through the existing signed Google Form webhook. The SQL release currently uses a shared IT login, so it does not create an employee session; production employees using the Google Form need the corresponding form and Apps Script update before this new request type is live.

## Google Form payload

For the New Hire Setup choice, the Apps Script should send the existing signed webhook payload with `answers.requestType` set to `New Hire Setup` and a validated `answers.newHire` object:

```json
{
  "firstName": "Example",
  "lastName": "New Hire",
  "startDate": "2026-12-01",
  "needByDate": "",
  "needs": ["Computer account / Cuenta de computadora"],
  "locations": ["Remote / Remoto"],
  "sharedDriveAccess": "",
  "equipmentDetails": "",
  "contactEmail": "employee@thelatincenter.org"
}
```

The normal `formId`, `responseId`, `submittedAt`, and `answers.email` fields remain required. `responseId` provides stable idempotency: a webhook retry returns HTTP 200 for the existing queue item rather than creating another request. Do not include passwords. Other request types continue through the existing ticket-intake path.

The live Google Form and its Apps Script are external to this repository and are not changed by this feature branch.
