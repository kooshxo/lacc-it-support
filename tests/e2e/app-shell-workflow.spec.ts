import { expect, test } from "@playwright/test";

test("IT navigation stays light and retains the New Hire Setup management tab", async ({ page }) => {
  await page.goto("/it");
  const sidebar = page.locator("aside");
  await expect(sidebar).toHaveClass(/bg-background/);
  await expect(sidebar).not.toHaveClass(/bg-slate-950/);

  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(mobileNavigation.getByRole("link", { name: "New Hire Setup / Nuevas contrataciones" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "New Hire Setup / Nuevas contrataciones" })).toBeVisible();
  }
});

test("IT queue does not offer request creation and the former IT create URL returns to the queue", async ({ page }) => {
  await page.goto("/it/onboarding");
  await expect(page.getByRole("link", { name: /New setup request|Nueva solicitud/i })).toHaveCount(0);
  await page.goto("/it/onboarding/new");
  await expect(page).toHaveURL(/\/it\/onboarding$/);
});
