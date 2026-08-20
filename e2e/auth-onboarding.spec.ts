import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

test.setTimeout(240_000);

test("signs up, completes onboarding, and lands in the authenticated app", async ({ page }) => {
  const credentials = createE2ECredentials();

  await signUpAndCompleteOnboarding(page, credentials, "/app/signup", {
    expectFundsLanding: false,
  });

  const session = await page.request.get("/api/auth/session");
  expect(session.ok()).toBe(true);
  const body = (await session.json()) as {
    onboardingCompleted?: unknown;
    orgId?: unknown;
    user?: unknown;
  };
  expect(body.user).toBeTruthy();
  expect(body.orgId).toBeTruthy();
  expect(body.onboardingCompleted).toBe(true);
});
