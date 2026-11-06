import { test, expect } from "@playwright/test";

test("employee can reach the mobile-first help flow",async({page})=>{await page.goto("/dashboard");await expect(page.getByRole("heading",{name:/How can IT help today/i})).toBeVisible();await page.getByRole("link",{name:/Get IT help/i}).first().click();await expect(page.getByRole("heading",{name:/Tell us what is getting in your way/i})).toBeVisible();await expect(page.getByLabel("What’s happening?")).toBeVisible();});

test("employee API denies another employee's ticket",async({request})=>{const response=await request.get("/api/tickets/LACC-2026-3D91B4");expect(response.status()).toBe(403);expect(await response.text()).not.toContain("Printer queue is paused");});

test("employee cannot open IT or admin routes",async({page})=>{await page.goto("/it");await expect(page).toHaveURL(/access-denied/);await page.goto("/admin");await expect(page).toHaveURL(/access-denied/);});
