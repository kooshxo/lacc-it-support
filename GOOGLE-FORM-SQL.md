# Google Form to SQL ticket intake

The existing bilingual LACC IT Support Request Form remains the public intake. Its signed Apps Script bridge posts submissions to `/api/intake/google-form`; the deployed route validates the HMAC, accepted Form ID, LACC work email domain, and required fields before creating a SQL ticket. A response ID is the idempotency key, and the Apps Script queue retries temporary delivery failures.

The retry queue is for a failed **Apps Script-to-webhook/SQL delivery** after a person submits the Form; it is not another Google Form submission and does not depend on the respondent reloading the page. The submit trigger stores the original response payload and retries it on a time-based trigger with backoff. Response-ID idempotency makes a repeat delivery safe. If Apps Script itself never runs (for example, the trigger is disabled or authorization is revoked), this queue cannot recover that response automatically; monitor Apps Script executions and Form response history.

## Current rollout status

- Preview is deployed and its signed webhook successfully created one SQL ticket, recognized a replay as a duplicate, and removed the temporary test record.
- Production SQL is provisioned and seeded. The Production-targeted deployment builds successfully and the signed intake route has been exercised against the production database; the test row was removed.
- The ready Production deployment is assigned to `https://lacc-it-support.vercel.app`.
- Production and Preview environment variables are configured, including a restricted SQL runtime role, the accepted Form ID, and separate webhook secrets.
- The bound Apps Script bridge and both triggers (form submit and five-minute retry) are installed. The form accepts anonymous responses and manually collects LACC work email.
- The public endpoint responds and rejects unsigned requests with `401 Unauthorized`, as expected. A real controlled Form submission has not yet been sent, so the full form-to-SQL path still needs end-to-end verification.

## Install from the authorized Form editor

1. Open the form editor using an account with **Editor** access. Open **Extensions → Apps Script**, replace the script with `integrations/google-forms/Code.gs`, and save it.
2. In Apps Script **Project Settings → Script Properties**, set `LACC_IT_WEBHOOK_URL` to `https://lacc-it-support.vercel.app/api/intake/google-form` and `LACC_IT_WEBHOOK_SECRET` to the Production secret already configured in Vercel. Keep the secret private; do not put it in a response field, chat, or source file.
3. Run `installLaccTicketTriggers` once and approve the Forms, external-request, trigger, and mail scopes. It adds a required bilingual full-name field if missing, installs one form-submit trigger and one five-minute retry trigger, then unlinks the old response spreadsheet if one exists. Existing rows remain in that spreadsheet as an archive; new responses stop going to that Sheet. Google Forms continues to keep its own response history.
4. Submit one controlled request through the public form and confirm one ticket appears in SQL; replay the same response and confirm it does not duplicate. Confirm users can reach the form without signing into Google.

The authorized form editor account now owns the Apps Script bridge and installed triggers; they are visible in the Apps Script Triggers page.

## Data handling

- The bridge does not transmit PIN answers to SQL. Do not collect passwords, current PINs, or preferred PINs in a public form. Google Forms retains its own response history, so remove any PIN question before enabling the public SQL workflow; use the access-help request and verify identity through IT before changing a PIN.
- A typed LACC email is not proof of identity. Form-created tickets are marked unverified and are restricted to IT until a separate identity check exists.
- Only safe printer reference fields (location and IP address) were imported. Passwords and credential fields were excluded.
- Until a real controlled response succeeds, consider the form-to-SQL flow configured but not fully verified for employee use.
