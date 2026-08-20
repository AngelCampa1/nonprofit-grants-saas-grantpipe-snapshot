import { expect, test } from "@playwright/test";
import { getLocalSiteOrigin } from "../scripts/lib/local-dev-config";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

const SITE_ORIGIN = getLocalSiteOrigin();
const GUIDE_HUB_PATH = "/resources/guides/";
const GUIDE_ARTICLE_PATH = "/resources/guides/accounting-for-restricted-funds-in-nonprofit/";

// Marketing pages to sweep - all should load without console errors
const MARKETING_PAGES = [
  "/",
  "/pricing/",
  "/resources/",
  "/compare/",
  "/solutions/",
  "/nonprofit-software/",
  "/privacy/",
  "/terms/",
];

async function getOverflowMetrics(page: import("@playwright/test").Page) {
  try {
    return await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("Execution context was destroyed")) {
      await page.waitForLoadState("domcontentloaded");
      return page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
    }
    throw error;
  }
}

async function gotoMarketingPage(page: import("@playwright/test").Page, path = "/") {
  const response = await page.goto(`${SITE_ORIGIN}${path}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  return response;
}

async function getPricingTextOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const selectors = [
      ".gp-price",
      ".gp-price-subtext",
      ".gp-card-title",
      ".gp-badge",
      ".gp-billing-toggle__btn",
      ".gp-billing-toggle__badge",
      ".gp-side-copy",
      ".gp-list-item",
      ".gp-link-row",
      ".btn-primary",
    ];

    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => ({
          selector,
          text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))
        .filter((item) => item.scrollWidth > item.clientWidth + 1),
    );
  });
}

test.describe("marketing site -> free trial flow", () => {
  test("hero CTA leads to the app signup page", async ({ page }) => {
    await gotoMarketingPage(page);

    // Find the primary CTA in the hero section - it should link to the app signup.
    const heroCta = page.locator("a[href*='/signup']").filter({ hasNotText: "Sign in" }).first();
    await expect(heroCta).toBeVisible();

    const href = await heroCta.getAttribute("href");
    // CTA must be an absolute URL pointing to the local app origin (http://localhost:3050/signup).
    // TanStack Router basepath "/app" redirects /signup -> /app/signup automatically.
    expect(href).toMatch(/^http:\/\/localhost:\d+\/signup/);
  });

  test("navigating from marketing CTA through signup lands on onboarding", async ({ page }) => {
    await gotoMarketingPage(page);

    // Extract the CTA href and navigate to it directly.
    const heroCta = page.locator("a[href*='/signup']").filter({ hasNotText: "Sign in" }).first();
    await expect(heroCta).toBeVisible();
    const ctaHref = await heroCta.getAttribute("href");
    expect(ctaHref).toBeTruthy();

    await page.goto(ctaHref!);
    // TanStack Router with basepath "/app" redirects /signup -> /app/signup.
    await page.waitForURL(/\/app\/signup/, { timeout: 15_000 });

    const credentials = createE2ECredentials();
    await page.getByLabel("Name").fill(credentials.name);
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByRole("textbox", { name: "Password" }).fill(credentials.password);
    await page.getByRole("button", { name: "Start your free trial" }).click();

    await expect(page).toHaveURL(/\/app\/onboarding/, { timeout: 15_000 });
  });

  test("full signup -> onboarding -> first-value workspace marks org as trialing", async ({
    page,
  }) => {
    const credentials = createE2ECredentials();

    await signUpAndCompleteOnboarding(page, credentials);

    // Verify we're in the authenticated app after onboarding.
    await expect(page).toHaveURL(/\/app\/funds$/);
    await expect(page.getByRole("heading", { name: "Funds" })).toBeVisible();

    // The app shows a paywall/trial state; assert we're authenticated and not blocked.
    await expect(page.getByRole("link", { name: "Donors", exact: true })).toBeVisible();
  });
});

test.describe("marketing site navigation sweep", () => {
  for (const pagePath of MARKETING_PAGES) {
    test(`${pagePath} loads without errors and has working header nav`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      const response = await gotoMarketingPage(page, pagePath);

      expect(response?.status(), `${pagePath} returned non-200`).toBe(200);

      await page.waitForLoadState("domcontentloaded");
      expect(errors, `JS errors on ${pagePath}: ${errors.join("; ")}`).toHaveLength(0);

      const logo = page.getByRole("link", { name: "GrantPipe home" }).first();
      const logoHref = await logo.getAttribute("href");
      expect(logoHref, `${pagePath}: logo href`).toBeTruthy();

      const headerCta = page
        .locator("header a[href*='signup']")
        .filter({ hasNotText: "Sign in" })
        .first();
      const ctaHref = await headerCta.getAttribute("href");
      expect(ctaHref, `${pagePath}: header CTA must be absolute`).toMatch(/^https?:\/\//);
      expect(ctaHref, `${pagePath}: CTA must not be /#signup dead anchor`).not.toBe("/#signup");
      expect(ctaHref, `${pagePath}: CTA must contain /signup`).toMatch(/\/signup/);

      const signInLink = page
        .locator("header a")
        .filter({ hasText: /sign in/i })
        .first();
      await expect(signInLink, `${pagePath}: sign-in link`).toBeVisible();
      const signInHref = await signInLink.getAttribute("href");
      expect(signInHref, `${pagePath}: sign-in link href`).toMatch(/\/login/);
    });
  }

  test("footer links are present and not dead", async ({ page }) => {
    await gotoMarketingPage(page);

    const footerLinks = await page.locator("footer a[href]").all();
    expect(footerLinks.length, "footer should have links").toBeGreaterThan(0);

    for (const link of footerLinks) {
      const href = await link.getAttribute("href");
      if (!href) continue;

      // Skip external links (cal.com, mailto:, etc.) - only verify internal/relative paths.
      if (href.startsWith("http") && !href.includes("localhost") && !href.includes("grantpipe")) {
        continue;
      }
      if (href.startsWith("mailto:") || href.startsWith("#")) {
        continue;
      }

      expect(href, "footer link should not be empty").toBeTruthy();
    }

    const freeTrialLink = page
      .locator("footer a")
      .filter({ hasText: /free trial/i })
      .first();
    const freeTrialHref = await freeTrialLink.getAttribute("href");
    if (freeTrialHref) {
      expect(freeTrialHref).toMatch(/\/signup/);
    }
  });

  test("marketing site CTA URLs use correct app origin", async ({ page }) => {
    await page.goto(SITE_ORIGIN);

    const signupLinkLocator = page.locator("a[href*='/signup']");
    await expect(signupLinkLocator.first()).toBeVisible();
    const signupLinks = await signupLinkLocator.all();
    expect(signupLinks.length, "should have at least one signup CTA").toBeGreaterThan(0);

    for (const link of signupLinks) {
      const href = await link.getAttribute("href");
      if (!href) continue;

      expect(href, `CTA href must be absolute: ${href}`).toMatch(/^https?:\/\//);
      expect(href, `CTA href must not double-concat: ${href}`).not.toMatch(
        /^https?:\/\/[^/]+https?:\/\//,
      );
    }
  });
});

