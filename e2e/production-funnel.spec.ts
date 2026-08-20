import { expect, test } from "@playwright/test";
import { assertLiveE2ERunProof } from "../scripts/lib/live-e2e-proof";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

function requireProductionWrapper() {
  assertLiveE2ERunProof(process.env);
}

function productionSiteUrl(testInfo: { config: { metadata?: Record<string, unknown> } }) {
  const siteUrl = testInfo.config.metadata?.siteUrl;
  return typeof siteUrl === "string" ? siteUrl : "https://grantpipe.com";
}

async function signInReusableAccount(page: import("@playwright/test").Page) {
  const email = process.env.GRANTPIPE_E2E_EMAIL;
  const password = process.env.GRANTPIPE_E2E_PASSWORD;
  test.skip(!email || !password, "GRANTPIPE_E2E_EMAIL and GRANTPIPE_E2E_PASSWORD are required.");

  await page.goto("/app/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app\/(dashboard|onboarding|settings|select-plan)/, {
    timeout: 30_000,
  });
}

test.describe("production marketing and sales funnel", () => {
  test("public pricing CTA points at production signup with plan context", async ({
    page,
  }, testInfo) => {
    requireProductionWrapper();

    await page.goto(`${productionSiteUrl(testInfo)}/pricing`);

    const growthCta = page.locator("a[href*='plan=growth']").first();
    await expect(growthCta).toBeVisible();

    const href = await growthCta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/^https:\/\/app\.grantpipe\.com\/signup/);
    expect(href).toContain("plan=growth");
    expect(href).toMatch(/cycle=(annual|monthly)/);
  });

  test("reusable account can reach billing with direct plan intent preserved", async ({ page }) => {
    requireProductionWrapper();
    await signInReusableAccount(page);

    await page.goto("/app/select-plan?plan=growth&cycle=monthly");
    await page.waitForURL(/\/app\/settings.*#billing/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByTestId("billing-cycle-monthly")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("billing-plan-growth")).toHaveAttribute("aria-checked", "true");
  });

  test("public pricing CTA can become an activated trial and start checkout", async ({
    page,
  }, testInfo) => {
    requireProductionWrapper();
    test.setTimeout(180_000);

    const siteUrl = productionSiteUrl(testInfo);
    await page.goto(`${siteUrl}/pricing`);

    const annualGrowthCta = page.locator("a[href*='plan=growth'][href*='cycle=annual']").first();
    await expect(annualGrowthCta).toBeVisible();
    const signupHref = await annualGrowthCta.getAttribute("href");
    expect(signupHref).toBeTruthy();
    expect(signupHref).toContain("plan=growth");
    expect(signupHref).toContain("cycle=annual");
    expect(signupHref).not.toContain("promo=");

    const credentials = createE2ECredentials();
    await signUpAndCompleteOnboarding(page, credentials, signupHref!, {
      expectFundsLanding: false,
    });

    await page.goto("/app/select-plan?plan=growth&cycle=annual", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(/\/app\/settings.*#billing/, { timeout: 30_000 });
    await expect(page.getByTestId("billing-cycle-annual")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("billing-plan-growth")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: /Add billing details for Growth/ }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com|stripe\.com/, { timeout: 30_000 });
  });
});
