import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("../../integrations/google-forms/Code.gs", import.meta.url), "utf8");

describe("Google Form Apps Script field mapping", () => {
  it("maps the legacy request-type question and multi-select value", () => {
    const context = {};
    runInNewContext(script, context);
    const response = runInNewContext(`payloadFromResponse_(
      { getId: () => LACC_FORM_EDITOR_ID },
      {
        getId: () => "response-test",
        getTimestamp: () => new Date("2026-11-06T19:51:00.000Z"),
        getItemResponses: () => [
          { getItem: () => ({ getTitle: () => "LACC work email / Correo electrónico del LACC" }), getResponse: () => "employee@thelatincenter.org" },
          { getItem: () => ({ getTitle: () => "Please check all IT needs / Por favor indique todos los requerimientos de IT" }), getResponse: () => ["Printing Issues / Problemas con impresora", "Other / Otra"] },
        ],
      }
    )`, context) as { answers: { email: string; requestType: string } };

    expect(response.answers).toMatchObject({
      email: "employee@thelatincenter.org",
      requestType: "Printing Issues / Problemas con impresora,Other / Otra",
    });
  });
});
