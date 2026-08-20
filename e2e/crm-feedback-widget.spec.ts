/**
 * E2E: CRM feedback widget — loader script mounts in authenticated shell
 *
 * The test signs up, completes onboarding, and then asserts that the CRM
 * loader `<script data-widget="feedback-button">` has been injected into the
 * DOM.
 *
 * IMPORTANT — local vs. production behaviour:
 * The CRM enforces an origin allowlist server-side. On localhost the loader
 * fetch is silently rejected by the CRM, so we do NOT assert a successful
 * ingest or any rendered widget UI — only that the <script> tag is present.
 *
 * ENVIRONMENT:
 * Set VITE_CRM_WIDGET_KEY in apps/web/.env.local (gitignored) before running:
 *   VITE_CRM_WIDGET_KEY=wk_LOCALTESTPLACEHOLDER00000000000000
 * Without this var the component is a no-op and this test will fail.
 */

import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

test("CRM loader script is injected into the authenticated shell", async ({ page }) => {
  test.skip(
    !process.env.VITE_CRM_WIDGET_KEY,
    "VITE_CRM_WIDGET_KEY is required to inject the CRM feedback widget locally.",
  );

  const credentials = createE2ECredentials();

  await signUpAndCompleteOnboarding(page, credentials);

  // We should now be in the authenticated app.
  await expect(page).toHaveURL(/\/app\/funds$/);

  // The CrmFeedbackWidget useEffect injects a <script> tag into document.body.
  // We only assert its presence in the DOM — not that the CRM accepted the request
  // (the local origin is not on the CRM's allowlist and the fetch will no-op).
  const scriptHandle = await page.evaluateHandle(() =>
    document.querySelector("script[data-widget='feedback-button']"),
  );
  const scriptElement = scriptHandle.asElement();

  expect(scriptElement).not.toBeNull();

  const dataProd = await page.evaluate((el) => el?.getAttribute("data-product"), scriptElement);
  const dataWidget = await page.evaluate((el) => el?.getAttribute("data-widget"), scriptElement);
  const src = await page.evaluate((el) => (el as HTMLScriptElement | null)?.src, scriptElement);

  expect(dataProd).toBeTruthy();
  expect(dataWidget).toBe("feedback-button");
  expect(src).toContain("/w/v1.js");
});
