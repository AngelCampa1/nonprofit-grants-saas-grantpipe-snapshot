import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll } from "./lib/no-horizontal-scroll";
import { getTapTargetViolations } from "./lib/tap-target";

const MOBILE_SMOKE_PATHS = [
  "/",
  "/pricing/",
  "/lp/grant-management-software/",
  "/compare/grantpipe-vs-quickbooks/",
  "/resources/guides/nonprofit-audit-readiness/",
] as const;

async function gotoMarketingPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await expect(page.locator("body")).toBeVisible();
}

async function expectMinTapTarget(locator: ReturnType<Page["locator"]>, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should be visible and measurable`).not.toBeNull();
  expect(Math.round(box?.width ?? 0), `${label} width`).toBeGreaterThanOrEqual(48);
  expect(Math.round(box?.height ?? 0), `${label} height`).toBeGreaterThanOrEqual(48);
}

test.describe("marketing mobile smoke", () => {
  for (const path of MOBILE_SMOKE_PATHS) {
    test(`${path} does not produce horizontal page overflow`, async ({ page }) => {
      await gotoMarketingPage(page, path);

      await expect(hasHorizontalScroll(page)).resolves.toBe(false);
    });
  }

  for (const path of MOBILE_SMOKE_PATHS) {
    test(`${path} has no undersized visible tap targets`, async ({ page }) => {
      await gotoMarketingPage(page, path);

      await expect(getTapTargetViolations(page)).resolves.toEqual([]);
    });
  }

  test("mobile navigation opens, traps focus, and closes", async ({ page }) => {
    await gotoMarketingPage(page, "/");

    const trigger = page.locator("[data-mobile-nav-trigger]");
    const overlay = page.locator("[data-mobile-nav-overlay]");
    const panel = page.getByRole("navigation", { name: "Mobile navigation" });

    await expect(trigger).toBeVisible();
    await expectMinTapTarget(trigger, "mobile navigation trigger");
    await expect(overlay).toBeHidden();

    await trigger.click();

    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(overlay).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mobile-nav-open", "true");

    const firstLink = panel.locator("a").first();
    const lastLink = panel.locator("a").last();
    await expect(firstLink).toBeFocused();
    const links = await panel.locator("a").all();
    for (const [index, link] of links.entries()) {
      await expectMinTapTarget(link, `mobile navigation link ${index + 1}`);
    }

    await lastLink.focus();
    await page.keyboard.press("Tab");
    await expect(firstLink).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(overlay).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-mobile-nav-open", "true");
    await expect(trigger).toBeFocused();
  });

  test("sticky mobile CTA appears after the hero and is absent from legal pages", async ({
    page,
  }) => {
    await gotoMarketingPage(page, "/pricing/");

    const cta = page.locator("[data-sticky-cta]");
    await expect(cta).toBeAttached();
    await expect(cta).toBeHidden();
    await page.locator("[data-hero]").evaluate((hero) => {
      const rect = hero.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + rect.bottom + 1);
    });
    await expect(cta).toBeVisible();
    await expectMinTapTarget(cta.locator("[data-sticky-cta-link]"), "sticky mobile CTA link");

    await gotoMarketingPage(page, "/privacy/");
    await expect(page.locator("[data-sticky-cta]")).toHaveCount(0);
  });
});
