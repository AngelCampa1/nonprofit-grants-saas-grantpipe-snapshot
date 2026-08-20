/**
 * Captures the authenticated app surfaces into `docs/screenshots/` so the
 * README and the visual archive are reproducible rather than hand-collected.
 *
 * Expects a local stack: web on GRANTPIPE_WEB_PORT (default 3050) and the
 * demo org seeded by `packages/db/src/seed-demo.ts`.
 *
 *   pnpm screenshots                       # every route in APP_ROUTE_TARGETS
 *   TARGETS='[{"path":"/app/funds","name":"funds"}]' pnpm screenshots
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Target = {
  path: string;
  name: string;
  /** Milliseconds to settle after load, for charts and async panels. */
  wait?: number;
  full?: boolean;
};

export type ResolvedTarget = Required<Target>;

export type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type Viewport = { width: number; height: number };

export const DEFAULT_WAIT_MS = 2500;

/**
 * Loading placeholders. A fixed settle delay is not enough on its own — a slow
 * route screenshots as a page of grey bars and still counts as a success, which
 * is exactly what happened to /app/import on the first sweep.
 */
export const SKELETON_SELECTOR = '.animate-pulse, [data-slot="skeleton"]';
export const SKELETON_TIMEOUT_MS = 15_000;
export const VIEWPORT: Viewport = { width: 1440, height: 900 };
export const DEVICE_SCALE_FACTOR = 2;
export const OUTPUT_DIR = "docs/screenshots";

/**
 * Every authenticated surface worth archiving. Detail routes are omitted: they
 * need a seeded record id, and the index pages already show the data shape.
 */
export const APP_ROUTE_TARGETS: readonly Target[] = [
  { path: "/app/dashboard", name: "dashboard", wait: 4000 },
  { path: "/app/activity", name: "activity" },
  { path: "/app/calendar", name: "calendar" },
  { path: "/app/radar", name: "radar" },
  { path: "/app/notifications", name: "notifications" },
  { path: "/app/deadlines", name: "deadlines" },
  { path: "/app/deadlines/calendar", name: "deadlines-calendar" },

  { path: "/app/donors", name: "donors" },
  { path: "/app/donors/at-risk", name: "donors-at-risk" },
  { path: "/app/donors/pledges", name: "donors-pledges" },
  { path: "/app/donors/email", name: "donors-email" },
  { path: "/app/events", name: "events" },
  { path: "/app/funders", name: "funders" },

  { path: "/app/grants", name: "grants", wait: 3500 },
  { path: "/app/grants/pipeline", name: "grants-pipeline" },
  { path: "/app/grants/sentinel", name: "budget-sentinel", wait: 3500 },
  { path: "/app/funds", name: "funds", wait: 3500 },
  { path: "/app/programs", name: "programs" },
  { path: "/app/payments", name: "payments" },
  { path: "/app/subrecipients", name: "subrecipients" },
  { path: "/app/evidence-bundles", name: "evidence-bundles" },

  { path: "/app/accounting", name: "accounting" },
  { path: "/app/accounting/journal", name: "journal", wait: 3500 },
  { path: "/app/accounting/ledger", name: "ledger", wait: 3500 },
  { path: "/app/accounting/chart-of-accounts", name: "chart-of-accounts" },
  { path: "/app/accounting/trial-balance", name: "trial-balance", wait: 3500 },
  { path: "/app/accounting/periods", name: "accounting-periods" },
  { path: "/app/accounting/recurring", name: "accounting-recurring" },
  { path: "/app/accounting/anomalies", name: "anomaly-detector", wait: 3500 },

  { path: "/app/reports", name: "reports" },
  { path: "/app/reports/builder", name: "reports-builder" },
  { path: "/app/reports/ask-ledger", name: "reports-ask-ledger" },
  { path: "/app/reports/drafts", name: "reports-drafts" },

  { path: "/app/import", name: "import" },
  { path: "/app/help", name: "help" },
  { path: "/app/settings", name: "settings" },
  { path: "/app/settings/team", name: "settings-team" },
  { path: "/app/settings/entities", name: "settings-entities" },
  { path: "/app/settings/portal-access", name: "settings-portal-access" },
  { path: "/app/settings/billing", name: "settings-billing" },
];

export function withDefaults(target: Target): ResolvedTarget {
  return {
    path: target.path,
    name: target.name,
    wait: target.wait ?? DEFAULT_WAIT_MS,
    full: target.full ?? false,
  };
}

export function parseTargets(raw: string | undefined): ResolvedTarget[] {
  if (raw === undefined || raw.trim() === "") {
    return APP_ROUTE_TARGETS.map(withDefaults);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TARGETS is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("TARGETS must be a JSON array of targets");
  }

  return parsed.map((entry, index) => {
    const candidate = entry as Partial<Target> | null;
    if (typeof candidate?.path !== "string") {
      throw new Error(`TARGETS[${index}] is missing a string path`);
    }
    if (typeof candidate.name !== "string") {
      throw new Error(`TARGETS[${index}] is missing a string name`);
    }
    return withDefaults(candidate as Target);
  });
}

export function screenshotFileName(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`Screenshot name must be lowercase kebab-case: ${name}`);
  }
  return `${name}.png`;
}

/**
 * The AI support launcher is a third-party fixed overlay pinned to a bottom
 * corner. It has no disable flag and its class names are not stable across
 * bundle builds, so it is identified geometrically: bottom-anchored, pushed to
 * one side, and small relative to the viewport. A full-width sticky footer or a
 * centred toast fails the corner test and is left alone.
 */
