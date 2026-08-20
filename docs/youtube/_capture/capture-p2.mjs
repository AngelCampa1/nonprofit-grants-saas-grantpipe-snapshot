// P2 real-app capture harness — "Add a Grant and Allocate It Across Funds".
//
// Same approach as capture-p1.mjs: drive the real signed-in app with the repo's
// Playwright, capture via CDP Page.captureScreenshot (no font/stability wait),
// write PNGs with native Node fs. See capture-p1.mjs for the why.
//
// This script makes REAL writes to the demo org: it creates one grant
// ("Healthy Aging Partnership Grant") and two allocations, then triggers the
// over-allocation guard. Re-seed the demo org first for a pristine, repeatable
// capture (org-scoped delete + recreate in seed-demo.ts).
//
// Usage (app must be running on PORT, default 3050):
//   node docs/youtube/_capture/capture-p2.mjs
//
// Credentials default to the committed demo seed account; override with
// GRANTPIPE_E2E_EMAIL / GRANTPIPE_E2E_PASSWORD. The password is never printed.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const REPO = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const { chromium } = require(
  path.join(REPO, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright"),
);

const APP = `http://localhost:${process.env.GRANTPIPE_WEB_PORT ?? "3050"}`;
const EMAIL = process.env.GRANTPIPE_E2E_EMAIL ?? "demo@grantpipe.com";
const PASSWORD = process.env.GRANTPIPE_E2E_PASSWORD ?? "Demo2026!";
const OUT = path.join(REPO, "docs/youtube/_capture/p2");

// The grant we create live (see research-brief.md). Greater Cincinnati
// Foundation is an existing seeded funder; the create form only picks existing.
const GRANT_NAME = "Healthy Aging Partnership Grant";
const FUNDER = "Greater Cincinnati Foundation";
const AMOUNT = "60000";
const STATUS = "Awarded";
const START_DATE = "2026-07-01";
const END_DATE = "2027-06-30";
// Split: Capacity Building Fund $40,000 + General Operating Fund $20,000 → $0.
const ALLOC_1 = { fund: "Capacity Building Fund", amount: "40000" };
const ALLOC_2 = { fund: "General Operating Fund", amount: "20000" };

fs.mkdirSync(OUT, { recursive: true });

