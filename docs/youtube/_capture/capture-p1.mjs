// P1 real-app capture harness.
//
// Why this exists: the Playwright MCP screenshot path hangs forever on
// "waiting for fonts to load" against this app, and the MCP run_code sandbox
// has no fs/Buffer to write bytes. This standalone Node script sidesteps both:
// it drives the real signed-in app with the repo's Playwright, captures via the
// CDP Page.captureScreenshot command (which does not run Playwright's font /
// stability wait), and writes PNGs with native Node fs.
//
// Usage (app must be running on PORT, default 3050):
//   node docs/youtube/_capture/capture-p1.mjs
//
// Credentials default to the committed demo seed account; override with
// GRANTPIPE_E2E_EMAIL / GRANTPIPE_E2E_PASSWORD env vars if needed. The password
// is never printed by this script.

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
const OUT = path.join(REPO, "docs/youtube/_capture/p1");
const FIXTURE = path.join(REPO, "docs/youtube/_capture/fixtures/donor-contacts.csv");

// Demo org's real values, so submitting org-setup is an idempotent no-op
// (seed-demo.ts: Heartland Senior Services, fiscal start July, America/New_York).
const ORG_NAME = "Heartland Senior Services";
const FISCAL_MONTH = "July";
// (Timezone is left at the org's existing value — America/New_York — so it is
// not re-filled here; see the org-setup note above.)

fs.mkdirSync(OUT, { recursive: true });

const log = (m) => process.stdout.write(`[capture-p1] ${m}\n`);

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
    const file = path.join(OUT, name);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
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

  // ---- 1. Onboarding: Welcome -------------------------------------------
  log("onboarding welcome");
  await page.goto(`${APP}/onboarding`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Welcome to GrantPipe/ }).waitFor({ timeout: 15000 });
  await settle();
  await shoot("01-onboarding-welcome.png");

  // ---- 2. Onboarding: Org setup (filled, pre-submit) --------------------
  log("onboarding org setup");
  await page.getByRole("button", { name: /Get started/ }).click();
  await page.locator("#orgName").waitFor({ timeout: 10000 });
  await page.locator("#orgName").fill(ORG_NAME);
  // Fiscal year start month (Radix select)
  await page.locator('[aria-label="Fiscal year start month"]').click();
  await page.getByRole("option", { name: FISCAL_MONTH, exact: true }).click();
  await settle(250);
  await shoot("02-onboarding-org-setup.png");

  // ---- 3. Onboarding: Import prompt -------------------------------------
  // Submitting re-saves the same org values -> idempotent no-op.
  log("onboarding import step");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Do you have a spreadsheet/i).waitFor({ timeout: 15000 });
  await settle();
  await shoot("03-onboarding-import.png");

  // ---- 4. Import: Choose source -----------------------------------------
  log("import choose source");
  await page.goto(`${APP}/import`, { waitUntil: "domcontentloaded" });
  await page.locator("#import-entity-type").waitFor({ timeout: 15000 });
  await page.getByText("Choose source").first().waitFor({ timeout: 10000 });
  await settle();
  await shoot("04-import-choose-source.png");

  // ---- 5. Import: Upload (file selected) --------------------------------
  log("import upload");
  await page.locator("#import-csv-file").setInputFiles(FIXTURE);
  await page.getByText(/donor-contacts\.csv/).waitFor({ timeout: 10000 });
  await settle();
  await shoot("05-import-upload-selected.png");

  // ---- 6. Import: Preview (nothing saved) -------------------------------
  log("import preview");
  await page.getByRole("button", { name: /Preview import/ }).click();
  await page.getByText(/rows detected/).waitFor({ timeout: 15000 });
  await settle();
  await shoot("06-import-preview.png");

  // ---- 7. Import: Commit result -----------------------------------------
  log("import commit");
  await page.getByRole("button", { name: /Commit import/ }).click();
  const finished = page.getByText(/Import finished:/);
  await finished.waitFor({ timeout: 20000 });
  const resultText = (await finished.textContent())?.replace(/\s+/g, " ").trim();
  log(`RESULT: ${resultText}`);
  await settle();
  await shoot("07-import-commit-result.png");

  // ---- 8. Import history -------------------------------------------------
  log("import history");
  const historyEntry = page.locator('[data-testid="import-history-entry"]').first();
  await historyEntry.waitFor({ timeout: 15000 });
  await historyEntry.scrollIntoViewIfNeeded();
  await settle();
  await shoot("08-import-history.png");

  // ---- 9. Donors list (populated) ---------------------------------------
  log("donors list");
  await page.goto(`${APP}/donors`, { waitUntil: "domcontentloaded" });
  await settle(900);
  await shoot("09-donors-list.png");

  await browser.close();
  log("done");
}

main().catch((err) => {
  process.stderr.write(`[capture-p1] FAILED: ${err?.stack ?? err}\n`);
  process.exit(1);
});
