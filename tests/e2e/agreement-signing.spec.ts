import { expect, test } from "@playwright/test";

const token="T".repeat(43);
const expiresAt="2026-11-24T18:00:00.000Z";
const agreement={data:{asset_code:"SYNTH-001",manufacturer:"Example",model:"Notebook",serial_number:"SYNTHETIC-SERIAL",person_name:"Alex Example"},status:"PENDING",signedAt:null,expiresAt,termsVersion:"TEST-TERMS-v1"};
const testPdf=Buffer.from("%PDF-1.4\n% synthetic browser fixture\n%%EOF");

test("public agreement previews a populated PDF and records typed consent",async({page})=>{
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
  let documentRequests=0;
  await page.route("**/api/agreement/document",async route=>{documentRequests++;await route.fulfill({status:200,contentType:"application/pdf",body:testPdf});});
  await page.goto(`/agreement#token=${token}`);
  await expect(page.getByRole("heading",{name:"Laptop agreement"})).toBeVisible();
  await expect(page.getByTitle("LACC laptop agreement PDF preview")).toBeVisible();
  await expect.poll(()=>page.getByTitle("LACC laptop agreement PDF preview").getAttribute("src")).toMatch(/^blob:/);
  await expect(page.getByRole("link",{name:"Open PDF in new tab"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Review and sign agreement"})).toBeEnabled();
  await expect.poll(()=>new URL(page.url()).hash).toBe("");
  expect(accessPath).toBe("/api/agreement/access");
  expect(accessBody.token).toBe(token);
  await page.getByLabel("Type your full legal name").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/I agree that typing my full name/)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button",{name:"Review and sign agreement"})).toBeFocused();
  await page.getByLabel("Type your full legal name").fill("Alex Example");
  await expect(page.getByTitle("LACC laptop agreement PDF preview")).toHaveAttribute("src",/^blob:/);
  await page.getByLabel(/I agree that typing my full name/).check();
  await page.getByRole("button",{name:"Review and sign agreement"}).click();
  await expect(page.getByRole("status").filter({hasText:"signed PDF has been finalized and stored"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Download signed PDF"})).toBeVisible();
  expect(documentRequests).toBe(1);
  expect(signPath).toBe("/api/agreement/sign");
  expect(signBody).toMatchObject({token,signerName:"Alex Example",consent:true});
  expect(await page.locator("body").innerText()).not.toContain(token);
});

test("invalid public link does not request or reveal agreement details",async({page})=>{
  let apiCalls=0;
  await page.route("**/api/agreement/**",async route=>{apiCalls++;await route.fulfill({status:500,body:"unexpected"});});
  await page.goto("/agreement#token=not-a-token");
  await expect(page.getByRole("heading",{name:"Agreement link unavailable"})).toBeVisible();
  expect(apiCalls).toBe(0);
  await expect(page.getByText("Alex Example")).toHaveCount(0);
});
