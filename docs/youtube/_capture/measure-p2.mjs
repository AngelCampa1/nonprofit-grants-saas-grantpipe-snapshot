// P2 region-measurement harness. Mirrors capture-p2.mjs's live flow but instead of
// shooting PNGs it records boundingBox() rects of the spotlight/zoom targets.
//
// Why: the P2 compositions need EXACT native-pixel regions (not eyeballed) for
// zoomTo()/spot() framing. boundingBox() at viewport 1920x1080 returns CSS px in the
// same coordinate space the screenshots were captured in (deviceScaleFactor only
// changes pixel density, not layout coords) — i.e. native 1920x1080 px, exactly what
// zoomTo({nx,ny,nw,nh}) expects. Output: _capture/p2-regions.json.
//
// Re-seed the demo org first for a pristine run (the create flow is not idempotent):
//   pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts
//
// Usage (app must be running on PORT, default 3050):
//   node docs/youtube/_capture/measure-p2.mjs

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
const OUT = path.join(REPO, "docs/youtube/_capture/p2-regions.json");

const GRANT_NAME = "Healthy Aging Partnership Grant";
const FUNDER = "Greater Cincinnati Foundation";
const AMOUNT = "60000";
const STATUS = "Awarded";
const START_DATE = "2026-07-01";
const END_DATE = "2027-06-30";
const ALLOC_1 = { fund: "Capacity Building Fund", amount: "40000" };
const ALLOC_2 = { fund: "General Operating Fund", amount: "20000" };