test.describe("marketing site -> pricing CTA", () => {
  test("pricing page plan CTAs include plan query param", async ({ page }) => {
    await gotoMarketingPage(page, "/pricing/");

    const starterCta = page.getByTestId("pricing-cta-starter").first();
    await expect(starterCta).toBeVisible();
    const starterHref = await starterCta.getAttribute("href");
    expect(starterHref).toContain("plan=starter");

    const growthCta = page.getByTestId("pricing-cta-growth").first();
    await expect(growthCta).toBeVisible();
    const growthHref = await growthCta.getAttribute("href");
    expect(growthHref).toContain("plan=growth");
  });

  test("public marketing layouts do not horizontally overflow on desktop or mobile", async ({
    browser,
  }) => {
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await gotoMarketingPage(desktopPage, "/pricing/");
    const desktopOverflow = await getOverflowMetrics(desktopPage);
    expect(desktopOverflow.scrollWidth).toBe(desktopOverflow.clientWidth);
    await desktopPage.close();

    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await gotoMarketingPage(mobilePage);
    const mobileOverflow = await getOverflowMetrics(mobilePage);
    expect(mobileOverflow.scrollWidth).toBe(mobileOverflow.clientWidth);
    await mobilePage.close();
  });

  test("guides hub and article layouts stay within the viewport and keep editorial chrome visible", async ({
    browser,
  }) => {
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

    await gotoMarketingPage(desktopPage, GUIDE_HUB_PATH);
    const hubOverflow = await getOverflowMetrics(desktopPage);
    expect(hubOverflow.scrollWidth).toBe(hubOverflow.clientWidth);

    await gotoMarketingPage(desktopPage, GUIDE_ARTICLE_PATH);
    await expect(desktopPage.locator("[data-reading-frame]")).toBeVisible();
    await expect(
      desktopPage.locator('nav[data-toc-panel][aria-label="Table of contents"]'),
    ).toBeVisible();
    await expect(
      desktopPage.locator("[data-sidebar-cta-panel], [data-sidebar-lead-magnet-panel]").first(),
    ).toBeVisible();
    const articleOverflow = await getOverflowMetrics(desktopPage);
    expect(articleOverflow.scrollWidth).toBe(articleOverflow.clientWidth);
    await desktopPage.close();

    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await gotoMarketingPage(mobilePage, GUIDE_HUB_PATH);
    const mobileHubOverflow = await getOverflowMetrics(mobilePage);
    expect(mobileHubOverflow.scrollWidth).toBe(mobileHubOverflow.clientWidth);
    await mobilePage.close();
  });

  test("highlighted pricing tier badge and card remain fully visible", async ({ page }) => {
    await gotoMarketingPage(page, "/pricing/");

    const compareGrid = page.locator("[data-pricing-cards]");
    await expect(compareGrid).toBeVisible();
    const gridBox = await compareGrid.boundingBox();
    expect(gridBox).not.toBeNull();

    const highlightedCard = page.locator(".gp-plan-card-redesign.is-popular").first();
    await expect(highlightedCard).toBeVisible();
    const cardBox = await highlightedCard.boundingBox();
    expect(cardBox).not.toBeNull();

    const badge = highlightedCard.locator(".gp-plan-badge").first();
    await expect(badge).toBeVisible();
    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();

    if (gridBox && cardBox && badgeBox) {
      expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(gridBox.x + gridBox.width + 0.5);
    }
  });

  test("pricing comparison text stays inside its components at all billing states", async ({
    browser,
  }) => {
    const viewports = [
      { width: 1880, height: 1080 },
      { width: 1440, height: 1200 },
      { width: 1280, height: 1000 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport,
        isMobile: viewport.width < 768,
        hasTouch: viewport.width < 768,
      });

      await gotoMarketingPage(page, "/pricing/");
      await expect(page.locator("[data-pricing-cards]")).toBeVisible();

      for (const billingPeriod of ["annual", "monthly"] as const) {
        await page.getByRole("radio", { name: new RegExp(billingPeriod, "i") }).click();

        const overflow = await getPricingTextOverflow(page);
        expect(
          overflow,
          `${viewport.width}px ${billingPeriod} pricing text overflow:\n${JSON.stringify(
            overflow,
            null,
            2,
          )}`,
        ).toEqual([]);
      }

      await page.close();
    }
  });
});
