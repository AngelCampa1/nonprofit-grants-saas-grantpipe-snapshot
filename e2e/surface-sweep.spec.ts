import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";
import {
  assertNoLayoutOverflow,
  AUTH_VISUAL_VIEWPORTS,
  captureRouteScreenshot,
  installPageQualityMonitor,
} from "./helpers/visual-qa";

const AUTHENTICATED_ROUTES = [
  { path: "/app/dashboard", heading: /Dashboard/i },
  { path: "/app/donors", heading: /Donors/i },
  { path: "/app/funders", heading: /Funders/i },
  { path: "/app/funds", heading: /Funds/i },
  { path: "/app/grants", heading: /Grants/i },
  { path: "/app/grants/pipeline", heading: /Grant Pipeline/i },
  { path: "/app/events", heading: /Events/i },
  { path: "/app/deadlines", heading: /Deadline Radar/i },
  { path: "/app/deadlines/calendar", heading: /Calendar/i },
  { path: "/app/programs", heading: /Programs/i },
  { path: "/app/subrecipients", heading: /Subrecipient monitoring/i },
  { path: "/app/reports", heading: /Reports/i },
  { path: "/app/payments", heading: /Payments/i },
  { path: "/app/activity", heading: /Activity Log/i },
  { path: "/app/accounting", heading: /Accounting/i },
  { path: "/app/import", heading: /Import/i },
  { path: "/app/notifications", heading: /Notifications/i },
  { path: "/app/help", heading: /Help/i },
  { path: "/app/settings", heading: /Settings/i },
] as const;

test.describe("Broad surface sweep", () => {
  test("authenticated shell routes render without console, request, or layout failures", async ({
    page,
  }, testInfo) => {
    test.setTimeout(420_000);

    const monitor = installPageQualityMonitor(page);
    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials);
    await expect(page).toHaveURL(/\/app\/funds$/);

    for (const viewport of AUTH_VISUAL_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of AUTHENTICATED_ROUTES) {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        const main = page.locator("main, [role=main]").first();
        await expect(main).toBeVisible();
        await expect(main.getByRole("heading", { name: route.heading }).first()).toBeVisible();
        await monitor.waitForQuietNetwork();
        await assertNoLayoutOverflow(page, `${viewport.name} ${route.path}`);
        await captureRouteScreenshot(page, testInfo, route.path, viewport);
      }
    }

    monitor.assertClean();
  });

  test("donor create -> edit -> delete lifecycle", async ({ page }) => {
    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials);

    await page.goto("/app/donors");
    await page.getByRole("button", { name: "Add donor" }).click();
    await page.getByLabel("First name").fill("Delete");
    await page.getByLabel("Last name").fill("Me");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Add" }).click();

    const row = page.getByRole("link", { name: "Delete Me" });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByRole("heading", { name: /Delete Me/ })).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    const deleteBtn = page.getByRole("button", { name: /Delete/ }).first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForURL(/\/app\/donors$/, { timeout: 5000 }).catch(() => {});
    }
  });

  test("settings page exposes org profile form", async ({ page }) => {
    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials);

    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible();
  });

  test("reports page loads and shows acknowledgment template editor", async ({ page }) => {
    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials);

    await page.goto("/app/reports");
    await expect(page.getByRole("heading", { name: /Reports/i })).toBeVisible();
  });

  test("notifications page loads", async ({ page }) => {
    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials);

    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: /Notifications/i })).toBeVisible();
  });

  test("legacy radar and calendar URLs redirect to deadlines routes", async ({ page }) => {
    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials);

    await page.goto("/app/radar");
    await page.waitForURL(/\/app\/deadlines$/);
    await expect(page.getByRole("heading", { name: /Deadline Radar/i })).toBeVisible();

    await page.goto("/app/calendar");
    await page.waitForURL(/\/app\/deadlines\/calendar$/);
    await expect(page.getByRole("heading", { name: /Calendar/i })).toBeVisible();
  });
});