const regions = {};
const log = (m) => process.stdout.write(`[measure-p2] ${m}\n`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}";
    document.documentElement.appendChild(style);
  });
  const settle = async (ms = 450) => page.waitForTimeout(ms);

  const round = (b) =>
    b ? { nx: Math.round(b.x), ny: Math.round(b.y), nw: Math.round(b.width), nh: Math.round(b.height) } : null;

  // Resolve a spec to a rect. spec: {sel} CSS | {role,name} | {text, climb}
  const rectOf = async (spec) => {
    try {
      if (spec.sel) return round(await page.locator(spec.sel).first().boundingBox());
      if (spec.role)
        return round(
          await page.getByRole(spec.role, { name: spec.name, exact: spec.exact ?? false }).first().boundingBox(),
        );
      if (spec.text) {
        const r = await page.evaluate(
          ({ text, climb }) => {
            const all = Array.from(document.querySelectorAll("body *"));
            // deepest element that contains the text
            let el = null;
            for (const e of all) {
              if (e.textContent && e.textContent.includes(text) && e.children.length === 0) {
                el = e;
                break;
              }
            }
            if (!el) {
              for (const e of all) {
                if (e.textContent && e.textContent.trim() === text) {
                  el = e;
                  break;
                }
              }
            }
            if (!el) return null;
            const target = climb ? el.closest(climb) || el : el;
            const r = target.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          },
          { text: spec.text, climb: spec.climb },
        );
        return round(r);
      }
    } catch (err) {
      log(`  ! ${JSON.stringify(spec)} -> ${err.message}`);
    }
    return null;
  };

  const measure = async (screen, specs) => {
    regions[screen] = {};
    for (const [key, spec] of Object.entries(specs)) {
      const r = await rectOf(spec);
      regions[screen][key] = r;
      log(`  ${screen}.${key} = ${r ? `${r.nx},${r.ny} ${r.nw}x${r.nh}` : "NULL"}`);
    }
  };

  const pickOption = async (triggerSelector, optionName) => {
    await page.locator(triggerSelector).click();
    await page.getByRole("option", { name: optionName, exact: true }).click();
    await settle(200);
  };

  // ---- Login ----
  log(`login as ${EMAIL}`);
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL((url) => !url.pathname.replace(/\/+$/, "").endsWith("/login"), { timeout: 20000 });
  await settle();

  // ---- 01 grants list ----
  log("01 grants list");
  await page.goto(`${APP}/grants`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /^Grants$/ }).waitFor({ timeout: 15000 });
  await page.getByText("Title III-C Nutrition Services Grant").first().waitFor({ timeout: 15000 });
  await settle(700);
  await measure("01-grants-list", {
    addGrant: { role: "button", name: /^Add grant$/ },
  });

  // ---- 02 create step 1 ----
  log("02 create step 1");
  await page.getByRole("button", { name: /^Add grant$/ }).click();
  await page.locator("#grant-name").waitFor({ timeout: 10000 });
  await page.locator("#grant-name").fill(GRANT_NAME);
  await pickOption('[aria-label="grant-funder-select"]', FUNDER);
  await page.locator("#grant-amount").fill(AMOUNT);
  await pickOption('[aria-label="grant-status"]', STATUS);
  await settle(300);
  await measure("02-create-step1", {
    dialog: { sel: '[role="dialog"]' },
    name: { sel: "#grant-name" },
    funder: { sel: '[aria-label="grant-funder-select"]' },
    amount: { sel: "#grant-amount" },
    status: { sel: '[aria-label="grant-status"]' },
    meaning: { text: "award details", climb: "p,div" },
  });

  // ---- 03 create step 2 ----
  log("03 create step 2");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.locator("#grant-start-date").waitFor({ timeout: 10000 });
  await page.locator("#grant-start-date").fill(START_DATE);
  await page.locator("#grant-end-date").fill(END_DATE);
  await settle(300);
  await measure("03-create-step2", {
    dialog: { sel: '[role="dialog"]' },
    startDate: { sel: "#grant-start-date" },
    endDate: { sel: "#grant-end-date" },
  });

  // ---- submit + open ----
  log("submit create grant");
  await page.getByRole("button", { name: /^Create grant$/ }).click();
  await settle(1200);
  const grantLink = page.getByRole("link", { name: GRANT_NAME });
  await grantLink.first().waitFor({ timeout: 20000 });
  await settle(400);
  await grantLink.first().click();
  await page.getByRole("heading", { name: GRANT_NAME }).waitFor({ timeout: 15000 });
  await settle(700);

  // ---- 04 detail unallocated: four money cards ----
  log("04 detail unallocated");
  await page.getByText("Grant Amount").first().waitFor({ timeout: 10000 });
  await page.getByText("$60,000", { exact: false }).first().waitFor({ timeout: 10000 });
  await settle(500);
  await measure("04-detail-unallocated", {
    cardGrantAmount: { text: "Grant Amount", climb: '[data-slot="card"]' },
    cardAllocated: { text: "Allocated", climb: '[data-slot="card"]' },
    cardUnallocated: { text: "Unallocated", climb: '[data-slot="card"]' },
    cardRemaining: { text: "Remaining to Spend", climb: '[data-slot="card"]' },
    cardRow: { sel: ".grid" },
  });

  await page.getByRole("tab", { name: /Allocations/ }).click();
  await page.getByRole("button", { name: /^Add allocation$/ }).waitFor({ timeout: 10000 });
  await settle(400);

  // ---- 05 alloc1 dialog ----
  log("05 alloc1 dialog");
  await page.getByRole("button", { name: /^Add allocation$/ }).click();
  await page.locator("#alloc-amount").waitFor({ timeout: 10000 });
  await pickOption("#alloc-fund", ALLOC_1.fund);
  await page.locator("#alloc-amount").fill(ALLOC_1.amount);
  await settle(300);
  await measure("05-alloc1-dialog", {
    dialog: { sel: '[role="dialog"]' },
    fund: { sel: "#alloc-fund" },
    amount: { sel: "#alloc-amount" },
    desc: { text: "Document which fund", climb: "p,div" },
  });
  await page.getByRole("button", { name: /^Save allocation$/ }).click();

  // ---- 06 after alloc1 ----
  log("06 after alloc1");
  await page.getByText(ALLOC_1.fund).first().waitFor({ timeout: 10000 });
  await settle(600);
  await measure("06-detail-after-alloc1", {
    cardAllocated: { text: "Allocated", climb: '[data-slot="card"]' },
    cardUnallocated: { text: "Unallocated", climb: '[data-slot="card"]' },
    rowCapacity: { text: ALLOC_1.fund, climb: '[data-slot="card"]' },
    cardRow: { sel: ".grid" },
  });

  // ---- 07 alloc2 dialog ----
  log("07 alloc2 dialog");
  await page.getByRole("button", { name: /^Add allocation$/ }).click();
  await page.locator("#alloc-amount").waitFor({ timeout: 10000 });
  await pickOption("#alloc-fund", ALLOC_2.fund);
  await page.locator("#alloc-amount").fill(ALLOC_2.amount);
  await settle(300);
  await measure("07-alloc2-dialog", {
    dialog: { sel: '[role="dialog"]' },
    fund: { sel: "#alloc-fund" },
    amount: { sel: "#alloc-amount" },
  });
  await page.getByRole("button", { name: /^Save allocation$/ }).click();

  // ---- 08 fully allocated ----
  log("08 fully allocated");
  await page.getByText(ALLOC_2.fund).first().waitFor({ timeout: 10000 });
  await settle(600);
  await measure("08-detail-fully-allocated", {
    cardAllocated: { text: "Allocated", climb: '[data-slot="card"]' },
    cardUnallocated: { text: "Unallocated", climb: '[data-slot="card"]' },
    rowCapacity: { text: ALLOC_1.fund, climb: '[data-slot="card"]' },
    rowGeneral: { text: ALLOC_2.fund, climb: '[data-slot="card"]' },
    cardRow: { sel: ".grid" },
  });

  // ---- 09 guardrail ----
  log("09 guardrail");
  await page.getByRole("button", { name: /^Add allocation$/ }).click();
  await page.locator("#alloc-amount").waitFor({ timeout: 10000 });
  await pickOption("#alloc-fund", ALLOC_2.fund);
  await page.locator("#alloc-amount").fill("5000");
  await page.getByRole("button", { name: /^Save allocation$/ }).click();
  const guardError = page.locator('[role="dialog"] [role="alert"]').filter({ hasText: /exceed/i });
  await guardError.first().waitFor({ timeout: 15000 });
  await settle(400);
  await measure("09-guardrail-error", {
    dialog: { sel: '[role="dialog"]' },
    alert: { sel: '[role="dialog"] [role="alert"]' },
    fund: { sel: "#alloc-fund" },
    amount: { sel: "#alloc-amount" },
  });

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(regions, null, 2));
  log(`wrote ${OUT}`);
}

main().catch((err) => {
  process.stderr.write(`[measure-p2] FAILED: ${err?.stack ?? err}\n`);
  process.exit(1);
});