export function isOverlayRect(rect: Rect, viewport: Viewport): boolean {
  if (rect.width === 0 || rect.height === 0) return false;

  const bottomAnchored = rect.bottom > viewport.height - 120;
  const cornerAnchored = rect.left > viewport.width * 0.55 || rect.right < viewport.width * 0.45;
  const small = rect.width < viewport.width * 0.6 && rect.height < viewport.height * 0.6;

  return bottomAnchored && cornerAnchored && small;
}

/**
 * The archive index describes every canonical screenshot present on disk, not
 * just the ones this run produced. Otherwise re-capturing a single route to fix
 * it would rewrite the index down to that one entry.
 */
export function indexTargets(fileExists: (fileName: string) => boolean): ResolvedTarget[] {
  return APP_ROUTE_TARGETS.map(withDefaults).filter((target) =>
    fileExists(screenshotFileName(target.name)),
  );
}

export function buildIndexMarkdown(captured: readonly ResolvedTarget[]): string {
  const header = [
    "# Screenshot archive",
    "",
    `Captured by [\`scripts/capture-screenshots.ts\`](../../scripts/capture-screenshots.ts) at ` +
      `${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x against a local stack ` +
      "seeded with `packages/db/src/seed-demo.ts`.",
    "",
    "Every figure below is the real application rendering seeded demo data. The third-party " +
      "support launcher is hidden at capture time so it does not cover page content.",
    "",
  ];

  if (captured.length === 0) {
    return [...header, "No screenshots captured.", ""].join("\n");
  }

  const rows = captured.flatMap((target) => [
    `### \`${target.path}\``,
    "",
    `![${target.name}](${screenshotFileName(target.name)})`,
    "",
  ]);

  return [...header, ...rows].join("\n");
}

export function isEntrypoint(argv: readonly string[], moduleUrl: string): boolean {
  const entry = argv[1];
  if (!entry) return false;
  return entry === fileURLToPath(moduleUrl);
}

async function main(): Promise<void> {
  const { chromium } = await import("@playwright/test");

  const port = process.env.GRANTPIPE_WEB_PORT ?? "3050";
  const base = process.env.SCREENSHOT_BASE_URL ?? `http://localhost:${port}`;
  const email = process.env.SCREENSHOT_EMAIL ?? "demo@grantpipe.com";
  const password = process.env.SCREENSHOT_PASSWORD ?? "Demo2026!";
  const outputDir = resolve(process.argv[2] ?? OUTPUT_DIR);
  const targets = parseTargets(process.env.TARGETS);

  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.goto(`${base}/app/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app\/(?!login)/, { timeout: 60_000 });
  console.log(`signed in as ${email} at ${base}`);

  const hideOverlays = async (): Promise<void> => {
    await page.evaluate(
      ({ predicateSource, viewport }) => {
        const matches = new Function(`return (${predicateSource})`)() as (
          rect: Rect,
          viewport: Viewport,
        ) => boolean;

        for (const element of Array.from(document.body.querySelectorAll("*"))) {
          if (getComputedStyle(element).position !== "fixed") continue;
          if (matches(element.getBoundingClientRect(), viewport)) {
            element.setAttribute("style", "display:none !important");
          }
        }
      },
      { predicateSource: isOverlayRect.toString(), viewport: VIEWPORT },
    );
  };

  const captured: ResolvedTarget[] = [];
  const failed: string[] = [];
  const stillLoading: string[] = [];

  for (const target of targets) {
    const fileName = screenshotFileName(target.name);
    try {
      await page.goto(`${base}${target.path}`, { waitUntil: "domcontentloaded" });
      // The support widget holds connections open, so networkidle never
      // settles on some routes. Treat the timeout as normal, not as a failure.
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      const settled = await page
        .waitForFunction(
          (selector) => document.querySelectorAll(selector).length === 0,
          SKELETON_SELECTOR,
          { timeout: SKELETON_TIMEOUT_MS },
        )
        .then(() => true)
        .catch(() => false);
      if (!settled) stillLoading.push(target.name);

      await page.waitForTimeout(target.wait);
      await hideOverlays();
      await page.waitForTimeout(200);
      await page.screenshot({ path: resolve(outputDir, fileName), fullPage: target.full });
      captured.push(target);
      console.log(`  ${settled ? "ok   " : "LOAD?"} ${fileName}  <- ${target.path}`);
    } catch (error) {
      failed.push(target.name);
      console.log(`  FAIL  ${fileName}  <- ${target.path}: ${String(error).slice(0, 160)}`);
    }
  }

  await browser.close();

  writeFileSync(
    resolve(outputDir, "README.md"),
    buildIndexMarkdown(indexTargets((fileName) => existsSync(resolve(outputDir, fileName)))),
    "utf8",
  );
  console.log(`\n${captured.length} captured, ${failed.length} failed -> ${outputDir}`);
  if (stillLoading.length > 0) {
    // Captured, but the page was still showing placeholders. Treat as a
    // failure: a screenshot of a skeleton is worse than no screenshot.
    console.log(`still loading at capture time: ${stillLoading.join(", ")}`);
    process.exitCode = 1;
  }
  if (failed.length > 0) {
    console.log(`failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

if (isEntrypoint(process.argv, import.meta.url)) {
  await main();
}
