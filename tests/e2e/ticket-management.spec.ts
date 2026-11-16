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
  const resolved = page.getByLabel("Resolved");
  await expect(resolved).not.toBeChecked();
  await page.getByLabel("Priority").selectOption("P1");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").getByText("Changes saved.")).toBeVisible();
  await expect(page.getByLabel("Resolved")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Priority")).toHaveValue("P1");
  await page.getByLabel("Completed By").selectOption("Duane");
  await resolved.check();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").getByText("Changes saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Resolved")).toBeChecked();
  await expect(page.getByLabel("Completed By")).toHaveValue("Duane");
  await page.getByLabel("Resolved").uncheck();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status").getByText("Changes saved.")).toBeVisible();
  await expect(page.getByLabel("Resolved")).toHaveCount(0);
  await expect(page.locator("dl").getByText("In Progress")).toBeVisible();
});
