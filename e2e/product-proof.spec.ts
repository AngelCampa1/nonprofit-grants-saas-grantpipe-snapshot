import { expect, test } from "@playwright/test";

import { getMarketedCapabilities } from "../apps/site/src/lib/marketed-capabilities";
import { getLocalSiteOrigin } from "../scripts/lib/local-dev-config";

const SITE_ORIGIN = getLocalSiteOrigin();
const PRODUCT_PATH = "/product/";
const marketedCapabilities = getMarketedCapabilities();

async function getOverflowMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

async function getContrastRatio(locator: import("@playwright/test").Locator) {
  return locator.evaluate((node) => {
    function parseColor(value: string) {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const [r, g, b, alpha = "1"] = match[1].split(",").map((part) => part.trim());
      return {
        r: Number.parseFloat(r),
        g: Number.parseFloat(g),
        b: Number.parseFloat(b),
        a: Number.parseFloat(alpha),
      };
    }

    function relativeLuminance(channel: number) {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }

    function luminance(color: { r: number; g: number; b: number }) {
      return (
        0.2126 * relativeLuminance(color.r) +
        0.7152 * relativeLuminance(color.g) +
        0.0722 * relativeLuminance(color.b)
      );
    }

    function compositeForeground(
      foreground: { r: number; g: number; b: number; a: number },
      background: { r: number; g: number; b: number },
    ) {
      return {
        r: foreground.r * foreground.a + background.r * (1 - foreground.a),
        g: foreground.g * foreground.a + background.g * (1 - foreground.a),
        b: foreground.b * foreground.a + background.b * (1 - foreground.a),
      };
    }

    function resolveBackgroundColor(element: Element | null): { r: number; g: number; b: number } {
      if (!element) {
        return { r: 255, g: 255, b: 255 };
      }

      const style = window.getComputedStyle(element);
      const parsed = parseColor(style.backgroundColor);

      if (parsed && parsed.a > 0) {
        if (parsed.a >= 0.999) {
          return { r: parsed.r, g: parsed.g, b: parsed.b };
        }

        const parentBackground = resolveBackgroundColor(element.parentElement);
        return compositeForeground(parsed, parentBackground);
      }

      return resolveBackgroundColor(element.parentElement);
    }

    const style = window.getComputedStyle(node);
    const textColor = parseColor(style.color);
    if (!textColor) return 0;

    const background = resolveBackgroundColor(node.parentElement);
    const foreground = compositeForeground(textColor, background);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));

    return (lighter + 0.05) / (darker + 0.05);
  });
}

test.describe("/product proof page", () => {
  test("keeps product proof navigation and CTAs usable on mobile", async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme: "light",
    });

    await page.goto(`${SITE_ORIGIN}${PRODUCT_PATH}`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /funded, restricted, due, and ready for review/i,
      }),
    ).toBeVisible();
    const pageNav = page.getByRole("navigation", {
      name: "How GrantPipe works sections",
    });
    await expect(pageNav).toBeVisible();

    const firstChip = pageNav.getByRole("link", { name: "Evidence and records" });
    await expect(firstChip).toBeVisible();
    const chipBox = await firstChip.boundingBox();
    expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await firstChip.click();
    await expect(page).toHaveURL(/#fundraising$/);
    await expect(page.locator("#fundraising")).toBeVisible();

    await expect(page.locator("[data-cta-placement='product-primary']").first()).toBeVisible();
    await expect(page.locator("[data-cta-placement='product-secondary']").first()).toBeVisible();
    await expect(page.getByRole("table", { name: "Accounting report output" })).toBeVisible();

    const renderedSupportText = marketedCapabilities.find(
      (entry) => entry.slug === "fundraising",
    )?.supportText;
    await expect(page.getByText(renderedSupportText ?? "")).toBeVisible();

    const heroHeading = page.getByRole("heading", { level: 1 });
    const [headingHeight, headingLineHeight] = await Promise.all([
      heroHeading.evaluate((node) => node.getBoundingClientRect().height),
      heroHeading.evaluate((node) => Number.parseFloat(window.getComputedStyle(node).lineHeight)),
    ]);
    expect(headingHeight).toBeGreaterThan(headingLineHeight * 1.5);

    const sideLabelContrast = await getContrastRatio(page.locator(".gp-side-label").first());
    expect(sideLabelContrast).toBeGreaterThanOrEqual(4.5);

    const overflow = await getOverflowMetrics(page);
    expect(overflow.scrollWidth).toBe(overflow.clientWidth);

    await page.close();
  });

  test("renders product proof cleanly without exposing deleted meta copy", async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    });

    await page.goto(`${SITE_ORIGIN}${PRODUCT_PATH}`);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("What this page is for")).toHaveCount(0);
    await expect(page.getByText("Primary buying motion")).toHaveCount(0);
    await expect(page.locator("#compliance")).toBeVisible();
    await expect(page.locator("#accounting")).toBeVisible();
    await expect(page.locator("#migration")).toBeVisible();

    await page.close();
  });
});