const log = (m) => process.stdout.write(`[capture-p2] ${m}\n`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // 2x for crisp downscale into 1080p video
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // Freeze motion so captures are deterministic and sharp.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}";
    document.documentElement.appendChild(style);
  });

  const shoot = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));
    log(`saved ${name} (${Math.round(Buffer.from(data, "base64").length / 1024)} KB)`);
  };
  const settle = async (ms = 450) => page.waitForTimeout(ms);

  // Pick a Radix select option: click trigger, then click the named option.
  const pickOption = async (triggerSelector, optionName) => {
    await page.locator(triggerSelector).click();
    await page.getByRole("option", { name: optionName, exact: true }).click();
    await settle(200);
  };

  // ---- Login -------------------------------------------------------------
  log(`login as ${EMAIL}`);
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL((url) => !url.pathname.replace(/\/+$/, "").endsWith("/login"), {
    timeout: 20000,
  });
  await settle();

  // ---- 1. Grants list (portfolio tab is default) -------------------------
  log("grants list");
  await page.goto(`${APP}/grants`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /^Grants$/ }).waitFor({ timeout: 15000 });
  // Wait for a seeded row so the table is populated, not mid-load.
  await page.getByText("Title III-C Nutrition Services Grant").first().waitFor({ timeout: 15000 });
  await settle(700);
  await shoot("01-grants-list.png");

  // ---- 2. Create grant — step 1 -----------------------------------------
  log("create grant step 1");
  await page.getByRole("button", { name: /^Add grant$/ }).click();
  await page.locator("#grant-name").waitFor({ timeout: 10000 });
  await page.locator("#grant-name").fill(GRANT_NAME);
  await pickOption('[aria-label="grant-funder-select"]', FUNDER);
  await page.locator("#grant-amount").fill(AMOUNT);
  await pickOption('[aria-label="grant-status"]', STATUS);
  await settle(300);
  await shoot("02-create-step1.png");

  // ---- 3. Create grant — step 2 -----------------------------------------
  log("create grant step 2");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.locator("#grant-start-date").waitFor({ timeout: 10000 });
  await page.locator("#grant-start-date").fill(START_DATE);
  await page.locator("#grant-end-date").fill(END_DATE);
  await settle(300);
  await shoot("03-create-step2.png");

  // ---- Submit and open the new grant -------------------------------------
  log("submit create grant");
  await page.getByRole("button", { name: /^Create grant$/ }).click();
  await settle(1200);
  // Dialog closes; table refetches. Open the new grant from its row link.
  const grantLink = page.getByRole("link", { name: GRANT_NAME });
  await grantLink.first().waitFor({ timeout: 20000 });
  await settle(400);
  await grantLink.first().click();
  await page.getByRole("heading", { name: GRANT_NAME }).waitFor({ timeout: 15000 });
  await settle(700);

  // ---- 4. Grant detail — four money cards, all unallocated ---------------
  log("grant detail (pre-allocation)");
  // A brand-new grant has no allocations: the Allocated card shows either
  // "No allocations" (null) or "$0.00" (zero). Wait on stable structure
  // instead — the four money-card titles and the grant amount.
  await page.getByText("Grant Amount").first().waitFor({ timeout: 10000 });
  await page.getByText("Allocated", { exact: true }).first().waitFor({ timeout: 10000 });
  // formatCurrency uses "auto" cents: whole-dollar amounts render without
  // decimals, so $60,000 (not $60,000.00).
  await page.getByText("$60,000", { exact: false }).first().waitFor({ timeout: 10000 });
  await settle(500);
  await shoot("04-detail-unallocated.png");

  // Move to the Allocations tab.
  await page.getByRole("tab", { name: /Allocations/ }).click();
  await page.getByRole("button", { name: /^Add allocation$/ }).waitFor({ timeout: 10000 });
  await settle(400);

  // ---- 5. Add allocation dialog (1st: Capacity Building Fund $40k) -------
  log(`add allocation 1: ${ALLOC_1.fund} ${ALLOC_1.amount}`);
  await page.getByRole("button", { name: /^Add allocation$/ }).click();
  await page.locator("#alloc-amount").waitFor({ timeout: 10000 });
  await pickOption("#alloc-fund", ALLOC_1.fund);
  await page.locator("#alloc-amount").fill(ALLOC_1.amount);
  await settle(300);
  await shoot("05-alloc1-dialog.png");
  await page.getByRole("button", { name: /^Save allocation$/ }).click();

  // ---- 6. Detail after 1st allocation (Allocated $40k / Unallocated $20k) -
  log("detail after allocation 1");
  await page.getByText(ALLOC_1.fund).first().waitFor({ timeout: 10000 });
  await settle(600);
  await shoot("06-detail-after-alloc1.png");

  // ---- 7. Add allocation dialog (2nd: General Operating Fund $20k) -------
  log(`add allocation 2: ${ALLOC_2.fund} ${ALLOC_2.amount}`);
  await page.getByRole("button", { name: /^Add allocation$/ }).click();
  await page.locator("#alloc-amount").waitFor({ timeout: 10000 });
  await pickOption("#alloc-fund", ALLOC_2.fund);
  await page.locator("#alloc-amount").fill(ALLOC_2.amount);
  await settle(300);
  await shoot("07-alloc2-dialog.png");
  await page.getByRole("button", { name: /^Save allocation$/ }).click();

  // ---- 8. Detail fully allocated (Allocated $60k / Unallocated $0) -------
  log("detail after allocation 2");
  await page.getByText(ALLOC_2.fund).first().waitFor({ timeout: 10000 });
  await settle(600);
  await shoot("08-detail-fully-allocated.png");

  // ---- 9. Guardrail: try to over-allocate → real server error -----------
  log("guardrail: attempt over-allocation");
  await page.getByRole("button", { name: /^Add allocation$/ }).click();
  await page.locator("#alloc-amount").waitFor({ timeout: 10000 });
  await pickOption("#alloc-fund", ALLOC_2.fund);
  await page.locator("#alloc-amount").fill("5000");
  await page.getByRole("button", { name: /^Save allocation$/ }).click();
  // The guard surfaces both a toast and an inline dialog alert; key on the
  // inline alert (it stays put while the toast may auto-dismiss).
  const guardError = page.locator('[role="dialog"] [role="alert"]').filter({ hasText: /exceed/i });
  await guardError.first().waitFor({ timeout: 15000 });
  const errText = (await guardError.first().textContent())?.replace(/\s+/g, " ").trim();
  log(`GUARD ERROR: ${errText}`);
  await settle(400);
  await shoot("09-guardrail-error.png");

  await browser.close();
  log("done");
}

main().catch((err) => {
  process.stderr.write(`[capture-p2] FAILED: ${err?.stack ?? err}\n`);
  process.exit(1);
});
