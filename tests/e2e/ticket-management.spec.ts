import { expect, test } from "@playwright/test";
import seedTicketManagementDatabase from "./ticket-management.setup";

test.beforeEach(async () => seedTicketManagementDatabase());

test("staff can edit, reload, solve, and reopen a ticket without assignment or conversation controls", async ({ page }) => {
  await page.goto("/requests/LACC-E2E-100001");
  await expect(page.getByRole("heading", { name: "Ticket management E2E persistence" })).toBeVisible();
  await expect(page.getByText(/Conversation with Requester|Conversation$/i)).toHaveCount(0);
  await expect(page.getByLabel(/Assigned staff member/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /send message|send$/i })).toHaveCount(0);
  await page.getByLabel("Priority").selectOption("P1");
  await page.locator('input[name="expectedVersion"]').evaluate((element) => { (element as HTMLInputElement).value = "999"; });
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.locator('[data-slot="alert"]').filter({ hasText: "changed since you opened it" })).toBeVisible();
  await expect(page.getByText("Changes saved.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Priority")).toHaveValue("P3");
  await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
  const status = page.getByLabel("Status");
  await expect(status.locator("option")).toHaveText(["Received", "In Progress", "Solved"]);
  await status.selectOption("IN_PROGRESS");

  await page.getByLabel("Priority").selectOption("P1");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").getByText("Changes saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Priority")).toHaveValue("P1");
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");

  await page.getByLabel("Status").selectOption("RESOLVED");
  await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");
  await page.getByLabel("Completed By").fill("Tech QA");
  await page.getByLabel("Resolution Details").fill("Reinstalled the wireless profile.");
  await page.getByLabel("Internal IT Notes").fill("Confirmed the device reconnects after sleep.");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").getByText("Changes saved.")).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");
  await page.reload();
  await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");
  await expect(page.getByLabel("Completed By")).toHaveValue("Tech QA");
  await expect(page.getByLabel("Resolution Details")).toHaveValue("Reinstalled the wireless profile.");
  await expect(page.getByLabel("Internal IT note history").getByText("Confirmed the device reconnects after sleep.")).toBeVisible();

  await page.getByLabel("Status").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").getByText("Changes saved.")).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  await page.reload();
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
});
