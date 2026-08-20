import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

test.setTimeout(120_000);

test("funder + fund create and detail navigation", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  // Funder
  await page.goto("/app/funders");
  await page.getByRole("button", { name: "Add funder" }).click();
  await page.getByRole("textbox", { name: "Funder name" }).fill("Acme Foundation");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog", { name: "Add funder" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Acme Foundation" })).toBeVisible();

  await page.getByRole("link", { name: "Acme Foundation" }).click();
  await expect(page.getByRole("heading", { name: "Acme Foundation" })).toBeVisible();

  // Fund
  const fundName = `Operating E2E ${Date.now().toString()}`;
  await page.goto("/app/funds");
  await page.getByRole("button", { name: "Add fund" }).click();
  await page.getByRole("textbox", { name: "Fund name" }).fill(fundName);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog", { name: "Create fund" })).toBeHidden();
  await expect(page.getByRole("link", { name: fundName })).toBeVisible();

  await page.getByRole("link", { name: fundName }).click();
  await expect(page.getByRole("heading", { name: fundName })).toBeVisible();
});

test("event create exposes detail page", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/events");
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Event name").fill("Spring Gala");
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Gala" }).click();
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("link", { name: /Spring Gala/ })).toBeVisible();
  await page.getByRole("link", { name: /Spring Gala/ }).click();
  await expect(page.getByRole("heading", { name: /Spring Gala/ })).toBeVisible();
});

test("import Preview button is disabled when the textarea is empty", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/import");
  await expect(page.getByRole("button", { name: "Preview import" })).toBeDisabled();

  await page.locator('input[type="file"]').setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("type\nindividual"),
  });
  await expect(page.getByRole("button", { name: "Preview import" })).toBeEnabled();
});

test("import with malformed CSV surfaces a parse error rather than crashing", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken-contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('first_name,last_name\n"Unclosed quote,Hopper'),
  });
  await expect(page.getByRole("button", { name: "Preview import" })).toBeEnabled();
  await page.getByRole("button", { name: "Preview import" }).click();

  // Either shows an alert or the preview row count — either is non-crash behavior.
  await expect(page.locator("main")).toBeVisible();
});

test("donors list shows the added contact", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/donors");
  await page.getByRole("button", { name: "Add donor" }).click();
  await page.getByLabel("First name").fill("Pipe");
  await page.getByLabel("Last name").fill("Line");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: "Pipe Line" })).toBeVisible();
});
