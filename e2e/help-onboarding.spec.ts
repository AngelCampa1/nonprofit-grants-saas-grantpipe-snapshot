import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

test("help center and onboarding guidance work on desktop and mobile", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await expect(page).toHaveURL(/\/app\/funds$/);
  await expect(page.getByRole("heading", { name: "Funds" })).toBeVisible();
  await expect(page.getByText("We added sample data to your account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Budget Sentinel" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help" }).first()).toBeVisible();

  await page.goto("/app/help");
  await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
  await expect(page.getByText("Open a downloaded report")).toBeVisible();

  await page.getByLabel("Search help").fill("pdf");
  await expect(page.getByText("Downloads folder")).toBeVisible();
  await expect(page.getByText("Import contacts from a spreadsheet")).not.toBeVisible();

  await page.getByLabel("Search help").fill("printer cable");
  await expect(page.getByText("No guide matches that search.")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/help");
  await page.getByLabel("Help category").click();
  await page.getByRole("option", { name: "Reports" }).click();

  await expect(page.getByText("Generate a report")).toBeVisible();
  await expect(page.getByText("Open a downloaded report")).toBeVisible();
  await expect(page.getByText("Set up your workspace")).not.toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
