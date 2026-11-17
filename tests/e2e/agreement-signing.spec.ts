import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const token="T".repeat(43);
const expiresAt="2026-11-24T18:00:00.000Z";
const agreement={data:{asset_code:"SYNTH-001",manufacturer:"Example",model:"Notebook",serial_number:"SYNTHETIC-SERIAL",person_name:"Alex Example",person_email:"alex@example.invalid",terms_text:"Use the equipment for work and return it when employment ends."},status:"PENDING",signedAt:null,expiresAt,termsVersion:"TEST-TERMS-v1"};

test("public agreement keeps bearer token out of request URLs and records typed consent",async({page},testInfo)=>{
  let accessPath="",accessBody:Record<string,unknown>={};
  await page.route("**/api/agreement/access",async route=>{
    accessPath=new URL(route.request().url()).pathname;
    accessBody=JSON.parse(route.request().postData()||"{}");
    await route.fulfill({status:200,contentType:"application/json",headers:{"cache-control":"private, no-store","referrer-policy":"no-referrer"},body:JSON.stringify({agreement})});
  });
  let signPath="",signBody:Record<string,unknown>={};
  await page.route("**/api/agreement/sign",async route=>{
    signPath=new URL(route.request().url()).pathname;
    signBody=JSON.parse(route.request().postData()||"{}");
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,signerName:"Alex Example",signedAt:"2026-11-17T19:30:00.000Z"})});
  });
  await page.goto(`/agreement#token=${token}`);
  await expect(page.getByRole("heading",{name:"Laptop / Equipment Agreement"})).toBeVisible();
  await expect(page.getByText("SYNTHETIC-SERIAL")).toBeVisible();
  await expect(page.getByText("Agreement terms")).toBeVisible();
  await expect.poll(()=>new URL(page.url()).hash).toBe("");
  expect(accessPath).toBe("/api/agreement/access");
  expect(accessBody.token).toBe(token);
  await page.getByLabel("Your full name").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/I agree that typing my name/)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button",{name:"Review and sign agreement"})).toBeFocused();
  await page.getByLabel("Your full name").fill("Alex Example");
  await page.getByLabel(/I agree that typing my name/).check();
  await page.getByRole("button",{name:"Review and sign agreement"}).click();
  await expect(page.getByRole("status").filter({hasText:"Electronic signature recorded"})).toBeVisible();
  expect(signPath).toBe("/api/agreement/sign");
  expect(signBody).toMatchObject({token,signerName:"Alex Example",consent:true});
  expect(await page.locator("body").innerText()).not.toContain(token);
  await page.evaluate(()=>{window.print=()=>{document.documentElement.dataset.printRequested="true";};});
  await page.getByRole("button",{name:"Print agreement"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-requested","true");
  const pdf=await page.pdf({format:"Letter",printBackground:true});
  expect(pdf.subarray(0,4).toString()).toBe("%PDF");
  expect(pdf.byteLength).toBeGreaterThan(1000);
  await writeFile(testInfo.outputPath("synthetic-agreement.pdf"),pdf);
});

test("invalid public link does not request or reveal agreement details",async({page})=>{
  let apiCalls=0;
  await page.route("**/api/agreement/**",async route=>{apiCalls++;await route.fulfill({status:500,body:"unexpected"});});
  await page.goto("/agreement#token=not-a-token");
  await expect(page.getByRole("heading",{name:"Agreement link unavailable"})).toBeVisible();
  expect(apiCalls).toBe(0);
  await expect(page.getByText("Alex Example")).toHaveCount(0);
});
