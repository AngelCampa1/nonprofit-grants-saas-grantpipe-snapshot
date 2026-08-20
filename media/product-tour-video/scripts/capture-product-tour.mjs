/* global process, console, localStorage, URL, window, document, setTimeout */
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const videoDir = resolve(projectRoot, "assets/video");
const tempDir = resolve(tmpdir(), "grantpipe-product-tour-capture");

const appUrl = process.env.GRANTPIPE_CAPTURE_APP_URL ?? "http://localhost:3050";
const email = process.env.GRANTPIPE_CAPTURE_EMAIL;
const password = process.env.GRANTPIPE_CAPTURE_PASSWORD;
const sceneFilter = new Set(
  (process.env.GRANTPIPE_CAPTURE_SCENES ?? "")
    .split(",")
    .map((scene) => scene.trim())
    .filter(Boolean),
);

const viewport = { width: 1920, height: 1080 };

const scenes = [
  {
    id: "01-dashboard",
    path: "/app/dashboard",
    durationMs: 24000,
    actions: async (page) => {
      await settle(page);
      await move(page, 1320, 230);
      await page.mouse.wheel(0, 420);
      await wait(1400);
      await move(page, 630, 520);
      await page.mouse.wheel(0, -320);
      await wait(1400);
    },
  },
  {
    id: "02-grant-portfolio",
    path: "/app/grants",
    durationMs: 52000,
    actions: async (page) => {
      await settle(page);
      await move(page, 960, 360);
      await page.mouse.wheel(0, 360);
      await wait(1400);
      await clickIfVisible(page.getByRole("tab", { name: /pipeline/i }).first());
      await wait(1800);
      await clickIfVisible(page.getByRole("tab", { name: /portfolio/i }).first());
      await wait(1600);
      await openRecordByName(page, /Title III-C Nutrition Services Grant/i);
      await wait(2500);
      await clickIfVisible(page.getByRole("tab", { name: /reporting/i }).first());
      await wait(2200);
      await clickIfVisible(page.getByRole("tab", { name: /spend-down/i }).first());
      await wait(2200);
      await clickIfVisible(page.getByRole("tab", { name: /activity/i }).first());
      await wait(2200);
      await page.mouse.wheel(0, 520);
      await wait(1600);
    },
  },
  {
    id: "03-funds-restrictions",
    path: "/app/funds",
    durationMs: 44000,
    actions: async (page) => {
      await settle(page);
      await move(page, 1090, 350);
      await openRecordByName(page, /Title III-C Nutrition Fund/i);
      await wait(2200);
      await clickIfVisible(page.getByRole("tab", { name: /restrictions/i }).first());
      await wait(2400);
      await page.mouse.wheel(0, 520);
      await wait(1600);
      await page.mouse.wheel(0, -260);
      await wait(1400);
    },
  },
  {
    id: "05-reports-compliance",
    path: "/app/reports",
    durationMs: 36000,
    actions: async (page) => {
      await settle(page);
      await move(page, 880, 430);
      await page.mouse.wheel(0, 560);
      await wait(1800);
      await page.goto(`${appUrl}/app/calendar`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await wait(2400);
      await page.mouse.wheel(0, 420);
      await wait(1800);
      await page.goto(`${appUrl}/app/reports`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await wait(2200);
    },
  },
  {
    id: "06-evidence-bundles",
    path: "/app/evidence-bundles",
    durationMs: 26000,
    actions: async (page) => {
      await settle(page);
      await move(page, 960, 360);
      await wait(1200);
      await openFirstRecord(page);
      await wait(2200);
      await page.mouse.wheel(0, 520);
      await wait(2400);
      await page.mouse.wheel(0, -320);
      await wait(1400);
    },
  },
  {
    id: "07-team-activity",
    path: "/app/activity",
    durationMs: 32000,
    actions: async (page) => {
      await settle(page);
      await move(page, 980, 360);
      await page.mouse.wheel(0, 520);
      await wait(1800);
      await page.goto(`${appUrl}/app/settings/team`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await wait(2400);
      await page.mouse.wheel(0, 520);
      await wait(1800);
    },
  },
];

async function main() {
  assertSafeCaptureConfig();
  await mkdir(videoDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const storageState = await login(browser);

  const selectedScenes = sceneFilter.size > 0 ? scenes.filter((scene) => sceneFilter.has(scene.id)) : scenes;
  for (const scene of selectedScenes) {
    console.log(`Recording ${scene.id}...`);
    const context = await browser.newContext({
      viewport,
      storageState,
      recordVideo: {
        dir: tempDir,
        size: viewport,
      },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await installCursor(page);
    await page.goto(`${appUrl}${scene.path}`, { waitUntil: "domcontentloaded" });
    await settle(page);

    const started = Date.now();
    await scene.actions(page);
    const remaining = scene.durationMs - (Date.now() - started);
    if (remaining > 0) await wait(remaining);

    const video = page.video();
    await page.close();
    await context.close();

    const rawPath = await video.path();
    const finalPath = resolve(videoDir, `${scene.id}.webm`);
    await rm(finalPath, { force: true });
    await rename(rawPath, finalPath);
    const info = await stat(finalPath);
    if (info.size < 50_000) {
      throw new Error(`${scene.id} video is unexpectedly small (${info.size} bytes)`);
    }
  }

  await browser.close();
  console.log(`Captured ${selectedScenes.length} clips in ${videoDir}`);
}

async function login(browser) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("gp-ob-v1", "dismissed");
  });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
  const storageState = await context.storageState();
  await context.close();
  return storageState;
}

function assertSafeCaptureConfig() {
  const parsed = new URL(appUrl);
  const safeHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!safeHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to capture ${appUrl}. Product-tour footage must use a local seeded demo app.`,
    );
  }
  if (!email || !password) {
    throw new Error(
      "Set GRANTPIPE_CAPTURE_EMAIL and GRANTPIPE_CAPTURE_PASSWORD in the environment before capture.",
    );
  }
}

async function openRecordByName(page, name) {
  const link = page.getByRole("link", { name }).first();
  if (await link.isVisible().catch(() => false)) {
    await link.scrollIntoViewIfNeeded().catch(() => {});
    const box = await link.boundingBox().catch(() => null);
    if (box) await move(page, box.x + Math.min(box.width / 2, 360), box.y + box.height / 2);
    await link.click();
    await settle(page);
    return;
  }
  await openFirstRecord(page);
}

async function clickIfVisible(locator) {
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  const page = locator.page();
  if (box) await move(page, box.x + box.width / 2, box.y + box.height / 2);
  await locator.click();
  await settle(page);
  return true;
}

async function installCursor(page) {
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const cursor = document.createElement("div");
      cursor.id = "gp-recording-cursor";
      cursor.style.cssText = [
        "position: fixed",
        "left: 0",
        "top: 0",
        "z-index: 2147483647",
        "width: 10px",
        "height: 10px",
        "border: 0",
        "border-radius: 999px",
        "background: rgba(6,95,70,0.58)",
        "box-shadow: 0 4px 12px rgba(6,95,70,0.16)",
        "opacity: 0",
        "pointer-events: none",
        "transform: translate(-50%, -50%)",
        "transition: width 120ms ease, height 120ms ease, opacity 140ms ease",
      ].join(";");
      document.body.append(cursor);
      let idleTimer = 0;
      window.addEventListener("mousemove", (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
        cursor.style.opacity = "1";
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          cursor.style.opacity = "0";
        }, 850);
      });
      window.addEventListener("mousedown", () => {
        cursor.style.width = "16px";
        cursor.style.height = "16px";
        cursor.style.opacity = "1";
      });
      window.addEventListener("mouseup", () => {
        cursor.style.width = "10px";
        cursor.style.height = "10px";
      });
    });
  });
}

async function openFirstRecord(page) {
  const links = page.locator("main a[href*='/app/'], main a[href^='/']");
  const count = await links.count();
  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const href = await link.getAttribute("href").catch(() => null);
    const text = (await link.textContent().catch(() => ""))?.trim() ?? "";
    if (!href || text.length < 2) continue;
    if (href.includes("settings") || href.includes("logout") || href.includes("dashboard")) continue;
    const box = await link.boundingBox().catch(() => null);
    if (!box || box.width < 20 || box.height < 12) continue;
    await move(page, box.x + Math.min(box.width / 2, 360), box.y + box.height / 2);
    await link.click();
    await settle(page);
    return;
  }
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.locator("main, [role=main]").first().waitFor({ state: "visible", timeout: 8000 });
  await wait(900);
}

async function move(page, x, y) {
  await page.mouse.move(x, y, { steps: 24 });
  await wait(260);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
