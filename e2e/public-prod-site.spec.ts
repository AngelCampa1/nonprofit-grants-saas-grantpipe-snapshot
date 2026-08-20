import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PUBLIC_ROUTES = [
  {
    path: "/",
    h1: "Keep awards, restrictions, deadlines, and evidence ready for review.",
  },
  {
    path: "/pricing/",
    h1: "Compliance-first grant management system pricing.",
  },
  {
    path: "/lp/grant-management-software/",
    h1: "Built for the SF-425, the drawdown, and the audit binder.",
  },
  {
    path: "/compare/grantpipe-vs-quickbooks/",
    h1: "GrantPipe Books vs. QuickBooks Online for nonprofits.",
  },
  {
    path: "/resources/guides/accounting-for-restricted-funds-in-nonprofit/",
    h1: "Accounting for Restricted Funds in a Nonprofit: The Complete Framework",
  },
] as const;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1100, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
] as const;

function metadataUrl(testInfo: TestInfo, key: "appUrl" | "siteUrl", fallback: string) {
  const value = testInfo.config.metadata?.[key];
  return typeof value === "string" ? value.replace(/\/+$/, "") : fallback;
}

function requireProductionWrapper(siteUrl: string) {
  const hostname = new URL(siteUrl).hostname;
  test.skip(
    hostname === "grantpipe.com" && process.env.GRANTPIPE_LIVE_E2E_WRAPPER !== "1",
    "Run public production E2E through pnpm e2e:prod:public so cleanup and live-test guards are active.",
  );
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

test.describe("public production GrantPipe site", () => {
  test("key public pages load without document overflow on desktop and mobile", async ({
    browser,
  }, testInfo) => {
    const siteUrl = metadataUrl(testInfo, "siteUrl", "https://grantpipe.com");
    requireProductionWrapper(siteUrl);

    for (const route of PUBLIC_ROUTES) {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile,
          hasTouch: viewport.isMobile,
        });
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));

        const response = await page.goto(`${siteUrl}${route.path}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

        expect(response?.status(), `${viewport.name} ${route.path} status`).toBe(200);
        await expect(page.locator("h1").first(), `${viewport.name} ${route.path} h1`).toHaveText(
          route.h1,
        );
        expect(pageErrors, `${viewport.name} ${route.path} page errors`).toEqual([]);

        const overflow = await pageOverflow(page);
        expect(
          overflow.scrollWidth,
          `${viewport.name} ${route.path} horizontal overflow: ${JSON.stringify(overflow)}`,
        ).toBe(overflow.clientWidth);

        await page.close();
      }
    }
  });

  test("pricing CTAs preserve production signup plan and billing context", async ({
    page,
  }, testInfo) => {
    const siteUrl = metadataUrl(testInfo, "siteUrl", "https://grantpipe.com");
    const appUrl = metadataUrl(testInfo, "appUrl", "https://app.grantpipe.com");
    requireProductionWrapper(siteUrl);

    await page.goto(`${siteUrl}/pricing/`, { waitUntil: "domcontentloaded" });

    for (const plan of ["starter", "growth"] as const) {
      const cta = page.getByTestId(`pricing-cta-${plan}`).first();
      await expect(cta).toBeVisible();

      const href = await cta.getAttribute("href");
      expect(href, `${plan} CTA href`).toBeTruthy();
      const target = new URL(href!);
      expect(target.origin).toBe(appUrl);
      expect(target.pathname).toBe("/signup");
      expect(target.searchParams.get("plan")).toBe(plan);
      expect(["annual", "monthly"]).toContain(target.searchParams.get("cycle"));
    }
  });

  test("public API and lead-magnet endpoints remain reachable without auth", async ({
    request,
  }, testInfo) => {
    const appUrl = metadataUrl(testInfo, "appUrl", "https://app.grantpipe.com");
    const siteUrl = metadataUrl(testInfo, "siteUrl", "https://grantpipe.com");
    requireProductionWrapper(siteUrl);

    const health = await request.get(`${appUrl}/api/health`);
    expect(health.status()).toBe(200);

    const launchPromo = await request.get(`${appUrl}/api/public/marketing/launch-promo`);
    expect(launchPromo.status()).toBe(200);

    const leadMagnet = await request.get(
      `${appUrl}/api/public/downloads/file/nonprofit-crm-cost-calculator`,
      { maxRedirects: 0 },
    );
    expect(leadMagnet.status()).toBe(200);
    expect(leadMagnet.url()).not.toContain("/login");
    expect(leadMagnet.headers()["content-type"]).toContain("application/pdf");
    expect(leadMagnet.headers()["content-disposition"]).toContain("nonprofit-crm-cost-calculator");
  });
});
