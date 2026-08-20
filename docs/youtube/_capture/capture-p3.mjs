// P3 real-app capture harness — "How to Track Restricted Funds Correctly".
//
// Same approach as capture-p1/p2.mjs: drive the real signed-in app with the
// repo's Playwright, capture via CDP Page.captureScreenshot (no font/stability
// wait), write PNGs with native Node fs. See capture-p1.mjs for the why.
//
// READ-ONLY: this script navigates and screenshots. It opens the Add-fund
// dialog and the fund-type select for a screenshot but never submits, so it
// makes NO writes to the demo org. No re-seed required (a re-seed only makes
// the restricted balances deterministic).
//
// Targets the seeded "Title III-C Nutrition Fund" (temporarily_restricted) —
// the only demo fund with restriction-lifecycle data (additions + one
// evidenced release + one un-evidenced release that raises an alert). Demo org
// is on the `growth` plan, so the Restrictions tab renders the real panel.
//
// Usage (app must be running on PORT, default 3050):
//   node docs/youtube/_capture/capture-p3.mjs
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
const OUT = path.join(REPO, "docs/youtube/_capture/p3");

const FUND = "Title III-C Nutrition Fund"; // the seeded temporarily_restricted fund with lifecycle data

fs.mkdirSync(OUT, { recursive: true });

const log = (m) => process.stdout.write(`[capture-p3] ${m}\n`);

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

  // ---- 1. Funds list, card view (default) --------------------------------
  log("funds list (cards)");
  await page.goto(`${APP}/funds`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /^Funds$/ }).waitFor({ timeout: 15000 });
  await page.getByRole("link", { name: FUND }).first().waitFor({ timeout: 15000 });
  await settle(700);
  await shoot("01-funds-list-cards.png");

  // ---- 2. Add-fund dialog with the type select open (no submit) ----------
  log("add-fund dialog + type select");
  await page.getByRole("button", { name: /^Add fund$/ }).click();
  await page.locator("#fund-name").waitFor({ timeout: 10000 });
  await page.locator("#fund-name").fill("Summer Youth Meals Grant"); // illustrative; never submitted
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type").click();
  // Wait for the Radix listbox options to render.
  await page.getByRole("option", { name: "Temporarily Restricted" }).waitFor({ timeout: 10000 });
  await settle(300);
  await shoot("02-add-fund-dialog.png");
  await page.keyboard.press("Escape"); // close the select
  await settle(150);
  await page.keyboard.press("Escape"); // close the dialog
  await settle(300);

  // ---- 3. Ledger view ----------------------------------------------------
  log("funds list (ledger)");
  await page.getByRole("radio", { name: /^Ledger$/ }).click();
  await page.getByRole("link", { name: FUND }).first().waitFor({ timeout: 10000 });
  await settle(500);
  await shoot("03-funds-list-ledger.png");

  // ---- 4. Type filter = Temporarily Restricted ---------------------------
  log("funds list filtered to Temporarily Restricted");
  await page.locator('[aria-label="Filter fund type"]').click();
  await page.getByRole("option", { name: "Temporarily Restricted" }).click();
  await settle(500);
  await page.getByRole("link", { name: FUND }).first().waitFor({ timeout: 10000 });
  await settle(300);
  await shoot("04-funds-list-filtered.png");
  // Reset filter back to all so navigation is clean.
  await page.locator('[aria-label="Filter fund type"]').click();
  await page.getByRole("option", { name: "All fund types" }).click();
  await settle(300);

  // ---- 5. Fund detail — Allocated / Spent / Balance cards ----------------
  log(`open fund detail: ${FUND}`);
  await page.getByRole("link", { name: FUND }).first().click();
  await page.getByRole("heading", { name: "Allocated" }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "Spent" }).waitFor({ timeout: 10000 });
  await page.getByRole("heading", { name: "Balance" }).waitFor({ timeout: 10000 });
  await settle(600);
  await shoot("05-fund-detail-overview.png");

  // ---- 6. Source Allocations + Expense Ledger ----------------------------
  log("fund detail: source allocations + expense ledger");
  await page.getByRole("heading", { name: "Source Allocations" }).scrollIntoViewIfNeeded();
  await settle(500);
  await shoot("06-fund-detail-allocations.png");

  // ---- 7. Restrictions tab — balance card + alerts + term ----------------
  log("fund detail: Restrictions tab");
  await page.getByRole("tab", { name: /^Restrictions$/ }).click();
  await page.getByText("Restricted balance", { exact: true }).waitFor({ timeout: 15000 });
  await settle(700);
  // Log the actual balance numbers + any alert labels so narration can be
  // verified against what really renders.
  const grab = async (label) => {
    try {
      const dd = page.locator(`dt:has-text("${label}") + dd`).first();
      return (await dd.textContent())?.trim() ?? "(none)";
    } catch {
      return "(none)";
    }
  };
  log(
    `BALANCE  Beginning=${await grab("Beginning")}  Additions=${await grab("Additions")}  Releases=${await grab("Releases")}  Ending=${await grab("Ending")}`,
  );
  const alertItems = page.locator('section:has(h3:has-text("Restriction alerts")) li');
  const alertCount = await alertItems.count().catch(() => 0);
  for (let i = 0; i < alertCount; i++) {
    const t = (await alertItems.nth(i).textContent())?.replace(/\s+/g, " ").trim();
    log(`ALERT[${i}]: ${t}`);
  }
  if (alertCount === 0) log("ALERTS: none rendered");
  await page.getByRole("heading", { name: /Restriction lifecycle/ }).scrollIntoViewIfNeeded();
  await settle(400);
  await shoot("07-restrictions-tab.png");

  await browser.close();
  log("done");
}

main().catch((err) => {
  process.stderr.write(`[capture-p3] FAILED: ${err?.stack ?? err}\n`);
  process.exit(1);
});
