import { expect, test } from "@playwright/test";
import { getLocalSiteOrigin, getLocalWebOrigin } from "../scripts/lib/local-dev-config";

test.describe("canonical app links", () => {
  test("marketing sign-in opens the routed /app login screen", async ({ page }) => {
    await page.goto(getLocalSiteOrigin());

    const signIn = page.getByRole("link", { name: "Sign in" }).first();
    await expect(signIn).toHaveAttribute("href", `${getLocalWebOrigin()}/app/login`);
    await signIn.click();

    await expect(page).toHaveURL(`${getLocalWebOrigin()}/app/login`);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("the marketing signup bridge opens the routed /app signup screen", async ({ page }) => {
    await page.goto(`${getLocalSiteOrigin()}/signup/`);

    await expect(page).toHaveURL(`${getLocalWebOrigin()}/app/signup`);
    await expect(
      page.getByRole("heading", { name: "Start a 1-month GrantPipe trial" }),
    ).toBeVisible();
  });
});
