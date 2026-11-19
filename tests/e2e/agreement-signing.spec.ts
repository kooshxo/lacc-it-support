import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { renderLaptopAgreementPdf } from "@/lib/agreements/laptop-pdf";

const token = "T".repeat(43);
const agreement = {
  data: { asset_code: "SYNTH-001", manufacturer: "Example", model: "Notebook", serial_number: "SYNTHETIC-SERIAL", person_name: "Alex Example", signer_name: "" as string },
  status: "PENDING",
  signedAt: null as string | null,
  expiresAt: "2026-11-24T18:00:00.000Z",
  termsVersion: "TEST-TERMS-v1",
};

async function approvedPdf(signerName?: string, signedAt?: string) {
  const template = new Uint8Array(await readFile("public/templates/lacc-laptop-letter-background.jpg"));
  return Buffer.from(await renderLaptopAgreementPdf(template, agreement.data, { signerName, signedAt }));
}

test("public agreement survives refresh and history navigation, signs, and renders the signed PDF", async ({ page }) => {
  const signedAt = "2026-11-17T19:30:00.000Z";
  const signedPdf = await approvedPdf("Alex Example", signedAt);
  let accessRequests = 0;
  const accessBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/agreement/access", async (route) => {
    accessRequests++;
    accessBodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" }, body: JSON.stringify({ agreement }) });
  });

  let signPath = "";
  let signBody: Record<string, unknown> = {};
  await page.route("**/api/agreement/sign", async (route) => {
    signPath = new URL(route.request().url()).pathname;
    signBody = JSON.parse(route.request().postData() || "{}");
    agreement.status = "COMPLETED";
    agreement.signedAt = signedAt;
    agreement.data.signer_name = "Alex Example";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, signerName: "Alex Example", signedAt }) });
  });

  let documentRequests = 0;
  await page.route("**/api/agreement/document", async (route) => {
    documentRequests++;
    expect(route.request().method()).toBe("POST");
    expect(JSON.parse(route.request().postData() || "{}")).toMatchObject({ token });
    await route.fulfill({ status: 200, contentType: "application/pdf", body: signedPdf });
  });

  await page.goto(`/agreement#token=${token}`);
  await expect(page.getByRole("heading", { name: "Laptop agreement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and sign agreement" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Open PDF in new tab" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  const canvas = page.getByRole("img", { name: "Page 1 of 1 of the LACC laptop agreement" });
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).width)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("115%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  const initialAccessRequests = accessRequests;
  expect(initialAccessRequests).toBeGreaterThanOrEqual(1);
  expect(accessBodies.every((body) => body.token === token)).toBe(true);
  expect(page.url()).not.toContain(token);
  expect(await page.locator("body").innerText()).not.toContain(token);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Laptop agreement" })).toBeVisible();
  await expect.poll(() => accessRequests).toBeGreaterThan(initialAccessRequests);
  expect(accessBodies.at(-1)).toEqual({ token });

  await page.goto("/inventory");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Laptop agreement" })).toBeVisible();
  await page.goForward();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Laptop agreement" })).toBeVisible();

  const unsignedPreview = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  await page.getByLabel("Type your full legal name").fill("Alex Example");
  await expect.poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL())).not.toBe(unsignedPreview);
  await expect(page.getByRole("button", { name: "Review and sign agreement" })).toBeEnabled();
  await page.getByLabel(/I agree that typing my full name/).check();
  await page.getByRole("button", { name: "Review and sign agreement" }).click();
  await expect(page.getByRole("status").filter({ hasText: "signed PDF has been finalized and stored" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download signed PDF" })).toBeVisible();
  await expect.poll(() => documentRequests).toBeGreaterThan(0);
  expect(signPath).toBe("/api/agreement/sign");
  expect(signBody).toMatchObject({ token, signerName: "Alex Example", consent: true });
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).width)).toBeGreaterThan(0);

  const documentsBeforeRefresh = documentRequests;
  const accessesBeforeRefresh = accessRequests;
  await page.reload();
  await expect(page.getByText("Electronically signed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download signed PDF" })).toBeVisible();
  await expect.poll(() => accessRequests).toBeGreaterThan(accessesBeforeRefresh);
  await expect.poll(() => documentRequests).toBeGreaterThan(documentsBeforeRefresh);
  expect(accessBodies.at(-1)).toEqual({ token });
  expect(await page.locator("body").innerText()).not.toContain(token);
});

test("expired and revoked links are rejected, and a PDF cannot be fetched with an unauthenticated GET", async ({ page, request }) => {
  const expiredToken = "E".repeat(43);
  const revokedToken = "R".repeat(43);
  const attempted: string[] = [];
  await page.route("**/api/agreement/access", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as { token?: string };
    attempted.push(body.token || "");
    await route.fulfill({ status: 404, contentType: "application/json", headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" }, body: JSON.stringify({ error: "This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help." }) });
  });
  await page.goto(`/agreement#token=${expiredToken}`);
  await expect(page.getByRole("heading", { name: "Agreement link unavailable" })).toBeVisible();
  await expect(page).toHaveURL(/\/agreement$/);
  await page.goto(`/agreement#token=${revokedToken}`);
  await expect(page.getByRole("heading", { name: "Agreement link unavailable" })).toBeVisible();
  expect(new Set(attempted)).toEqual(new Set([expiredToken, revokedToken]));

  const unauthorizedPdf = await request.get("/api/agreement/document");
  expect([401, 404, 405]).toContain(unauthorizedPdf.status());
});
