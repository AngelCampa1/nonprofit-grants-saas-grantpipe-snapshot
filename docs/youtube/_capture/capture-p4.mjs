// P4 real-app capture harness — "How to Track Grant Spending Without Losing Your Mind".
//
// Same approach as capture-p1/p2/p3.mjs: drive the real signed-in app with the
// repo's Playwright, capture via CDP Page.captureScreenshot (no font/stability
// wait), write PNGs with native Node fs. See capture-p1.mjs for the why.
//
// READ-ONLY: this script navigates and screenshots. It opens the "Add expense"
// dialog for a screenshot but never submits, so it makes NO writes to the demo
// org. Re-seed the demo org before running so the Title III-C spend figures are
// deterministic (`pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts`).
//
// Targets the seeded "Title III-C Nutrition Services Grant" ($185,000, 11
// seeded expenses across six months — the richest spend data in the seed).
//
// Usage (app must be running on PORT, default 3050):
//   node docs/youtube/_capture/capture-p4.mjs
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
const OUT = path.join(REPO, "docs/youtube/_capture/p4");

const GRANT = "Title III-C Nutrition Services Grant"; // seeded grant with the richest expense ledger

fs.mkdirSync(OUT, { recursive: true });

const log = (m) => process.stdout.write(`[capture-p4] ${m}\n`);

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
  const cardText = async (label) => {
    try {
      const el = page.getByText(label, { exact: true }).first();
      // climb to the enclosing card and read its full text (label + value)
      const card = el.locator("xpath=ancestor::*[contains(@class,'rounded') or self::*][1]");
      const t = (await card.textContent())?.replace(/\s+/g, " ").trim();
      return t ?? "(none)";
    } catch {
      return "(none)";
    }
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

  // ---- Open the grant ----------------------------------------------------
  log("grants list");
  await page.goto(`${APP}/grants`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: GRANT }).first().waitFor({ timeout: 15000 });
  await settle(500);
  await page.getByRole("link", { name: GRANT }).first().click();

  // ---- 1. Grant detail Overview — the four cards -------------------------
  log("grant detail Overview (four cards)");
  await page.getByText("Grant Amount", { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByText("Remaining to Spend", { exact: true }).first().waitFor({ timeout: 10000 });
  await settle(700);
  await shoot("01-grant-overview-cards.png");

  // Log the real card values so narration can be verified against the screen.
  log(`CARD ${await cardText("Grant Amount")}`);
  log(`CARD ${await cardText("Allocated")}`);
  log(`CARD ${await cardText("Unallocated")}`);
  log(`CARD ${await cardText("Remaining to Spend")}`);

  // ---- 2. Burn rate line on the Overview ---------------------------------
  log("grant Overview — burn rate line");
  const burn = page.getByText(/Burn rate:/i).first();
  if (await burn.count().catch(() => 0)) {
    await burn.scrollIntoViewIfNeeded();
    await settle(400);
    log(`BURN ${(await burn.textContent())?.replace(/\s+/g, " ").trim()}`);
    await shoot("02-grant-overview-burnrate.png");
  } else {
    log("BURN: 'Burn rate:' line not found on Overview");
  }

  // ---- 3. Expenses tab — the itemized ledger -----------------------------
  log("Expenses tab (ledger)");
  await page.getByRole("tab", { name: /^Expenses$/ }).click();
  await page.getByRole("button", { name: /^Add expense$/ }).waitFor({ timeout: 15000 });
  await settle(600);
  // Count how many expense rows render, for verification against the seed (11).
  const rows = page.locator('[value="expenses"] .text-sm, [data-state="active"] li, [data-state="active"] tr');
  log(`EXPENSE ROWS (approx) = ${await rows.count().catch(() => 0)}`);
  await shoot("03-expenses-ledger.png");

  // ---- 4. Add-expense dialog (three fields, no submit) -------------------
  log("Add-expense dialog (Amount / Date / Description)");
  await page.getByRole("button", { name: /^Add expense$/ }).click();
  await page.locator("#exp-amount").waitFor({ timeout: 10000 });
  await page.locator("#exp-date").waitFor({ timeout: 5000 });
  await page.locator("#exp-desc").waitFor({ timeout: 5000 });
  await settle(400);
  await shoot("04-add-expense-dialog.png");
  await page.keyboard.press("Escape");
  await settle(300);

  // ---- 5. Spend-Down view (pace / burn rate) -----------------------------
  log("Spend-Down tab");
  const sdTab = page.getByRole("tab", { name: /^Spend-?Down$/ });
  if (await sdTab.count().catch(() => 0)) {
    await sdTab.first().click();
    await settle(900);
    const mo = page.getByText(/\/mo/).first();
    if (await mo.count().catch(() => 0)) {
      log(`SPEND-DOWN ${(await mo.textContent())?.replace(/\s+/g, " ").trim()}`);
    }
    await shoot("05-spend-down.png");
  } else {
    log("SPEND-DOWN: tab not found (plan gating?) — beat may be cut");
  }

  // ---- 6. Fund side — the same dollars as 'Spent' (cross-link to P3) ------
  log("fund detail (Spent card) — cross-link");
  await page.goto(`${APP}/funds`, { waitUntil: "domcontentloaded" });
  const FUND = "Title III-C Nutrition Fund";
  const fundLink = page.getByRole("link", { name: FUND }).first();
  if (await fundLink.count().catch(() => 0)) {
    await fundLink.waitFor({ timeout: 10000 });
    await fundLink.click();
    await page.getByRole("heading", { name: "Spent" }).waitFor({ timeout: 15000 }).catch(() => {});
    await settle(600);
    log(`FUND ${await cardText("Spent")}`);
    log(`FUND ${await cardText("Balance")}`);
    await shoot("06-fund-spent.png");
  } else {
    log("FUND: link not found — cross-link beat optional, skipping");
  }

  await browser.close();
  log("done");
}

main().catch((err) => {
  process.stderr.write(`[capture-p4] FAILED: ${err?.stack ?? err}\n`);
  process.exit(1);
});
