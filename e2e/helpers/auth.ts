import { expect, type Page } from "@playwright/test";

import { assertProductionE2ECanMutate, type EnvLike } from "../../scripts/lib/live-e2e-proof";

export function assertCleanupWrappedLiveE2E({
  targetUrl,
  env = process.env,
}: {
  targetUrl: string;
  env?: EnvLike;
}) {
  assertProductionE2ECanMutate({ targetUrl, env });
}

export function createE2ECredentials() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    email: `e2e-${runId}@grantpipe.test`,
    password: `GrantPipe-${runId}!`,
    name: "GrantPipe E2E",
    orgName: `GrantPipe E2E Org ${runId}`,
  };
}

async function completePlanSelectionIfPrompted(page: Page) {
  await page.waitForURL(/\/app\/(funds|settings#billing|select-plan)/, {
    timeout: 30_000,
  });

  if (page.url().includes("/app/select-plan")) {
    const legacyPlanHeading = page.getByRole("heading", {
      name: "Try any plan free for a month",
    });
    if (await legacyPlanHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const selectedPlan = new URL(page.url()).searchParams.get("plan");
      const planLabel = selectedPlan ? `Start ${selectedPlan.replace(/-/g, " ")}` : undefined;
      const planButton = planLabel
        ? page.getByRole("button", { name: new RegExp(`^${planLabel}$`, "i") })
        : page.getByRole("button", { name: /^Start / }).first();

      await planButton.click();
    }
    await page.waitForURL(/\/app\/(funds|settings#billing)/, {
      timeout: 30_000,
    });
  }

  if (page.url().includes("/app/settings#billing")) {
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible({
      timeout: 30_000,
    });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/org/billing/selection") && response.ok(),
      ),
      page.getByRole("button", { name: "Save selection" }).click(),
    ]);

    await expect
      .poll(
        async () => {
          const response = await page.request.get("/api/auth/session");
          if (!response.ok()) {
            return `session:${response.status().toString()}`;
          }

          const payload = (await response.json()) as {
            planSelectionCompleted?: unknown;
            orgSubscription?: { planSelectedAt?: unknown } | null;
          };
          return payload.planSelectionCompleted === true ||
            payload.orgSubscription?.planSelectedAt != null
            ? "selected"
            : "missing";
        },
        { timeout: 30_000 },
      )
      .toBe("selected");
  }
}

export async function signUpAndCompleteOnboarding(
  page: Page,
  credentials: ReturnType<typeof createE2ECredentials>,
  signupUrl = "/app/signup",
  options: { expectFundsLanding?: boolean } = {},
) {
  await page.goto(signupUrl);
  assertCleanupWrappedLiveE2E({ targetUrl: page.url() });

  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByRole("textbox", { name: "Password" }).fill(credentials.password);
  await page.getByRole("button", { name: "Start your free trial" }).click();

  const onboardingHeading = page.getByRole("heading", {
    name: "Welcome to GrantPipe",
  });
  const manualLoginMessage = page.getByText("Your account is ready. Sign in to continue.");

  await expect(onboardingHeading.or(manualLoginMessage)).toBeVisible({
    timeout: 30_000,
  });

  if (await manualLoginMessage.isVisible()) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.waitForTimeout(attempt === 0 ? 5_000 : 3_000);
      const response = await page.request.post("/api/auth/better/sign-in/email", {
        data: {
          email: credentials.email,
          password: credentials.password,
          callbackURL: "/app/onboarding",
        },
        failOnStatusCode: false,
      });

      if (response.ok()) {
        await page.goto("/app/onboarding");
        if (await onboardingHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
          break;
        }
      }
    }

    if (!(await onboardingHeading.isVisible().catch(() => false))) {
      await page.goto("/app/login");
      await page.getByLabel("Email").fill(credentials.email);
      await page.getByRole("textbox", { name: "Password" }).fill(credentials.password);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(onboardingHeading).toBeVisible({ timeout: 30_000 });
    }
  }

  await expect(onboardingHeading).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: /Manage grants and funds/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("textbox", { name: "Organization name" }).fill(credentials.orgName);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "See how it works" })).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/sample-data") && response.ok(),
    ),
    page.getByRole("button", { name: "Show me around" }).click(),
  ]);

  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/auth/session");
        if (!response.ok()) {
          return false;
        }
        const payload = (await response.json()) as {
          onboardingCompleted?: unknown;
        };
        return payload.onboardingCompleted === true;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  const expectFundsLanding = options.expectFundsLanding ?? true;
  await completePlanSelectionIfPrompted(page);

  if (expectFundsLanding) {
    await page.goto("/app/funds", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app\/funds$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Funds" })).toBeVisible();
  }
}
