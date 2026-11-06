BEGIN;

-- The Google Forms response ID is the durable source identity for replay-safe intake.
CREATE UNIQUE INDEX IF NOT EXISTS lacc_tickets_google_form_response
  ON lacc_tickets ((data->>'sourceFormId'), (data->>'sourceFormResponseId'))
  WHERE data ? 'sourceFormId' AND data ? 'sourceFormResponseId';

COMMIT;
